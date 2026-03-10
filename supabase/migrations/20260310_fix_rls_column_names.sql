-- ============================================================================
-- FIX: RLS policies on borrowers, properties, mortgages, deal_radar
-- These tables use loan_officer_id (not user_id) as the ownership column.
-- Drop the incorrect policies and recreate with the correct column.
-- ============================================================================

-- borrowers: fix UPDATE + DELETE
DROP POLICY IF EXISTS borrowers_own_update ON public.borrowers;
DROP POLICY IF EXISTS borrowers_own_delete ON public.borrowers;

CREATE POLICY borrowers_own_update ON public.borrowers FOR UPDATE TO authenticated
    USING (loan_officer_id = auth.uid() OR public.is_super_admin());
CREATE POLICY borrowers_own_delete ON public.borrowers FOR DELETE TO authenticated
    USING (loan_officer_id = auth.uid() OR public.is_super_admin());

-- properties: fix INSERT + UPDATE + DELETE
DROP POLICY IF EXISTS properties_own_insert ON public.properties;
DROP POLICY IF EXISTS properties_own_update ON public.properties;
DROP POLICY IF EXISTS properties_own_delete ON public.properties;

CREATE POLICY properties_own_insert ON public.properties FOR INSERT TO authenticated
    WITH CHECK (loan_officer_id = auth.uid() OR public.is_super_admin());
CREATE POLICY properties_own_update ON public.properties FOR UPDATE TO authenticated
    USING (loan_officer_id = auth.uid() OR public.is_super_admin());
CREATE POLICY properties_own_delete ON public.properties FOR DELETE TO authenticated
    USING (loan_officer_id = auth.uid() OR public.is_super_admin());

-- mortgages: fix INSERT + UPDATE + DELETE
DROP POLICY IF EXISTS mortgages_own_insert ON public.mortgages;
DROP POLICY IF EXISTS mortgages_own_update ON public.mortgages;
DROP POLICY IF EXISTS mortgages_own_delete ON public.mortgages;

CREATE POLICY mortgages_own_insert ON public.mortgages FOR INSERT TO authenticated
    WITH CHECK (loan_officer_id = auth.uid() OR public.is_super_admin());
CREATE POLICY mortgages_own_update ON public.mortgages FOR UPDATE TO authenticated
    USING (loan_officer_id = auth.uid() OR public.is_super_admin());
CREATE POLICY mortgages_own_delete ON public.mortgages FOR DELETE TO authenticated
    USING (loan_officer_id = auth.uid() OR public.is_super_admin());

-- deal_radar: fix UPDATE + DELETE
DROP POLICY IF EXISTS deal_radar_own_update ON public.deal_radar;
DROP POLICY IF EXISTS deal_radar_own_delete ON public.deal_radar;

CREATE POLICY deal_radar_own_update ON public.deal_radar FOR UPDATE TO authenticated
    USING (loan_officer_id = auth.uid() OR public.is_super_admin());
CREATE POLICY deal_radar_own_delete ON public.deal_radar FOR DELETE TO authenticated
    USING (loan_officer_id = auth.uid() OR public.is_super_admin());
