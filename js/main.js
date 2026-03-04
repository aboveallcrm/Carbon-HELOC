import { initConvex, saveQuoteToConvex, resetQuoteId, setQuoteId } from './convex-db.js';
import { checkSession, logout, getEffectiveUser, stopImpersonation, impersonateUser, captureGoogleProviderToken } from './auth.js';
import { supabase, clearUserCache } from './supabase-client.js';

console.log("Loading Main Integration Module...");

try {
    // Authentication Check - redirects to login.html if not authenticated
    const user = await checkSession();

    if (!user) {
        // checkSession handles redirect, but guard just in case
        throw new Error('Not authenticated');
    }

    // Capture Google provider token if this is an OAuth redirect
    // (provider_token is only available in the session immediately after OAuth callback)
    await captureGoogleProviderToken().catch(() => {});

    // Check for impersonation (super_admin viewing as another user)
    const effectiveUser = await getEffectiveUser(user);

    console.log('User from getCurrentUser:', user);
    console.log('User role from getCurrentUser:', user?.role);
    console.log('Effective user:', effectiveUser);
    console.log('Effective user role:', effectiveUser?.role);

    // Expose user info globally for role-based access
    window.currentUserRole = effectiveUser.role || 'user';
    window.currentUserId = effectiveUser.id || null;
    window.currentUserEmail = effectiveUser.email || '';
    window.currentUserTier = effectiveUser.current_tier || 'carbon';
    window.logoutUser = logout;
    window.stopImpersonation = stopImpersonation;
    window.impersonateUser = impersonateUser;
    window.isImpersonatedReadOnly = effectiveUser.isReadOnly || false;
    window._supabase = supabase; // Expose for Super Admin panel
    window._resetQuoteId = resetQuoteId;
    window._setQuoteId = setQuoteId;

    // Show impersonation banner if active
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
            : `Logged in as: ${effectiveUser.email} (${effectiveUser.role} / ${effectiveUser.current_tier || 'carbon'})`;
        const exitBtn = document.createElement('button');
        exitBtn.textContent = 'Exit';
        exitBtn.style.cssText = isReadOnly
            ? 'background:white;color:#ef4444;border:none;padding:5px 14px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;'
            : 'background:#0f172a;color:#c5a059;border:none;padding:5px 14px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;';
        exitBtn.onclick = () => window.stopImpersonation();
        banner.appendChild(label);
        banner.appendChild(exitBtn);
        document.body.prepend(banner);
        // Push content down so banner doesn't overlap
        document.body.style.paddingTop = '40px';
    }

    // Initialize Supabase DB adapter
    initConvex();

    // Monkey-patch the existing autoSave function to also save to Supabase
    // Cloud save is debounced to 5s after the last change to avoid hammering the DB
    if (window.isImpersonatedReadOnly) {
        // Read-only mode — block all cloud saves
        window.autoSave = function () {
            const indicator = document.getElementById('autosave-status');
            if (indicator) { indicator.innerText = 'Read Only'; indicator.classList.add('saving'); }
        };
    } else {
        let _cloudSaveTimer = null;
        const CLOUD_SAVE_DELAY = 5000;

        const originalAutoSave = window.autoSave;
        window.autoSave = function () {
            // Call the original local storage save (immediate)
            if (typeof originalAutoSave === 'function') {
                originalAutoSave();
            }

            // Debounce cloud save — only fires 5s after the last change
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
                    recTermYears: document.getElementById('snap-term')?.innerText || '',
                    origination: document.getElementById('snap-orig-perc')?.innerText || '',
                    totalLoan: document.getElementById('snap-total-loan')?.innerText || '',
                    timestamp: new Date().toISOString()
                };
                const indicator = document.getElementById('autosave-status');
                const result = await saveQuoteToConvex(data);
                if (indicator) {
                    if (result && result.ok) {
                        indicator.innerText = '☁ Synced';
                        indicator.classList.remove('saving');
                        // Auto-link: mark matching leads as Qualified when quote is saved
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

    // Session expiry handling — warn user or refresh token
    supabase.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') {
            clearUserCache();
            window.currentUserRole = null;
            window.currentUserId = null;
            window.currentUserEmail = '';
            // Show session expired banner instead of hard redirect
            const banner = document.createElement('div');
            banner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ef4444;color:white;padding:12px;text-align:center;z-index:99999;font-family:var(--font-heading);font-size:13px;';
            banner.innerHTML = '⚠️ Your session has expired. <a href="login.html" style="color:white;text-decoration:underline;font-weight:bold;">Click here to log in again</a>';
            document.body.appendChild(banner);
        } else if (event === 'TOKEN_REFRESHED') {
            // Clear cache so next API call picks up fresh token
            clearUserCache();
            console.log('Auth token refreshed');
        }
    });

    // Signal to inline scripts that auth is ready (use effective user for role-based UI)
    window.dispatchEvent(new CustomEvent('auth-ready', { detail: { role: effectiveUser.role, email: effectiveUser.email, tier: effectiveUser.current_tier || 'carbon' } }));

    console.log("Auth ready — role:", effectiveUser.role, effectiveUser.isImpersonated ? '(impersonating)' : '');

} catch (e) {
    console.error("Integration module error:", e);
}
