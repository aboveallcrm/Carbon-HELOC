# Above All Carbon HELOC — Super Admin Guide

## Access

- **Who**: Eddie Barragan only (`barraganmortgage@gmail.com`)
- **UUID**: `795aea13-6aba-45f2-97d4-04576f684557`
- **Tab**: "Super Admin" — visible only to super_admin role
- **RLS**: All tables have a `{table}_sa_all` policy granting full access to this UUID

---

## Super Admin Tab Sections

### 1. User Management Table

**Columns**: Email | Role | Tier | Status | Created | Actions

**Search & Filter**:
- Search by email or name
- Filter by role (user/admin/super_admin)
- Filter by tier (all tiers)
- Filter by status (trialing/active/canceled)

**Export**: "Export CSV" — downloads all users with metadata

---

### 2. Edit User Modal

Clicking any user opens a modal with:

| Field | Options | Notes |
|-------|---------|-------|
| Role | user / admin / super_admin | Affects tab visibility |
| Tier | carbon / titanium / platinum / obsidian / diamond | Affects feature access |
| Subscription Status | trialing / active / canceled | Display only, tracks billing |
| Discount | 0–100% | Stored in profiles.discount |
| Billing Notes | free text | Internal notes, shown in modal only |

**Save**: writes to `profiles` table.

---

### 3. Delete User

- Confirmation modal: "Are you sure? This cannot be undone."
- Deletes from `auth.users` (cascades to profiles, leads, quotes, etc.)
- Cannot delete super_admin (self-protection)

---

### 4. Impersonate User (View As)

Opens the full app UI as if you were that user:
- Loads their tier/role permissions
- Shows their quotes, leads, rates, profile
- **Duration**: 1 hour (auto-expires, session token invalidates)
- **Read-only mode option**: prevents saving/sending
- **Orange banner**: "Viewing as [user@email.com] — [Read Only / Full Access]"
- **Exit button**: "Stop Impersonating"

**Use cases**:
- Debugging a user's issue
- Setting up their integrations on their behalf
- Verifying their tier access looks correct
- Onboarding support

**Implementation**:
- `impersonateUser(targetUserId, readOnly)` in auth.js
- `getEffectiveUser(realUser)` checks for active impersonation session
- Stored in sessionStorage (not localStorage — clears on tab close)

---

### 5. Per-User API Key Management

From the Super Admin tab, manage integration keys for any user without them needing to enter their own:

| Key | Stored Field | Notes |
|-----|-------------|-------|
| AI Provider | `heloc_keys.metadata.ai_provider` | openai/gemini/anthropic/etc |
| AI API Key | `heloc_keys.metadata.ai_api_key` | Their own key or platform key |
| AI Model | `heloc_keys.metadata.ai_model` | Default model to use |
| GHL API Key | `heloc_keys.metadata.ghl_api_key` | GoHighLevel |
| Bonzo Xcode | `heloc_keys.metadata.bonzo_api_key` | Xcode hash |
| Bonzo API Key | `heloc_keys.metadata.bonzo_api_key_2` | JWT Bearer |
| n8n Webhook | `heloc_keys.metadata.n8n_webhook_url` | n8n instance URL |
| FUB API Key | `heloc_keys.metadata.fub_api_key` | Follow Up Boss |

These override the user's self-configured keys. Useful when onboarding a new LO — you can pre-configure everything for them.

---

## RLS Policies for Super Admin

### Profiles Table — Hardcoded UUID
```sql
-- Must use hardcoded UUID here — is_super_admin() causes infinite recursion on profiles
CREATE POLICY "profiles_sa_all" ON profiles
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);
```

### All Other Tables — is_super_admin() Function
```sql
-- is_super_admin() is SECURITY DEFINER, bypasses RLS on profiles
CREATE POLICY "leads_sa_all" ON leads
    FOR ALL USING (is_super_admin());

CREATE POLICY "quotes_sa_all" ON quotes
    FOR ALL USING (is_super_admin());
-- etc.
```

### is_super_admin() Function
```sql
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid;
END;
$$;
```

---

## System Config (Super Admin)

- **Feature flag toggles**: enable/disable features platform-wide
- **Rate limit overrides**: increase/decrease quote-chat rate limits
- **Email domain verification**: check Resend domain status
- **Platform AI key pool**: manage the shared API key pool for users without their own keys
- **Maintenance mode**: take platform offline for updates

---

## Billing & Subscription Management

Managed manually via the super admin panel (no Stripe integration currently):
1. User signs up → default tier: `carbon`, status: `trialing`
2. When user pays: super admin changes tier + status to `active`
3. If cancels: super admin changes status to `canceled`
4. Discounts: enter % in edit modal → affects displayed pricing in UI

---

## Audit Trail

### dnc_overrides Table
Every DNC override requires a reason and is logged:
- Who overrode (user_id)
- Which lead (lead_id, contact info)
- Where DNC was detected (local/ghl/bonzo)
- Reason given
- Timestamp

Super admin can query this table for TCPA compliance audits.

### lead_stage_history Table
Every lead status change is recorded:
- lead_id, previous stage, new stage
- entered_at, exited_at
- Used for pipeline velocity analysis

### click_notifications Table
Every quote link click that triggered an LO notification:
- link_id, lead_id, click data
- Status (pending/sent/failed)

---

## Common Super Admin Tasks

### Upgrade a User's Tier
1. Open Super Admin tab
2. Search for user by email
3. Click "Edit"
4. Change tier → Save
5. User gets new features immediately on next page load

### Pre-Configure a New LO
1. Have LO register at login.html (gets carbon tier default)
2. Open Super Admin tab → find their account
3. Set role/tier/status
4. Go to "API Keys" section for that user
5. Enter their Bonzo keys, GHL keys, n8n URL
6. They can log in and are ready to use the platform

### Debug a User Issue
1. Find user in Super Admin tab
2. Click "View As" (read-only)
3. Reproduce the issue in their context
4. Exit impersonation
5. Fix at code/DB level

### Check Integration Health
```sql
-- Check who has Bonzo configured
SELECT u.email, ui.metadata->'bonzo'->>'apiKey2' IS NOT NULL as has_bonzo_key
FROM user_integrations ui
JOIN auth.users u ON u.id = ui.user_id
WHERE ui.provider = 'heloc_settings';

-- Check recent click notification failures
SELECT cn.*, l.slug FROM click_notifications cn
JOIN links l ON l.id = cn.link_id
WHERE cn.status = 'failed'
ORDER BY cn.created_at DESC LIMIT 20;
```
