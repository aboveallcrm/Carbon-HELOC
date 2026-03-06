-- ============================================
-- CLEANUP: Remove duplicate RLS policies + fix gaps
-- ALREADY RAN in Supabase SQL Editor on 2026-03-06
-- ============================================
-- Problem: Multiple migration runs created overlapping policies
-- on leads and quotes tables. This cleans them down to one set.
-- Also adds missing sa_all policies and leads.stage column.

-- ============================================
-- 1. LEADS — Clean to canonical policy set
-- ============================================
DROP POLICY IF EXISTS "leads_select_own" ON leads;
DROP POLICY IF EXISTS "leads_insert_own" ON leads;
DROP POLICY IF EXISTS "leads_update_own" ON leads;
DROP POLICY IF EXISTS "leads_delete_own" ON leads;
DROP POLICY IF EXISTS "Users can manage own leads" ON leads;
DROP POLICY IF EXISTS "Super admin can view all leads" ON leads;
DROP POLICY IF EXISTS "Super Admin can delete all leads" ON leads;
-- Canonical set: leads_own_select, leads_own_insert, leads_own_update, leads_own_delete, leads_sa_all

-- ============================================
-- 2. QUOTES — Clean to canonical policy set
-- ============================================
DROP POLICY IF EXISTS "quotes_select_own" ON quotes;
DROP POLICY IF EXISTS "quotes_insert_own" ON quotes;
DROP POLICY IF EXISTS "quotes_update_own" ON quotes;
DROP POLICY IF EXISTS "quotes_delete_own" ON quotes;
DROP POLICY IF EXISTS "Users can manage own quotes" ON quotes;
DROP POLICY IF EXISTS "Anyone can view shared quotes" ON quotes;
-- Canonical set: quotes_own_select, quotes_own_insert, quotes_own_update, quotes_own_delete, quotes_sa_all, quotes_select_shared

-- ============================================
-- 3. KNOWLEDGE BASE — Mark seed data as system
-- ============================================
UPDATE ezra_knowledge_base
SET is_system = true
WHERE category IN (
    'sales_scripts', 'objections', 'heloc_guidelines', 'loan_programs',
    'approval_process', 'process_advantages', 'data_privacy', 'value_proposition',
    'product_structures', 'deal_architect', 'payment_rules'
);

-- ============================================
-- 4. Add missing super_admin policies
-- ============================================
CREATE POLICY "deal_radar_sa_all" ON deal_radar FOR ALL USING (is_super_admin());
CREATE POLICY "mortgages_sa_all" ON mortgages FOR ALL USING (is_super_admin());
CREATE POLICY "properties_sa_all" ON properties FOR ALL USING (is_super_admin());
CREATE POLICY "dr_scans_own_insert" ON deal_radar_scans FOR INSERT WITH CHECK (auth.uid() = loan_officer_id);
CREATE POLICY "dr_scans_sa_all" ON deal_radar_scans FOR ALL USING (is_super_admin());

-- ============================================
-- 5. Add missing leads.stage column
-- ============================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage TEXT DEFAULT 'new';

-- ============================================
-- VERIFY
-- ============================================
SELECT tablename, COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('leads', 'quotes', 'deal_radar', 'mortgages', 'properties', 'deal_radar_scans')
GROUP BY tablename
ORDER BY tablename;

SELECT 'Cleanup complete' AS result;
