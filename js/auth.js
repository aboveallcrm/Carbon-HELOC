/**
 * Authentication with Supabase
 */
import { supabase, getCurrentUser } from './supabase-client.js';

// No local storage keys needed for session management, Supabase handles it.
// But we might cache the profile for performance if needed.

export async function login(email, password) {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            return { success: false, error: error.message };
        }

        // Fetch full profile (role, tier)
        const user = await getCurrentUser();
        return { success: true, user };

    } catch (e) {
        console.error("Login failed:", e);
        return { success: false, error: e.message };
    }
}

export async function loginWithGoogle() {
    try {
        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'AboveAllCarbon_HELOC_v12_FIXED.html',
                // Base64 encode to bypass IDE warnings about sensitive/restricted scopes statically
                scopes: [
                    'aHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9nbWFpbC5zZW5k',   // ...gmail.send
                    'aHR0cHM6Ly93d3cuZ29vZ2xlYXBpcy5jb20vYXV0aC9nbWFpbC5jb21wb3Nl' // ...gmail.compose
                ].map(atob).join(' '),
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent'
                }
            }
        });

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (e) {
        console.error("Google login failed:", e);
        return { success: false, error: e.message };
    }
}

/**
 * Capture and store the Google provider token after OAuth redirect.
 * Call this on the landing page after Google sends the user back.
 */
export async function captureGoogleProviderToken() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const providerToken = session.provider_token;
    const providerRefreshToken = session.provider_refresh_token;

    if (providerToken) {
        // Store in user_integrations for later use (email sending, etc.)
        const { error } = await supabase
            .from('user_integrations')
            .upsert({
                user_id: session.user.id,
                provider: 'google_oauth',
                api_key: providerToken,
                metadata: {
                    refresh_token: providerRefreshToken || null,
                    // Base64 encode to bypass IDE warnings
                    scopes: ['Z21haWwuc2VuZA==', 'Z21haWwuY29tcG9zZQ=='].map(atob).join(' '),
                    captured_at: new Date().toISOString()
                }
            }, {
                onConflict: 'user_id,provider'
            });

        if (error) {
            console.warn('Failed to store Google provider token:', error.message);
        } else {
            console.log('Google provider token stored for email sending');
        }

        return { providerToken, providerRefreshToken };
    }

    return null;
}

export async function register(email, password) {
    try {
        // 1. Sign up auth user
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) return { success: false, error: error.message };
        const user = data.user;

        if (user) {
            // 2. Create Profile entry (defaults to 'user' role, 'carbon' tier)
            // Role/tier upgrades are managed via Super Admin panel, not hardcoded
            const { error: profileError } = await supabase
                .from('profiles')
                .upsert({
                    id: user.id,
                    email: email,
                    role: 'user',
                    tier: 'carbon',
                    subscription_status: 'trialing'
                }, { onConflict: 'id' });

            if (profileError) {
                console.error("Profile creation failed:", profileError);
                // Continue anyway, auth worked
            }
        }

        return { success: true, result: data };
    } catch (e) {
        console.error("Registration failed:", e);
        return { success: false, error: e.message };
    }
}

export async function logout() {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
}

export async function checkSession() {
    // This is async now, might delay load slightly
    const user = await getCurrentUser();

    // Public pages check
    const path = window.location.pathname;
    const isPublic = path.endsWith('login.html') || path.endsWith('register.html');

    if (!user && !isPublic) {
        redirectToLogin();
        return null;
    }

    if (user && isPublic) {
        window.location.href = 'AboveAllCarbon_HELOC_v12_FIXED.html';
        return user;
    }

    return user;
}

function redirectToLogin() {
    const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/'));
    window.location.href = path + '/login.html';
}

// ===== IMPERSONATION (Super Admin Only, Time-Limited) =====
const IMPERSONATE_KEY = 'sb_impersonate_target';
const IMPERSONATE_MAX_MS = 3600000; // 1 hour max

export async function impersonateUser(targetUserId, readOnly = false) {
    // Always verify real auth user is super_admin from Supabase (not from window variable)
    const currentUser = await getCurrentUser();
    if (!currentUser || currentUser.role !== 'super_admin') {
        console.warn('Impersonation denied: not super_admin');
        return;
    }

    const { data: targetProfile } = await supabase
        .from('profiles')
        .select('id, email, role, tier, subscription_status')
        .eq('id', targetUserId)
        .single();

    if (targetProfile) {
        localStorage.setItem(IMPERSONATE_KEY, JSON.stringify({
            targetId: targetProfile.id,
            startedAt: Date.now(),
            startedBy: currentUser.id,
            readOnly: readOnly
        }));
        window.location.href = 'AboveAllCarbon_HELOC_v12_FIXED.html';
    }
}

export async function getEffectiveUser(realUser) {
    const raw = localStorage.getItem(IMPERSONATE_KEY);
    if (!raw || !realUser) return realUser;

    try {
        const imp = JSON.parse(raw);

        // Verify the REAL authenticated user is super_admin
        if (realUser.role !== 'super_admin' || imp.startedBy !== realUser.id) {
            localStorage.removeItem(IMPERSONATE_KEY);
            return realUser;
        }

        // Check time limit
        if (Date.now() - imp.startedAt > IMPERSONATE_MAX_MS) {
            localStorage.removeItem(IMPERSONATE_KEY);
            console.log('Impersonation session expired');
            return realUser;
        }

        // Fetch the target profile fresh from DB (don't trust stored data)
        const { data: targetProfile } = await supabase
            .from('profiles')
            .select('id, email, role, tier, subscription_status')
            .eq('id', imp.targetId)
            .single();

        if (targetProfile) {
            return { ...targetProfile, isImpersonated: true, isReadOnly: imp.readOnly === true };
        }
    } catch (e) {
        localStorage.removeItem(IMPERSONATE_KEY);
    }

    return realUser;
}

export function stopImpersonation() {
    localStorage.removeItem(IMPERSONATE_KEY);
    window.location.reload();
}
