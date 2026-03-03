-- ============================================================
-- RLS Policy Consolidation (applied March 2026)
-- Uses is_super_admin() function instead of hardcoded UUIDs
-- ============================================================

-- Helper function (idempotent)
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;


-- ============================================================
-- LEADS TABLE: Per-User Isolation + is_super_admin()
-- ============================================================

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leads_select_own" ON public.leads;
CREATE POLICY "leads_select_own" ON public.leads FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "leads_insert_own" ON public.leads;
CREATE POLICY "leads_insert_own" ON public.leads FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "leads_update_own" ON public.leads;
CREATE POLICY "leads_update_own" ON public.leads FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "leads_delete_own" ON public.leads;
CREATE POLICY "leads_delete_own" ON public.leads FOR DELETE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "leads_super_admin_all" ON public.leads;
CREATE POLICY "leads_super_admin_all" ON public.leads FOR ALL
  USING (is_super_admin());


-- ============================================================
-- QUOTES TABLE: Per-User Isolation + is_super_admin()
-- ============================================================

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own quotes." ON public.quotes;
CREATE POLICY "Users can view own quotes." ON public.quotes FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own quotes." ON public.quotes;
CREATE POLICY "Users can insert own quotes." ON public.quotes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own quotes." ON public.quotes;
CREATE POLICY "Users can update own quotes." ON public.quotes FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own quotes." ON public.quotes;
CREATE POLICY "Users can delete own quotes." ON public.quotes FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Super admin full access to quotes" ON public.quotes;
CREATE POLICY "Super admin full access to quotes" ON public.quotes FOR ALL
  USING (is_super_admin());


-- ============================================================
-- USER_INTEGRATIONS: Per-User (heloc_keys blocked) + is_super_admin()
-- ============================================================

ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;

-- Users can access own integrations EXCEPT heloc_keys (managed by super_admin)
DROP POLICY IF EXISTS "Users can view own integrations." ON public.user_integrations;
CREATE POLICY "Users can view own integrations." ON public.user_integrations FOR SELECT
  USING (auth.uid() = user_id AND provider != 'heloc_keys');

DROP POLICY IF EXISTS "Users can insert own integrations." ON public.user_integrations;
CREATE POLICY "Users can insert own integrations." ON public.user_integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id AND provider != 'heloc_keys');

DROP POLICY IF EXISTS "Users can update own integrations." ON public.user_integrations;
CREATE POLICY "Users can update own integrations." ON public.user_integrations FOR UPDATE
  USING (auth.uid() = user_id AND provider != 'heloc_keys');

DROP POLICY IF EXISTS "Super admin full access to integrations" ON public.user_integrations;
CREATE POLICY "Super admin full access to integrations" ON public.user_integrations FOR ALL
  USING (is_super_admin());


-- ============================================================
-- PROFILES TABLE: Per-User + Hardcoded UUID for super_admin
-- (Cannot use is_super_admin() here — it queries profiles itself,
--  which would create a circular dependency / infinite recursion)
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own" ON public.profiles;
CREATE POLICY "users_select_own" ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_insert_own" ON public.profiles;
CREATE POLICY "users_insert_own" ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users_update_own" ON public.profiles;
CREATE POLICY "users_update_own" ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Super admin hardcoded (circular dep prevention)
DROP POLICY IF EXISTS "super_admin_select_all" ON public.profiles;
CREATE POLICY "super_admin_select_all" ON public.profiles FOR SELECT
  USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

DROP POLICY IF EXISTS "super_admin_update_all" ON public.profiles;
CREATE POLICY "super_admin_update_all" ON public.profiles FOR UPDATE
  USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid)
  WITH CHECK (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

DROP POLICY IF EXISTS "super_admin_insert_all" ON public.profiles;
CREATE POLICY "super_admin_insert_all" ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

DROP POLICY IF EXISTS "super_admin_delete_all" ON public.profiles;
CREATE POLICY "super_admin_delete_all" ON public.profiles FOR DELETE
  USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);
