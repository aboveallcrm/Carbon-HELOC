-- Fix super admin access for barraganmortgage@gmail.com
-- This script ensures the user has both user_roles AND profiles entries

-- First, ensure the profiles table has all required columns
DO $$
BEGIN
    -- Add role column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'role') THEN
        ALTER TABLE profiles ADD COLUMN role TEXT DEFAULT 'user';
    END IF;
    
    -- Add current_tier column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'current_tier') THEN
        ALTER TABLE profiles ADD COLUMN current_tier TEXT DEFAULT 'carbon';
    END IF;
    
    -- Add subscription_status column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'subscription_status') THEN
        ALTER TABLE profiles ADD COLUMN subscription_status TEXT DEFAULT 'active';
    END IF;
    
    -- Add full_name column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'full_name') THEN
        ALTER TABLE profiles ADD COLUMN full_name TEXT;
    END IF;
    
    -- Add email column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'email') THEN
        ALTER TABLE profiles ADD COLUMN email TEXT;
    END IF;
END $$;

-- Create or update the super admin profile
INSERT INTO profiles (id, email, full_name, role, current_tier, subscription_status)
VALUES (
    '795aea13-6aba-45f2-97d4-04576f684557',
    'barraganmortgage@gmail.com',
    'Eddie Barragan',
    'super_admin',
    'diamond',
    'active'
)
ON CONFLICT (id) DO UPDATE SET
    role = 'super_admin',
    current_tier = 'diamond',
    subscription_status = 'active',
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    email = COALESCE(EXCLUDED.email, profiles.email);

-- Ensure user_roles entry exists
INSERT INTO user_roles (user_id, role)
VALUES ('795aea13-6aba-45f2-97d4-04576f684557', 'super_admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Verify the fix
SELECT 
    p.id,
    p.email,
    p.full_name,
    p.role as profile_role,
    p.current_tier,
    p.subscription_status,
    ur.role as user_role
FROM profiles p
LEFT JOIN user_roles ur ON p.id = ur.user_id
WHERE p.id = '795aea13-6aba-45f2-97d4-04576f684557';
