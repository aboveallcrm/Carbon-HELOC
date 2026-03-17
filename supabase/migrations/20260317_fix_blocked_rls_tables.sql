-- Migration: Fix 9 tables with RLS enabled but NO policies (all access silently blocked)
-- Also: Enable RLS on ezra_app_config (currently disabled)
-- Pattern: own-row access via user_id/created_by/uploaded_by, super_admin full access
-- Super admin UUID: 795aea13-6aba-45f2-97d4-04576f684557

BEGIN;

-- ============================================================
-- 1. feature_flags — app-wide config, no user_id
--    All authenticated can read; only super_admin can write
-- ============================================================
DROP POLICY IF EXISTS "feature_flags_authenticated_select" ON public.feature_flags;
CREATE POLICY "feature_flags_authenticated_select" ON public.feature_flags
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "feature_flags_sa_all" ON public.feature_flags;
CREATE POLICY "feature_flags_sa_all" ON public.feature_flags
  FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- ============================================================
-- 2. zapier_webhooks — owned via created_by
-- ============================================================
DROP POLICY IF EXISTS "zapier_webhooks_own_select" ON public.zapier_webhooks;
CREATE POLICY "zapier_webhooks_own_select" ON public.zapier_webhooks
  FOR SELECT TO authenticated USING (created_by = auth.uid());

DROP POLICY IF EXISTS "zapier_webhooks_own_insert" ON public.zapier_webhooks;
CREATE POLICY "zapier_webhooks_own_insert" ON public.zapier_webhooks
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "zapier_webhooks_own_update" ON public.zapier_webhooks;
CREATE POLICY "zapier_webhooks_own_update" ON public.zapier_webhooks
  FOR UPDATE TO authenticated USING (created_by = auth.uid());

DROP POLICY IF EXISTS "zapier_webhooks_own_delete" ON public.zapier_webhooks;
CREATE POLICY "zapier_webhooks_own_delete" ON public.zapier_webhooks
  FOR DELETE TO authenticated USING (created_by = auth.uid());

DROP POLICY IF EXISTS "zapier_webhooks_sa_all" ON public.zapier_webhooks;
CREATE POLICY "zapier_webhooks_sa_all" ON public.zapier_webhooks
  FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- ============================================================
-- 3. document_versions — owned via uploaded_by
-- ============================================================
DROP POLICY IF EXISTS "document_versions_own_select" ON public.document_versions;
CREATE POLICY "document_versions_own_select" ON public.document_versions
  FOR SELECT TO authenticated USING (uploaded_by = auth.uid());

DROP POLICY IF EXISTS "document_versions_own_insert" ON public.document_versions;
CREATE POLICY "document_versions_own_insert" ON public.document_versions
  FOR INSERT TO authenticated WITH CHECK (uploaded_by = auth.uid());

DROP POLICY IF EXISTS "document_versions_own_update" ON public.document_versions;
CREATE POLICY "document_versions_own_update" ON public.document_versions
  FOR UPDATE TO authenticated USING (uploaded_by = auth.uid());

DROP POLICY IF EXISTS "document_versions_own_delete" ON public.document_versions;
CREATE POLICY "document_versions_own_delete" ON public.document_versions
  FOR DELETE TO authenticated USING (uploaded_by = auth.uid());

DROP POLICY IF EXISTS "document_versions_sa_all" ON public.document_versions;
CREATE POLICY "document_versions_sa_all" ON public.document_versions
  FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- ============================================================
-- 4. signature_requests — no direct user_id; owned via document_id -> documents.uploaded_by
-- ============================================================
DROP POLICY IF EXISTS "signature_requests_own_select" ON public.signature_requests;
CREATE POLICY "signature_requests_own_select" ON public.signature_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = signature_requests.document_id
        AND d.uploaded_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "signature_requests_own_insert" ON public.signature_requests;
CREATE POLICY "signature_requests_own_insert" ON public.signature_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = signature_requests.document_id
        AND d.uploaded_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "signature_requests_own_update" ON public.signature_requests;
CREATE POLICY "signature_requests_own_update" ON public.signature_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = signature_requests.document_id
        AND d.uploaded_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "signature_requests_own_delete" ON public.signature_requests;
CREATE POLICY "signature_requests_own_delete" ON public.signature_requests
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = signature_requests.document_id
        AND d.uploaded_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "signature_requests_sa_all" ON public.signature_requests;
