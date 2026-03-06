-- =============================================================
-- MASTER FIX: Run this in Supabase Dashboard > SQL Editor
-- https://supabase.com/dashboard/project/czzabvfzuxhpdcowgvam/sql
-- =============================================================
-- This fixes:
--   1. Infinite recursion on profiles table (stale user_roles-based policies)
--   2. Infinite recursion on quotes table (stale user_roles-based policies)
--   3. Infinite recursion on user_roles table (self-referencing policies)
--   4. Tier check constraint (missing diamond/carbon/etc.)
--   5. Eddie's role + tier (super_admin + diamond)
--   6. Signup trigger + guard trigger
-- =============================================================

-- ==========================================
-- STEP 0: Fix user_roles table recursion
-- (Must do first since other policies reference it)
-- ==========================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_roles') THEN
    -- Drop ALL policies on user_roles to stop the recursion
    DROP POLICY IF EXISTS "Super admins can manage roles" ON user_roles;
    DROP POLICY IF EXISTS "Users can view own roles" ON user_roles;
    DROP POLICY IF EXISTS "Anyone can view own roles" ON user_roles;
    DROP POLICY IF EXISTS "Super admin manage all roles" ON user_roles;

    -- Replace with non-recursive policies
    CREATE POLICY "Anyone can view own roles"
      ON user_roles FOR SELECT
      USING (auth.uid() = user_id);

    CREATE POLICY "Super admin manage all roles"
      ON user_roles FOR ALL
      USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);
  END IF;
END $$;


-- ==========================================
-- STEP 1: Clean ALL stale policies on profiles
-- ==========================================
-- Drop old policies that reference user_roles (from fix-profiles-rls.sql)
DROP POLICY IF EXISTS "Super admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Super admins can update all profiles" ON public.profiles;

-- Drop old policies with period naming (from schema.sql original)
DROP POLICY IF EXISTS "Users can view own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile." ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile." ON public.profiles;

-- Drop old policies without period (from fix-profiles-rls.sql)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Drop super admin policies (from schema.sql)
DROP POLICY IF EXISTS "super_admin_select_all" ON public.profiles;
DROP POLICY IF EXISTS "super_admin_update_all" ON public.profiles;
DROP POLICY IF EXISTS "super_admin_insert_all" ON public.profiles;
DROP POLICY IF EXISTS "super_admin_delete_all" ON public.profiles;

-- Drop new-named policies too (idempotent — safe to re-run)
DROP POLICY IF EXISTS "profiles_own_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_sa_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_sa_update" ON public.profiles;
DROP POLICY IF EXISTS "profiles_sa_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_sa_delete" ON public.profiles;

-- Now recreate CLEAN policies (no user_roles references, use hardcoded UUID)
CREATE POLICY "profiles_own_select" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_own_insert" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_own_update" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "profiles_sa_select" ON public.profiles
  FOR SELECT USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

CREATE POLICY "profiles_sa_update" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid)
  WITH CHECK (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

CREATE POLICY "profiles_sa_insert" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);

CREATE POLICY "profiles_sa_delete" ON public.profiles
  FOR DELETE USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);


-- ==========================================
-- STEP 2: Clean ALL stale policies on quotes
-- ==========================================
-- Drop old policies that reference user_roles
DROP POLICY IF EXISTS "Super admins can view all quotes" ON public.quotes;
DROP POLICY IF EXISTS "Super admins can delete any quotes" ON public.quotes;

-- Drop old schema.sql policies
DROP POLICY IF EXISTS "Users can view own quotes." ON public.quotes;
DROP POLICY IF EXISTS "Users can insert own quotes." ON public.quotes;
DROP POLICY IF EXISTS "Users can update own quotes." ON public.quotes;
DROP POLICY IF EXISTS "Users can delete own quotes." ON public.quotes;
DROP POLICY IF EXISTS "Super admin full access to quotes" ON public.quotes;

-- Drop non-period variants
DROP POLICY IF EXISTS "Users can view own quotes" ON public.quotes;
DROP POLICY IF EXISTS "Users can insert own quotes" ON public.quotes;
DROP POLICY IF EXISTS "Users can update own quotes" ON public.quotes;
DROP POLICY IF EXISTS "Users can delete own quotes" ON public.quotes;

