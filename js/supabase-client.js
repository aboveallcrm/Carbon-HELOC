/**
 * Supabase Client Initialization
 * Imports supabase-js from CDN
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://czzabvfzuxhpdcowgvam.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_KjK4nHtyBK426zvT4EDDWA_U1FbWp-8'; // Using the publishable key provided

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cached user object — avoids repeated API calls on autosave
let _cachedUser = null;

export async function getCurrentUser() {
    if (_cachedUser) return _cachedUser;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Fetch profile for role/tier
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    _cachedUser = { ...user, ...profile };
    return _cachedUser;
}

export function clearUserCache() {
    _cachedUser = null;
}
