# Unified Leads Architecture — Above All CRM

## Purpose
All Above All CRM tools must share a **single leads table** (`public.leads`) as the source of truth. New leads from any source (Bonzo, GHL, webhook, CSV, manual) appear in every tool automatically. No duplicates.

---

## Current State (Problems)

| Table | Rows | Used By | Schema |
|-------|------|---------|--------|
| `leads` | 1,629 | Carbon HELOC | first_name, last_name, email, phone, metadata JSONB, 67 columns |
| `contacts` | 61 | Campaigns/older tools | first_name, last_name, email, phone |
| `reactivation_clients` | 227 | Reactivation tool | name (single field), email, phone |
| `lo_leads` | 0 | Unused | — |

**Overlap:** 54 contacts and 75 reactivation_clients already exist in `leads` (matched by email). Data is siloed — a Bonzo lead only appears in Carbon HELOC, not in Refi or Campaigns.

**Dedup within `leads`:** Zero duplicate emails (bonzo-webhook dedup is working).

---

## Target Architecture

### Single Source of Truth: `public.leads`

The `leads` table is the canonical leads store. All tools READ from and WRITE to this table.

**Key columns every tool must use:**

```
id              UUID PRIMARY KEY
user_id         UUID NOT NULL (FK → auth.users)
first_name      TEXT
last_name       TEXT
email           TEXT
phone           TEXT
status          TEXT (new, contacted, qualified, quoted, application_sent, in_underwriting, approved, docs_out, funded, on_hold, lost, reactivation, archived)
source          TEXT (manual, ghl, bonzo, csv, webhook, leadmailbox, zapier, n8n, carbon-refi)
crm_source      TEXT
crm_contact_id  TEXT (Bonzo prospect ID or GHL contact ID)
metadata        JSONB (tool-specific data goes here)
tags            TEXT[] (array of tags)
dnc             BOOLEAN
created_at      TIMESTAMPTZ
updated_at      TIMESTAMPTZ
funded_at       TIMESTAMPTZ
quote_sent_at   TIMESTAMPTZ
deleted_at      TIMESTAMPTZ (soft delete — never hard delete)
```

### Tool-Specific Data Goes in `metadata` JSONB

Each tool stores its own data inside `metadata` under a namespaced key:

```jsonc
{
  // Shared fields (any tool can read/write)
  "credit_score": "759",
  "property_address": "123 Main St",
  "home_value": "500000",
  "mortgage_balance": "200000",
  "cash_out": "100000",
  "loan_type": "HELOC",
  "property_type": "Primary Residence",

  // Tool-specific namespaces
  "heloc": { "quote_id": "...", "tier": 1, "rate": "6.88" },
  "refi": { "current_rate": "7.5", "target_rate": "6.0", "savings": "450" },
  "campaign": { "last_campaign_id": "...", "last_sent_at": "..." },
  "reactivation": { "original_funded_at": "...", "days_since_funded": 180 },

  // CRM raw data
  "raw": { /* original webhook payload */ },
  "bonzo_tags": ["qualified", "heloc"],
  "last_webhook_at": "2026-03-26T05:15:58Z"
}
```

---

## Deduplication Rules (CRITICAL)

When inserting a new lead, check in this order:

### 1. Email match (case-insensitive)
```sql
SELECT id FROM leads
WHERE user_id = $user_id
AND LOWER(TRIM(email)) = LOWER(TRIM($new_email))
LIMIT 1;
```

### 2. Phone match (digits-only)
```sql
-- Extract digits, compare last 10
SELECT id FROM leads
WHERE user_id = $user_id
AND REGEXP_REPLACE(phone, '\D', '', 'g') = REGEXP_REPLACE($new_phone, '\D', '', 'g')
LIMIT 1;
```

### 3. CRM contact ID match
```sql
SELECT id FROM leads
WHERE user_id = $user_id
AND crm_contact_id = $bonzo_id
LIMIT 1;
```

### If match found → UPDATE (merge new data, don't overwrite existing)
### If no match → INSERT new lead

