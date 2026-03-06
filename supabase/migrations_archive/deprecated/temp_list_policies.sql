-- Run this in Supabase Dashboard SQL Editor to see all policies on profiles
SELECT policyname, cmd, permissive, qual, with_check
FROM pg_policies
WHERE tablename = 'profiles'
ORDER BY policyname;
