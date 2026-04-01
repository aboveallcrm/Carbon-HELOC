import { initDB, saveQuote, resetQuoteId, setQuoteId } from './supabase-quotes.js';
import { checkSession, logout, getEffectiveUser, stopImpersonation, impersonateUser, captureGoogleProviderToken } from './auth.js';
import { supabase, clearUserCache, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_FUNCTIONS_URL, getActiveSession } from './supabase-client.js';

window._debug = window._debug === true || new URLSearchParams(window.location.search).get('debug') === '1';

if (!window._debug) {
    console.debug = function () {};
    console.log = function () {};
}

window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.SUPABASE_FUNCTIONS_URL = SUPABASE_FUNCTIONS_URL;

function showSessionExpiredBanner() {
    if (document.getElementById('session-expired-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'session-expired-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ef4444;color:white;padding:12px;text-align:center;z-index:99999;font-family:var(--font-heading);font-size:13px;';
    banner.textContent = '⚠ Your session has expired. ';

    const link = document.createElement('a');
    link.href = 'login.html';
    link.style.cssText = 'color:white;text-decoration:underline;font-weight:bold;';
    link.textContent = 'Click here to log in again';

    banner.appendChild(link);
    document.body.appendChild(banner);
}

window.showSessionExpiredBanner = showSessionExpiredBanner;

let _writeGuardInstalled = false;
function installSupabaseWriteGuard() {
    if (_writeGuardInstalled || typeof window.fetch !== 'function') return;
    _writeGuardInstalled = true;

    const nativeFetch = window.fetch.bind(window);
    const supabaseOrigin = new URL(SUPABASE_URL).origin;

    window.fetch = async function guardedFetch(input, init) {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url, window.location.origin);
        const method = (request.method || 'GET').toUpperCase();
        const isMutating = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
        const isSupabaseRestCall = url.origin === supabaseOrigin && url.pathname.startsWith('/rest/v1/');

        if (isMutating && isSupabaseRestCall) {
            const session = await getActiveSession();
            if (!session) {
                showSessionExpiredBanner();
                if (typeof window.showToast === 'function') window.showToast('Session expired — please log in', 'error');
                throw new Error('Session expired — please log in');
            }

            if (window.isImpersonatedReadOnly) {
                if (typeof window.showToast === 'function') window.showToast('Read-only impersonation blocks all write actions.', 'warning');
                throw new Error('Read-only impersonation blocks write actions');
            }
        }

        const response = await nativeFetch(input, init);
        // Only trigger session expired for REST API 401s, not edge functions
        // Edge functions like gmail-send return 401 when OAuth isn't connected — that's not a session issue
        if (response.status === 401 && url.origin === supabaseOrigin && url.pathname.startsWith('/rest/v1/')) {
            clearUserCache();
            showSessionExpiredBanner();
        }
        return response;
    };
}

function enforceSubscription(user) {
    const allowedStatuses = new Set(['active', 'trialing']);
    const isAdmin = user?.role === 'super_admin' || user?.role === 'admin';
    const status = (user?.subscription_status || '').toLowerCase();

    if (isAdmin || allowedStatuses.has(status)) return;

    window.location.href = 'pricing.html?reason=subscription';
    throw new Error('Subscription inactive');
}

try {
    installSupabaseWriteGuard();

    const user = await checkSession();
    if (!user) {
        throw new Error('Not authenticated');
    }

    const effectiveUser = await getEffectiveUser(user);
    enforceSubscription(effectiveUser);

    window.realUserId = user.id || null;
    window.realUserRole = user.role || 'user';
    window.currentUserRole = effectiveUser.role || 'user';
    window.currentUserId = effectiveUser.id || null;
    window.currentUserEmail = effectiveUser.email || '';
    window.currentUserTier = effectiveUser.tier || 'starter';
    window._loTierLevel = ({ starter: 0, pro: 1, enterprise: 2 }[window.currentUserTier] ?? 0);
    window.logoutUser = logout;
    window.stopImpersonation = stopImpersonation;
    window.impersonateUser = impersonateUser;
    window.isImpersonatedReadOnly = effectiveUser.isReadOnly || false;
    window._supabase = supabase;
    window._resetQuoteId = resetQuoteId;
    window._setQuoteId = setQuoteId;

    await captureGoogleProviderToken().catch(() => {});

    if (effectiveUser.isImpersonated) {
        const isReadOnly = effectiveUser.isReadOnly;
        const banner = document.createElement('div');
        banner.id = 'impersonation-banner';
        banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:linear-gradient(135deg,' +
            (isReadOnly ? '#ef4444,#dc2626' : '#c5a059,#a68543') +
            ');color:' + (isReadOnly ? 'white' : '#0f172a') +
            ';padding:10px 20px;text-align:center;z-index:99999;font-family:var(--font-heading);font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:12px;';
        const label = document.createElement('span');
        label.textContent = isReadOnly
            ? `Viewing as: ${effectiveUser.email} (READ ONLY)`
            : `Logged in as: ${effectiveUser.email} (${effectiveUser.role} / ${effectiveUser.tier || 'starter'})`;
        const exitBtn = document.createElement('button');
        exitBtn.textContent = 'Exit';
        exitBtn.style.cssText = isReadOnly
            ? 'background:white;color:#ef4444;border:none;padding:5px 14px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;'
            : 'background:#0f172a;color:#c5a059;border:none;padding:5px 14px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;';
        exitBtn.onclick = () => window.stopImpersonation();
        banner.appendChild(label);
        banner.appendChild(exitBtn);
        document.body.prepend(banner);
        document.body.style.paddingTop = '40px';
    }

    initDB();

    if (window.isImpersonatedReadOnly) {
        window.autoSave = function () {
            const indicator = document.getElementById('autosave-status');
            if (indicator) {
                indicator.innerText = 'Read Only';
                indicator.classList.add('saving');
            }
        };
    } else {
        let _cloudSaveTimer = null;
        const CLOUD_SAVE_DELAY = 5000;
        const originalAutoSave = window.autoSave;

        window.autoSave = function () {
            if (typeof originalAutoSave === 'function') {
                originalAutoSave();
            }

            clearTimeout(_cloudSaveTimer);
            _cloudSaveTimer = setTimeout(async () => {
                const data = {
                    clientName: document.getElementById('in-client-name')?.value || '',
                    clientEmail: document.getElementById('client-email')?.value || '',
                    clientPhone: document.getElementById('client-phone')?.value || '',
                    creditScore: document.getElementById('in-client-credit')?.value || '',
                    homeValue: document.getElementById('in-home-value')?.value || '',
                    mortgageBalance: document.getElementById('in-mortgage-balance')?.value || '',
                    netCash: document.getElementById('in-net-cash')?.value || '',
                    refiBalance: document.getElementById('in-refi-balance')?.value || '',
                    refiRate: document.getElementById('in-refi-rate')?.value || '',
                    refiPayment: document.getElementById('in-refi-payment')?.value || '',
                    propertyType: document.getElementById('in-property-type')?.value || '',
                    address: document.getElementById('custom-address-input')?.value || '',
                    recTier: document.getElementById('rec-tier-select')?.value || '',
                    recTerm: document.getElementById('rec-term-select')?.value || '',
                    recRate: document.getElementById('snap-rate')?.innerText || '',
                    recPayment: document.getElementById('snap-payment')?.innerText || '',
                    recTermYears: document.getElementById('rec-term-select')?.value || '',
                    origination: document.getElementById('snap-orig-perc')?.innerText || '',
                    totalLoan: document.getElementById('snap-total-loan')?.innerText || '',
                    timestamp: new Date().toISOString()
                };
                const indicator = document.getElementById('autosave-status');
                const result = await saveQuote(data);
                if (indicator) {
                    if (result && result.ok) {
                        indicator.innerText = '☁ Synced';
                        indicator.classList.remove('saving');
                        if (typeof window.autoLinkLeadToQuote === 'function') {
                            window.autoLinkLeadToQuote(data);
                        }
                    } else {
                        indicator.innerText = '⚠ Local only';
                        indicator.classList.add('saving');
                    }
                }
            }, CLOUD_SAVE_DELAY);
        };
    }

    supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
            clearUserCache();
            window.currentUserRole = null;
            window.currentUserId = null;
            window.currentUserEmail = '';
            showSessionExpiredBanner();
        } else if (event === 'TOKEN_REFRESHED') {
            clearUserCache();
        }
    });

    window.dispatchEvent(new CustomEvent('auth-ready', {
        detail: {
            role: effectiveUser.role,
            email: effectiveUser.email,
            tier: effectiveUser.tier || 'starter'
        }
    }));

} catch (e) {
    console.error('Integration module error:', e);
    const errBanner = document.createElement('div');
    errBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;padding:14px;background:#dc2626;color:white;text-align:center;z-index:99999;font-weight:600;font-size:14px;';
    errBanner.textContent = 'Unable to connect. Please check your internet connection and refresh the page.';
    document.body.appendChild(errBanner);
}
