-- FIX: Profiles table RLS for super admin access
-- Run this in Supabase SQL Editor

-- 1. Enable RLS (if not already enabled)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 2. Drop any existing conflicting policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- 3. Create policy: Users can view their own profile
CREATE POLICY "Users can view own profile"
    ON profiles FOR SELECT
    USING (auth.uid() = id);

-- 4. Create policy: Users can update their own profile  
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (auth.uid() = id);

-- 5. Create policy: Users can insert their own profile
CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

-- 6. Verify the user has the correct role in profiles
UPDATE profiles 
SET role = 'super_admin' 
WHERE id = '795aea13-6aba-45f2-97d4-04576f684557';

-- 7. Verify the fix
SELECT id, email, role, tier 
FROM profiles 
WHERE id = '795aea13-6aba-45f2-97d4-04576f684557';
