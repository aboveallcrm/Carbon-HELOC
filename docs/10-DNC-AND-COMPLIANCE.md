# Above All Carbon HELOC — DNC & TCPA Compliance

## Overview

The platform has a 3-layer DNC (Do Not Contact) protection system that runs before any outbound communication — SMS, email, or Bonzo/GHL push. All overrides are logged for TCPA audit trails.

---

## 3-Layer DNC Check

Before `sendViaGHL()` or `sendViaBonzo()` runs, the system checks:

### Layer 1: Local Database Flag
```javascript
// Check leads.dnc column
if (lead.dnc === true) {
    _dncSources.push({ source: 'Local DNC Flag', reason: lead.dnc_reason, badge: 'LOCAL' });
}
```

### Layer 2: GoHighLevel DND
```javascript
// Check GHL contact fields
if (contact.dnd === true) {
    _dncSources.push({ source: 'GHL Do Not Disturb', reason: 'DND enabled in GoHighLevel', badge: 'GHL DND' });
}
```

### Layer 3: Bonzo Tags
```javascript
// Search Bonzo contact, check tags
const DNC_TAGS = ['DNC', 'STOP', 'unsubscribed'];
// if any DNC_TAG found in contact.tags:
_dncSources.push({ source: 'Bonzo DNC Tag', reason: 'Tag "DNC" found', badge: 'BONZO' });
```

### Result
- **No DNC sources**: proceed with send
- **Any DNC source found**: show warning modal (z-index 110000), require reason to override

---

## DNC Warning Modal

Red modal that appears when DNC is detected:

```
⚠️ DNC WARNING

This contact has been flagged as Do Not Contact:
- [Source 1]: [Reason]
- [Source 2]: [Reason]

Are you absolutely sure you want to contact this person?
This action will be logged for compliance review.

[Required: Enter reason for override]
[___________________________]

[Cancel (Safe)]  [Override & Send (Logged)]
```

- **Cancel**: closes modal, does NOT send
- **Override**: logs to `dnc_overrides` table, then proceeds with send
- Reason field is **required** — cannot override without reason text

---

## dnc_overrides Table (Audit Log)

Every override is permanently logged:

```sql
INSERT INTO dnc_overrides (user_id, lead_id, contact_info, source, reason, action, created_at)
VALUES (auth.uid(), lead_id, email_or_phone, dnc_source, override_reason, 'sent', NOW());
```

Super admin can review all overrides for TCPA compliance audits.

---

## DNC Column in Leads Table

- **Visual**: Red "DNC" badge in leads table row
- **Toggle**: Click badge → confirmation dialog
  - Enable DNC: "Mark this contact as Do Not Contact?"
  - Disable DNC: "Remove DNC flag? Ensure this complies with your policies"
- **Filter**: "Show DNC Leads" / "Hide DNC Leads" option in status dropdown
- **Lead detail modal**: shows DNC status + reason + last updated timestamp

---

## TCPA Conversation Logging

### log-conversation Edge Function
Every message sent through the platform can be logged:
- Channel: sms / email / chat
- Context: 'ezra' (LO) or 'quote-chat' (client)
- STOP detection triggers automatic opt-out

### STOP Keyword Detection
```
Triggers on: STOP, stop, Stop, UNSUBSCRIBE, unsubscribe, OPTOUT, opt out, opt-out
```

**When detected**:
1. Ezra acknowledges: "You've been removed from our contact list"
2. `log-conversation` edge function fires
3. INSERT into `consent_vault` with `opted_out = true`, `dnc_listed = true`
4. Stores: contact_info, consent_source='chat', revoke_method='stop_keyword'

---

## consent_vault Table

Comprehensive TCPA consent and revocation tracking:

```sql
-- Example: STOP keyword received via client chat
INSERT INTO consent_vault (
    user_id,           -- LO's user_id
    lead_id,           -- FK to leads
    contact_info,      -- phone or email
    consent_type,      -- 'sms' or 'email'
    consent_source,    -- 'website' | 'verbal' | 'signup' | 'chat'
    revoke_method,     -- 'stop_keyword' | 'email_unsubscribe' | 'manual'
    opted_out,         -- true
    dnc_listed,        -- true
    channels_allowed,  -- [] (empty = no channels)
    provider           -- 'bonzo' | 'ghl' | 'manual'
)
```

---

## Compliance Check Feature (Ezra)

Before sending any marketing copy, run it through Ezra's compliance checker:

**Violations Detected**:
| Violation | Example | Severity |
|-----------|---------|----------|
| Guaranteed approval | "You are guaranteed to qualify" | 🚫 DO NOT SEND |
| Rate guarantee | "Lock in this rate forever" | 🚫 DO NOT SEND |
| False fee claims | "Absolutely no closing costs" | 🚫 DO NOT SEND |
| Pressure tactics | "This offer expires in 1 hour" | ⚠️ REVIEW |
| Tax advice | "This is always tax deductible" | ⚠️ REVIEW |
| Income predictions | "Earn more with a HELOC" | ⚠️ REVIEW |
| Misleading comparisons | "Better than any bank" (unsubstantiated) | ⚠️ REVIEW |

**Safe language**: All factual statements with proper qualifications are OK.

---

## Regulatory Framework

The platform is designed to comply with:
- **TCPA** (Telephone Consumer Protection Act) — consent tracking, STOP handling
- **TILA** (Truth in Lending Act) — accurate rate disclosure, APR representation
- **RESPA** (Real Estate Settlement Procedures Act) — fee disclosure requirements
- **CAN-SPAM** — email opt-out handling

**Note**: The platform provides compliance tools but is not a substitute for legal counsel. Users are responsible for their own compliance.
