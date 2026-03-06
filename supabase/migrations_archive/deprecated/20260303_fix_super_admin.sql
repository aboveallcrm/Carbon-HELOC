-- =============================================================
-- RUN THIS IN SUPABASE DASHBOARD > SQL EDITOR
-- https://supabase.com/dashboard/project/czzabvfzuxhpdcowgvam/sql
-- =============================================================

-- 1. Drop old tier check constraint and add updated one with all tiers
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_tier_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_tier_check
  CHECK (tier IN ('free', 'carbon', 'titanium', 'platinum', 'obsidian', 'diamond'));

-- 2. Set Eddie to super_admin + diamond
UPDATE public.profiles
SET role = 'super_admin', tier = 'diamond'
WHERE id = '795aea13-6aba-45f2-97d4-04576f684557';

-- 3. Update signup trigger to auto-assign super_admin for Eddie's email
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

-- 4. Guard trigger: prevent downgrading Eddie's role or tier
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
