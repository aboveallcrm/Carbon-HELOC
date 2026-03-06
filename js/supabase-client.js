/**
 * Supabase Client Initialization
 * Imports supabase-js from CDN
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://czzabvfzuxhpdcowgvam.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6emFidmZ6dXhocGRjb3dndmFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNjgwNTYsImV4cCI6MjA4NDc0NDA1Nn0.tFliE-x2Tz9ET3A38R4y7eSo6bUu-bYY47XkWeX1xHY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cached user object — avoids repeated API calls on autosave
let _cachedUser = null;

export async function getCurrentUser() {
    if (_cachedUser) return _cachedUser;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Fetch profile for role/tier
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (profileError) {
        console.warn('Profile fetch error:', profileError.message);
    }

    console.log('Auth user role:', user.role);
    console.log('Profile role:', profile?.role);
    console.log('Profile data:', profile);

    // Merge profile over user, with profile taking precedence
    _cachedUser = { ...user, ...(profile || {}) };
    
    console.log('Merged role:', _cachedUser.role);
    
    return _cachedUser;
}

export function clearUserCache() {
    _cachedUser = null;
}
