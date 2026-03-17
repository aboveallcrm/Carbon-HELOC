-- Fix 1: Update handle_new_user trigger — was granting super_admin to wrong email
-- Old: eddieb@westcapitallending.com (stale, privilege escalation risk)
-- New: barraganmortgage@gmail.com (Eddie's actual account)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, tier, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'carbon',
    CASE
      WHEN NEW.email = 'barraganmortgage@gmail.com' THEN 'super_admin'
      ELSE 'user'
    END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Fix 2: Restrict profiles read policy — was USING (true) exposing all profiles
-- to any authenticated user. Now scoped to own profile only.
-- Super admin retains full access via profiles_super_admin_all policy.
DROP POLICY IF EXISTS profiles_authenticated_read ON profiles;
CREATE POLICY profiles_authenticated_read ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);