### Merge rules:
- **Never overwrite** a non-empty field with empty
- **Always update** `metadata.raw` with latest webhook payload
- **Always update** `updated_at` timestamp
- **Append** to `tags[]`, don't replace
- **Status**: only update if new status is "more advanced" in the pipeline (don't regress from `funded` to `new`)

---

## Database Enforcement

### Unique partial index (prevents duplicates at DB level)
```sql
CREATE UNIQUE INDEX IF NOT EXISTS leads_user_email_unique
ON leads (user_id, LOWER(TRIM(email)))
WHERE email IS NOT NULL AND email != '' AND deleted_at IS NULL;
```

### RPC function for safe upsert (all tools should use this)
```sql
CREATE OR REPLACE FUNCTION upsert_lead(
  p_user_id UUID,
  p_first_name TEXT DEFAULT NULL,
  p_last_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_source TEXT DEFAULT 'manual',
  p_status TEXT DEFAULT 'new',
  p_crm_contact_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS TABLE(lead_id UUID, is_new BOOLEAN) AS $$
DECLARE
  v_existing UUID;
  v_email TEXT := LOWER(TRIM(p_email));
  v_phone_digits TEXT := REGEXP_REPLACE(COALESCE(p_phone,''), '\D', '', 'g');
BEGIN
  -- 1. Email match
  IF v_email != '' THEN
    SELECT id INTO v_existing FROM leads
    WHERE user_id = p_user_id AND LOWER(TRIM(email)) = v_email AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  -- 2. Phone match
  IF v_existing IS NULL AND LENGTH(v_phone_digits) >= 7 THEN
    SELECT id INTO v_existing FROM leads
    WHERE user_id = p_user_id AND deleted_at IS NULL
    AND REGEXP_REPLACE(COALESCE(phone,''), '\D', '', 'g') = v_phone_digits
    LIMIT 1;
  END IF;

  -- 3. CRM ID match
  IF v_existing IS NULL AND p_crm_contact_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM leads
    WHERE user_id = p_user_id AND crm_contact_id = p_crm_contact_id AND deleted_at IS NULL
    LIMIT 1;
  END IF;

  IF v_existing IS NOT NULL THEN
    -- UPDATE existing (merge, don't overwrite)
    UPDATE leads SET
      first_name = COALESCE(NULLIF(first_name,''), p_first_name, first_name),
      last_name = COALESCE(NULLIF(last_name,''), p_last_name, last_name),
      email = COALESCE(NULLIF(email,''), p_email, email),
      phone = COALESCE(NULLIF(phone,''), p_phone, phone),
      crm_contact_id = COALESCE(crm_contact_id, p_crm_contact_id),
      metadata = metadata || p_metadata,
      updated_at = NOW()
    WHERE id = v_existing;
    RETURN QUERY SELECT v_existing, false;
  ELSE
    -- INSERT new
    RETURN QUERY
    INSERT INTO leads (user_id, first_name, last_name, email, phone, source, crm_source, crm_contact_id, status, metadata, created_at, updated_at)
    VALUES (p_user_id, p_first_name, p_last_name, p_email, p_phone, p_source, p_source, p_crm_contact_id, p_status, p_metadata, NOW(), NOW())
    RETURNING id, true;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

---

## Migration Plan

### Phase 1: Create the upsert_lead RPC + unique index
- Deploy the `upsert_lead` function above
- Create the unique partial index on `(user_id, LOWER(TRIM(email)))`
- All new lead ingestion should use `upsert_lead` instead of raw INSERT

### Phase 2: Migrate existing data into `leads`
```sql
-- Merge contacts → leads (skip existing)
INSERT INTO leads (user_id, first_name, last_name, email, phone, source, metadata, created_at, updated_at)
SELECT c.user_id, c.first_name, c.last_name, c.email, c.phone, 'campaign',
  jsonb_build_object('migrated_from', 'contacts', 'original_id', c.id::text),
  c.created_at, NOW()
FROM contacts c
WHERE NOT EXISTS (
  SELECT 1 FROM leads l
  WHERE l.user_id = c.user_id AND LOWER(TRIM(l.email)) = LOWER(TRIM(c.email))
)
AND c.email IS NOT NULL AND c.email != '';

-- Merge reactivation_clients → leads (skip existing)
INSERT INTO leads (user_id, first_name, last_name, email, phone, source, status, metadata, created_at, updated_at)
SELECT r.user_id,
  SPLIT_PART(r.name, ' ', 1),
  SUBSTRING(r.name FROM POSITION(' ' IN r.name) + 1),
  r.email, r.phone, 'reactivation', 'reactivation',
  jsonb_build_object('migrated_from', 'reactivation_clients', 'original_id', r.id::text),
  r.created_at, NOW()
FROM reactivation_clients r
WHERE NOT EXISTS (
  SELECT 1 FROM leads l
  WHERE l.user_id = r.user_id AND LOWER(TRIM(l.email)) = LOWER(TRIM(r.email))
)
AND r.email IS NOT NULL AND r.email != '';
```

### Phase 3: Create compatibility views
```sql
-- Old tools that query `contacts` now hit a view over `leads`
CREATE OR REPLACE VIEW contacts_v AS
SELECT id, user_id, first_name, last_name, email, phone, status, source, metadata, created_at, updated_at
FROM leads WHERE deleted_at IS NULL;

-- Old tools that query `reactivation_clients` now hit a view
CREATE OR REPLACE VIEW reactivation_clients_v AS
SELECT id, user_id,
  COALESCE(first_name || ' ' || last_name, first_name, last_name) as name,
  email, phone, funded_at, status, metadata, created_at
FROM leads WHERE deleted_at IS NULL AND (status = 'reactivation' OR status = 'funded');
```

### Phase 4: Update all tools to query `leads`
Every app should:
1. **READ** from `leads` table directly (or use the view if minimal changes needed)
2. **WRITE** via `upsert_lead()` RPC (guaranteed dedup)
3. Store tool-specific data in `metadata.{tool_name}` namespace

---

## Edge Function Integration Points

All these edge functions already write to `leads` — update them to use `upsert_lead()`:

| Function | Action | Current | Target |
|----------|--------|---------|--------|
| `bonzo-webhook` | Inbound leads from Bonzo | Raw INSERT with manual dedup | Use `upsert_lead()` |
| `bonzo-sync` | Bulk import from Bonzo API | Raw INSERT with in-memory dedup | Use `upsert_lead()` |
| `ghl-webhook` | Inbound leads from GHL | Raw INSERT | Use `upsert_lead()` |
| `handle-ghl-webhook` | GHL event handler | Raw INSERT | Use `upsert_lead()` |

---

## How Each Tool Should Query Leads

### Carbon HELOC
```js
sb.from('leads').select('*').eq('user_id', userId).order('created_at', { ascending: false })
```
No changes needed — already queries `leads`.

### Carbon Refi
```js
// Change from: sb.from('refi_leads') or sb.from('lo_leads')
// Change to:
sb.from('leads').select('*').eq('user_id', userId).order('created_at', { ascending: false })
```
Store refi-specific data in `metadata.refi`.

### Campaigns / Email Tool
```js
// Change from: sb.from('contacts')
// Change to:
sb.from('leads').select('*').eq('user_id', userId).is('deleted_at', null)
```

### Reactivation Tool
```js
// Change from: sb.from('reactivation_clients')
// Change to:
sb.from('leads').select('*').eq('user_id', userId).in('status', ['funded', 'reactivation'])
```

---

## Dedup Guarantees Summary

| Layer | Mechanism | Prevents |
|-------|-----------|----------|
| **DB unique index** | `leads_user_email_unique` | Same email inserted twice |
| **RPC upsert_lead()** | Email → Phone → CRM ID check | Duplicates from any source |
| **bonzo-webhook** | Rejects `messages.*` events + empty payloads | Junk/non-contact data |
| **bonzo-sync** | In-memory dedup index before INSERT | Bulk import duplicates |
| **Application layer** | 3-layer check (email, phone digits, CRM ID) | Edge cases missed by DB |

---

## Supabase Project
- **Project ID:** `czzabvfzuxhpdcowgvam`
- **URL:** `https://czzabvfzuxhpdcowgvam.supabase.co`
- **Table:** `public.leads` (single source of truth)
- **RPC:** `upsert_lead()` (all tools use this for writes)

---

## Implementation Checklist

- [ ] Deploy `upsert_lead()` RPC function
- [ ] Create unique partial index on `leads(user_id, email)`
- [ ] Migrate `contacts` → `leads` (skip existing)
- [ ] Migrate `reactivation_clients` → `leads` (skip existing)
- [ ] Update `bonzo-webhook` to use `upsert_lead()`
- [ ] Update `bonzo-sync` to use `upsert_lead()`
- [ ] Update Carbon Refi to query `leads` table
- [ ] Update Campaign tool to query `leads` table
- [ ] Update Reactivation tool to query `leads` table
- [ ] Create compatibility views for legacy code
- [ ] Test: Bonzo lead appears in all tools
- [ ] Test: No duplicates after sync from multiple sources
- [ ] Test: Status changes in one tool reflect in others
