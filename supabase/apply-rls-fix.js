const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// TODO: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your shell before running this script.
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing required env vars: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function fixRLS() {
    // First check if RLS is enabled
    const { data: rlsStatus, error: rlsError } = await supabase
        .from('pg_class')
        .select('relname, relrowsecurity')
        .eq('relname', 'profiles')
        .single();
    
    console.log('RLS Status:', rlsStatus, rlsError);

    // Check existing policies
    const { data: policies, error: policyError } = await supabase
        .rpc('get_policies', { table_name: 'profiles' });
    
    console.log('Existing policies:', policies, policyError);

    // Try to read the profile as the user would
    console.log('\nTesting profile read...');
    const { data: profile, error: readError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', '795aea13-6aba-45f2-97d4-04576f684557')
        .single();
    
    console.log('Profile read result:', profile ? 'SUCCESS' : 'FAILED', readError);
    if (profile) {
        console.log('Role from profile:', profile.role);
    }
}

fixRLS();