CREATE POLICY "signature_requests_sa_all" ON public.signature_requests
  FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- ============================================================
-- 5. data_export_requests — has user_id
-- ============================================================
DROP POLICY IF EXISTS "data_export_requests_own_select" ON public.data_export_requests;
CREATE POLICY "data_export_requests_own_select" ON public.data_export_requests
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "data_export_requests_own_insert" ON public.data_export_requests;
CREATE POLICY "data_export_requests_own_insert" ON public.data_export_requests
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "data_export_requests_own_update" ON public.data_export_requests;
CREATE POLICY "data_export_requests_own_update" ON public.data_export_requests
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "data_export_requests_sa_all" ON public.data_export_requests;
CREATE POLICY "data_export_requests_sa_all" ON public.data_export_requests
  FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- ============================================================
-- 6. consent_records — has user_id
-- ============================================================
DROP POLICY IF EXISTS "consent_records_own_select" ON public.consent_records;
CREATE POLICY "consent_records_own_select" ON public.consent_records
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "consent_records_own_insert" ON public.consent_records;
CREATE POLICY "consent_records_own_insert" ON public.consent_records
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "consent_records_own_update" ON public.consent_records;
CREATE POLICY "consent_records_own_update" ON public.consent_records
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "consent_records_sa_all" ON public.consent_records;
CREATE POLICY "consent_records_sa_all" ON public.consent_records
  FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- ============================================================
-- 7. policy_acceptances — has user_id
-- ============================================================
DROP POLICY IF EXISTS "policy_acceptances_own_select" ON public.policy_acceptances;
CREATE POLICY "policy_acceptances_own_select" ON public.policy_acceptances
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "policy_acceptances_own_insert" ON public.policy_acceptances;
CREATE POLICY "policy_acceptances_own_insert" ON public.policy_acceptances
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "policy_acceptances_own_update" ON public.policy_acceptances;
CREATE POLICY "policy_acceptances_own_update" ON public.policy_acceptances
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "policy_acceptances_sa_all" ON public.policy_acceptances;
CREATE POLICY "policy_acceptances_sa_all" ON public.policy_acceptances
  FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- ============================================================
-- 8. lead_stage_history — no user_id; owned via lead_id -> leads.user_id
-- ============================================================
DROP POLICY IF EXISTS "lead_stage_history_own_select" ON public.lead_stage_history;
CREATE POLICY "lead_stage_history_own_select" ON public.lead_stage_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_stage_history.lead_id
        AND l.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lead_stage_history_own_insert" ON public.lead_stage_history;
CREATE POLICY "lead_stage_history_own_insert" ON public.lead_stage_history
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_stage_history.lead_id
        AND l.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lead_stage_history_own_update" ON public.lead_stage_history;
CREATE POLICY "lead_stage_history_own_update" ON public.lead_stage_history
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_stage_history.lead_id
        AND l.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "lead_stage_history_sa_all" ON public.lead_stage_history;
CREATE POLICY "lead_stage_history_sa_all" ON public.lead_stage_history
  FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- ============================================================
-- 9. experiment_events — has user_id
-- ============================================================
DROP POLICY IF EXISTS "experiment_events_own_select" ON public.experiment_events;
CREATE POLICY "experiment_events_own_select" ON public.experiment_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "experiment_events_own_insert" ON public.experiment_events;
CREATE POLICY "experiment_events_own_insert" ON public.experiment_events
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "experiment_events_own_update" ON public.experiment_events;
CREATE POLICY "experiment_events_own_update" ON public.experiment_events
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "experiment_events_sa_all" ON public.experiment_events;
CREATE POLICY "experiment_events_sa_all" ON public.experiment_events
  FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

-- ============================================================
-- 10. ezra_app_config — RLS currently DISABLED, enable it
--     App-wide config: all authenticated can read, only super_admin can write
-- ============================================================
ALTER TABLE public.ezra_app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ezra_app_config_authenticated_select" ON public.ezra_app_config;
CREATE POLICY "ezra_app_config_authenticated_select" ON public.ezra_app_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ezra_app_config_sa_all" ON public.ezra_app_config;
CREATE POLICY "ezra_app_config_sa_all" ON public.ezra_app_config
  FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

COMMIT;
