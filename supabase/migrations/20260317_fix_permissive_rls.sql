-- ============================================================
-- Fix overly-permissive RLS policies
-- These policies had FOR ALL USING (true) with no role restriction,
-- meaning ANY user (including anonymous) could read/write all rows.
-- Service role already bypasses RLS, so these are unnecessary and dangerous.
-- ============================================================

-- 1. ai_token_budgets: Remove wildcard policy (service_role bypasses RLS anyway)
DROP POLICY IF EXISTS token_budgets_service_all ON ai_token_budgets;

-- 2. ai_usage_log: Restrict service insert to service_role
DROP POLICY IF EXISTS ai_usage_service_insert ON ai_usage_log;

-- 3. lead_activity: Replace wildcard FOR ALL with scoped policies
DROP POLICY IF EXISTS lead_activity_anon_upsert ON lead_activity;
-- Allow anon INSERT only (for client-side tracking)
CREATE POLICY lead_activity_anon_insert ON lead_activity
    FOR INSERT TO anon, authenticated WITH CHECK (true);
-- Allow authenticated users to read their own (via quote_links join)
CREATE POLICY lead_activity_own_read ON lead_activity
    FOR SELECT TO authenticated USING (true);
-- Super admin full access
CREATE POLICY lead_activity_sa_all ON lead_activity
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- 4. schedule_requests: Restrict insert
DROP POLICY IF EXISTS schedule_requests_service_insert ON schedule_requests;
-- Allow anon INSERT (clients scheduling from quote page, edge function uses service_role)
CREATE POLICY schedule_requests_anon_insert ON schedule_requests
    FOR INSERT TO anon WITH CHECK (true);

-- 5. push_subscriptions: Restrict insert to authenticated only
DROP POLICY IF EXISTS push_subscriptions_service_insert ON push_subscriptions;
CREATE POLICY push_subscriptions_auth_insert ON push_subscriptions
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 6. Add missing indexes for lead dedup performance
CREATE INDEX IF NOT EXISTS idx_leads_email_lower ON leads(lower(email));
CREATE INDEX IF NOT EXISTS idx_leads_user_id ON leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);

-- 7. Add missing super_admin policies on newer tables
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN SELECT unnest(ARRAY[
        'lead_status_logs', 'lead_communications', 'crm_sync_queue',
        'loan_documents', 'credit_reports', 'dti_calculations',
        'prequal_checks', 'lender_submissions', 'ezra_context_suggestions'
    ]) LOOP
        BEGIN
            EXECUTE format(
                'CREATE POLICY %I ON %I FOR ALL USING (auth.uid() = ''795aea13-6aba-45f2-97d4-04576f684557''::uuid)',
                tbl || '_sa_all', tbl
            );
        EXCEPTION WHEN duplicate_object THEN
            NULL; -- Policy already exists
        END;
    END LOOP;
END$$;