-- Drop new-named policies too (idempotent)
DROP POLICY IF EXISTS "quotes_own_select" ON public.quotes;
DROP POLICY IF EXISTS "quotes_own_insert" ON public.quotes;
DROP POLICY IF EXISTS "quotes_own_update" ON public.quotes;
DROP POLICY IF EXISTS "quotes_own_delete" ON public.quotes;
DROP POLICY IF EXISTS "quotes_sa_all" ON public.quotes;

-- Recreate clean policies using is_super_admin() (which is SECURITY DEFINER, bypasses RLS)
CREATE POLICY "quotes_own_select" ON public.quotes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "quotes_own_insert" ON public.quotes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "quotes_own_update" ON public.quotes
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "quotes_own_delete" ON public.quotes
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "quotes_sa_all" ON public.quotes
  FOR ALL USING (public.is_super_admin());


-- ==========================================
-- STEP 3: Clean ALL stale policies on leads
-- ==========================================
DROP POLICY IF EXISTS "Users can view own leads." ON public.leads;
DROP POLICY IF EXISTS "Users can insert own leads." ON public.leads;
DROP POLICY IF EXISTS "Users can update own leads." ON public.leads;
DROP POLICY IF EXISTS "Users can delete own leads." ON public.leads;
DROP POLICY IF EXISTS "leads_super_admin_all" ON public.leads;

-- Drop non-period variants
DROP POLICY IF EXISTS "Users can view own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can insert own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can update own leads" ON public.leads;
DROP POLICY IF EXISTS "Users can delete own leads" ON public.leads;

-- Drop new-named policies too (idempotent)
DROP POLICY IF EXISTS "leads_own_select" ON public.leads;
DROP POLICY IF EXISTS "leads_own_insert" ON public.leads;
DROP POLICY IF EXISTS "leads_own_update" ON public.leads;
DROP POLICY IF EXISTS "leads_own_delete" ON public.leads;
DROP POLICY IF EXISTS "leads_sa_all" ON public.leads;

-- Recreate
CREATE POLICY "leads_own_select" ON public.leads
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "leads_own_insert" ON public.leads
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "leads_own_update" ON public.leads
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "leads_own_delete" ON public.leads
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "leads_sa_all" ON public.leads
  FOR ALL USING (public.is_super_admin());


-- ==========================================
-- STEP 4: Fix tier check constraint
-- ==========================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tier_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_tier_check
  CHECK (tier IN ('free', 'carbon', 'titanium', 'platinum', 'obsidian', 'diamond'));


-- ==========================================
-- STEP 4b: Ensure subscription_status column exists
-- ==========================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'subscription_status'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN subscription_status text DEFAULT 'trialing';
  END IF;
END $$;


-- ==========================================
-- STEP 5: Set Eddie to super_admin + diamond
-- ==========================================
UPDATE public.profiles
SET role = 'super_admin', tier = 'diamond', subscription_status = 'active'
WHERE id = '795aea13-6aba-45f2-97d4-04576f684557';


-- ==========================================
-- STEP 6: Ensure is_super_admin() is correct
-- ==========================================
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'super_admin'
  );
$$;


-- ==========================================
-- STEP 7: Signup trigger (auto-assign super_admin for Eddie)
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  IF new.email = 'barraganmortgage@gmail.com' THEN
    INSERT INTO public.profiles (id, email, role, tier)
    VALUES (new.id, new.email, 'super_admin', 'diamond');
  ELSE
    INSERT INTO public.profiles (id, email, role)
    VALUES (new.id, new.email, 'user');
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ==========================================
-- STEP 8: Guard trigger (prevent role/tier downgrade)
-- ==========================================
CREATE OR REPLACE FUNCTION public.protect_super_admin()
RETURNS trigger AS $$
BEGIN
  IF old.id = '795aea13-6aba-45f2-97d4-04576f684557'::uuid THEN
    new.role := 'super_admin';
    new.tier := 'diamond';
  END IF;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_super_admin ON public.profiles;
CREATE TRIGGER trg_protect_super_admin
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.protect_super_admin();


-- ==========================================
-- STEP 9: Verify results
-- ==========================================
SELECT id, email, role, tier FROM public.profiles
WHERE id = '795aea13-6aba-45f2-97d4-04576f684557';
