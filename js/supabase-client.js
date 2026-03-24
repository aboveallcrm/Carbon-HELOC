/**
 * Supabase Client Initialization
 * Loads the public anon config from Vercel runtime env via /api/public-config.js.
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const PUBLIC_CONFIG = window.__PUBLIC_CONFIG__ || {};

export const SUPABASE_URL = PUBLIC_CONFIG.supabaseUrl || '';
export const SUPABASE_ANON_KEY = PUBLIC_CONFIG.supabaseAnonKey || '';
export const SUPABASE_FUNCTIONS_URL = PUBLIC_CONFIG.supabaseFunctionsUrl || (SUPABASE_URL ? (SUPABASE_URL.replace(/\/$/, '') + '/functions/v1') : '');

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error((PUBLIC_CONFIG && PUBLIC_CONFIG.error) || 'Missing public Supabase runtime configuration. Load /api/public-config.js before app scripts.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Cached user object avoids repeated profile reads during autosave.
let _cachedUser = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 60 * 1000;

export async function getActiveSession() {
    const { data: { session } } = await supabase.auth.getSession();
    return session || null;
}

export async function requireActiveSession() {
    const session = await getActiveSession();
    if (!session) {
        throw new Error('Session expired — please log in again.');
    }
    return session;
}

export async function getCurrentUser() {
    if (_cachedUser && (Date.now() - _cacheTime) < CACHE_TTL_MS) return _cachedUser;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .limit(1)
        .single();

    if (profileError || !profile) {
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

    _cachedUser = { ...user, ...(profile || {}) };
    _cacheTime = Date.now();

    return _cachedUser;
}

export function clearUserCache() {
    _cachedUser = null;
    _cacheTime = 0;
}
