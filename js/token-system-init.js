/**
 * Token System Initialization Helper
 * Ensures token system initializes after Supabase auth is ready
 */

(function() {
    'use strict';

    // Wait for Supabase to be available
    function waitForSupabase(callback, maxAttempts = 50) {
        let attempts = 0;
        
        function check() {
            attempts++;
            
            if (window.supabase && window.supabase.auth) {
                callback();
                return;
            }
            
            if (attempts < maxAttempts) {
                setTimeout(check, 100);
            } else {
                console.warn('Token System: Supabase not available after max attempts');
            }
        }
        
        check();
    }

    // Initialize when DOM is ready and Supabase is available
    function init() {
        waitForSupabase(() => {
            // Listen for auth state changes
            window.supabase.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
                    console.log('Token System: Auth ready, initializing...');
                    if (window.TokenSystem) {
                        window.TokenSystem.fetchBalance();
                    }
                }
                
                if (event === 'SIGNED_OUT') {
                    console.log('Token System: User signed out');
                    if (window.TokenSystem) {
                        // Reset token display
                        const badge = document.getElementById('ezra-token-balance');
                        if (badge) {
                            badge.textContent = '⚡ 0';
                            badge.className = 'ezra-token-badge healthy';
                        }
                    }
                }
            });
            
            // Initial fetch if already signed in
            window.supabase.auth.getUser().then(({ data: { user } }) => {
                if (user && window.TokenSystem) {
                    window.TokenSystem.fetchBalance();
                }
            });
        });
    }

    // Start initialization
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
