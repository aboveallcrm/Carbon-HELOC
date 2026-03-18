/**
 * Supabase Client Initialization
 * Imports supabase-js from CDN
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://czzabvfzuxhpdcowgvam.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN6emFidmZ6dXhocGRjb3dndmFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxNjgwNTYsImV4cCI6MjA4NDc0NDA1Nn0.tFliE-x2Tz9ET3A38R4y7eSo6bUu-bYY47XkWeX1xHY';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cached user object — avoids repeated API calls on autosave
// TTL: 5 minutes — ensures role/tier changes propagate within a reasonable window
let _cachedUser = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 60 seconds — ensures role/tier changes propagate quickly for SaaS

export async function getCurrentUser() {
    if (_cachedUser && (Date.now() - _cacheTime) < CACHE_TTL_MS) return _cachedUser;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Fetch profile for role/tier
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (profileError || !profile) {
        // Auto-create profile for Google/magic-link signups that bypassed register()
        if (!profile) {
            const { data: newProfile, error: createErr } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    email: user.email,
                    role: 'user',
                    tier: 'carbon',
                    subscription_status: 'trialing'
                }, { onConflict: 'id' })
                .select()
                .single();
            if (!createErr && newProfile) {
                _cachedUser = { ...user, ...newProfile };
                _cacheTime = Date.now();
                return _cachedUser;
            }
        }
        console.warn('Profile fetch error:', profileError?.message || 'no profile');
    }

    // Merge profile over user, with profile taking precedence
    _cachedUser = { ...user, ...(profile || {}) };
    _cacheTime = Date.now();

    return _cachedUser;
}

export function clearUserCache() {
    _cachedUser = null;
    _cacheTime = 0;
}
