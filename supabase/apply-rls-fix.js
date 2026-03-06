const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://czzabvfzuxhpdcowgvam.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6emFidmZ6dXhocGRjb3dndmFtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTE2ODA1NiwiZXhwIjoyMDg0NzQ0MDU2fQ.8UiuFW0_MfVma29RvaXdi448ZOdMFyrCgw4CrcO6yRs',
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
