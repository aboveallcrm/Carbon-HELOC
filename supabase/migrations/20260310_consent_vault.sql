-- ============================================================
-- CONSENT VAULT — TCPA Compliance (already existed)
-- This table was pre-created with a comprehensive schema.
-- This migration only adds the missing super_admin RLS policy.
-- ============================================================

-- Existing columns: id, user_id, lead_id, phone, email, consent_type,
--   consent_source, consent_text, opted_in_at, revoked_at, revoke_method,
--   is_active, channels_allowed, dnc_listed, dnc_listed_at, timezone,
--   tcpa_compliant_hours, ip_address, metadata, created_at, updated_at,
--   provider, opted_out

-- Add super admin full access policy (was missing)
DROP POLICY IF EXISTS "consent_vault_sa_all" ON consent_vault;
CREATE POLICY "consent_vault_sa_all" ON consent_vault
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

SELECT 'consent_vault super admin policy added' AS result;
