/**
 * Token System for Above All Carbon HELOC
 * Adds token-based AI consumption to the HTML app
 * 
 * Features:
 * - Token balance management
 * - Token consumption before AI calls
 * - Purchase tokens via Stripe
 * - Low balance warnings
 */

(function() {
    'use strict';

    // Token System Configuration
    const TOKEN_CONFIG = {
        // Feature costs in tokens
        costs: {
            strategy: { cost: 10, name: 'Strategy Generation' },
            sales_script: { cost: 15, name: 'Sales Script' },
            objection_handler: { cost: 8, name: 'Objection Handler' },
            email_template: { cost: 12, name: 'Email Template' },
            competitive_analysis: { cost: 20, name: 'Competitive Analysis' },
            chat_message: { cost: 2, name: 'Chat Message' }
        },
        
        // Monthly bonuses by tier
        monthlyBonuses: {
            starter: 100,
            pro: 500,
            enterprise: 2000
        },
        
        // Low balance thresholds
        thresholds: {
            low: 50,
            critical: 20
        }
    };

    // Token System State
    let tokenState = {
        balance: 0,
        lifetimeEarned: 0,
        lifetimeSpent: 0,
        loading: false,
        lastFetch: null
    };

    // Initialize Token System
    function initTokenSystem() {
        console.log('🔑 Token System: Initializing...');
        
        // Check if Supabase is available
        if (!window.supabase) {
            console.warn('🔑 Token System: Supabase not available, will retry...');
            setTimeout(initTokenSystem, 1000);
            return;
        }
        
        // Load balance on startup
        fetchTokenBalance();
        
        // Set up periodic refresh (every 30 seconds)
        setInterval(fetchTokenBalance, 30000);
        
        // Listen for auth state changes
        window.addEventListener('auth-ready', fetchTokenBalance);
        
        console.log('🔑 Token System: Initialized successfully');
    }

    // Fetch token balance from Supabase
    async function fetchTokenBalance() {
        if (tokenState.loading) return;
        
        // Check if Supabase is available
        if (!window.supabase) {
            console.warn('🔑 Token System: Supabase not available');
            return;
        }
        
        tokenState.loading = true;
        
        try {
            const { data: { user } } = await window.supabase.auth.getUser();
            if (!user) {
                console.log('🔑 Token System: No user logged in');
                tokenState.balance = 0;
                updateTokenDisplay();
                return;
            }
            
            console.log('🔑 Token System: Fetching balance for user', user.id);

            const { data, error } = await window.supabase
                .from('user_tokens')
                .select('balance, lifetime_earned, lifetime_spent')
                .eq('user_id', user.id)
                .single();

            if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
                console.error('Error fetching token balance:', error);
                return;
            }

            if (data) {
                tokenState.balance = data.balance;
                tokenState.lifetimeEarned = data.lifetime_earned;
                tokenState.lifetimeSpent = data.lifetime_spent;
                console.log(`🔑 Token System: Balance fetched - ${tokenState.balance} tokens`);
            } else {
                // No token record yet - this is normal for new users
                // The database trigger should create it, but we'll show 0 until then
                tokenState.balance = 0;
                tokenState.lifetimeEarned = 0;
                console.log('🔑 Token System: No token record yet (will be created on first use)');
                tokenState.lifetimeSpent = 0;
            }
            
            tokenState.lastFetch = Date.now();
            updateTokenDisplay();
            
        } catch (err) {
            console.error('Token system error:', err);
        } finally {
            tokenState.loading = false;
        }
    }

    // Consume tokens for a feature
    async function consumeTokens(featureType, metadata = {}) {
        const feature = TOKEN_CONFIG.costs[featureType];
        if (!feature) {
            return { success: false, error: 'Invalid feature type' };
        }

        // Check balance first
        if (tokenState.balance < feature.cost) {
            showInsufficientTokensModal(feature.cost);
            return { success: false, error: 'Insufficient tokens' };
        }

        try {
            const { data: { user } } = await window.supabase.auth.getUser();
            if (!user) {
                return { success: false, error: 'Not authenticated' };
            }

            // Call the debit_tokens function
            const { data, error } = await window.supabase.rpc('debit_tokens', {
                p_user_id: user.id,
                p_amount: feature.cost,
                p_feature_type: featureType,
                p_description: feature.name,
                p_metadata: metadata
            });

            if (error) throw error;

            if (data && data[0]) {
                const result = data[0];
                if (result.success) {
                    tokenState.balance = result.new_balance;
                    tokenState.lifetimeSpent += feature.cost;
                    updateTokenDisplay();
                    return { success: true, newBalance: result.new_balance };
                } else {
                    showInsufficientTokensModal(feature.cost);
                    return { success: false, error: result.error_message };
                }
            }

            return { success: false, error: 'Unknown error' };
        } catch (err) {
            console.error('Error consuming tokens:', err);
            return { success: false, error: err.message };
        }
    }

    // Check if user has enough tokens
    function hasEnoughTokens(featureType) {
        const feature = TOKEN_CONFIG.costs[featureType];
        if (!feature) return false;
        return tokenState.balance >= feature.cost;
    }

    // Get token cost for a feature
    function getTokenCost(featureType) {
        return TOKEN_CONFIG.costs[featureType]?.cost || 0;
    }

    // Update token display in Ezra widget
    function updateTokenDisplay() {
        const tokenBadge = document.getElementById('ezra-token-balance');
        if (!tokenBadge) return;

        const balance = tokenState.balance;
        const isLow = balance < TOKEN_CONFIG.thresholds.low;
        const isCritical = balance < TOKEN_CONFIG.thresholds.critical;

        // Update text
        tokenBadge.textContent = `⚡ ${balance.toLocaleString()}`;
        
        // Update styling
        tokenBadge.className = 'ezra-token-badge';
        if (isCritical) {
            tokenBadge.classList.add('critical');
        } else if (isLow) {
            tokenBadge.classList.add('low');
        } else {
            tokenBadge.classList.add('healthy');
        }

        // Show low balance warning if needed
        if (isLow && !tokenState.warningShown) {
            showLowBalanceWarning();
            tokenState.warningShown = true;
        }
    }

    // Show insufficient tokens modal
    function showInsufficientTokensModal(required) {
        const modal = document.createElement('div');
        modal.className = 'token-modal-overlay';
        modal.innerHTML = `
            <div class="token-modal">
                <div class="token-modal-header">
                    <h3>⚡ Insufficient Tokens</h3>
                    <button class="token-modal-close" onclick="this.closest('.token-modal-overlay').remove()">×</button>
                </div>
                <div class="token-modal-body">
                    <p>You need <strong>${required} tokens</strong> for this feature.</p>
                    <p>Your current balance: <strong>${tokenState.balance.toLocaleString()} tokens</strong></p>
                    <div class="token-modal-actions">
                        <button class="btn-primary" onclick="window.TokenSystem.showPurchaseModal(); this.closest('.token-modal-overlay').remove()">
                            Purchase Tokens
                        </button>
                        <button class="btn-secondary" onclick="this.closest('.token-modal-overlay').remove()">
                            Maybe Later
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Show low balance warning
    function showLowBalanceWarning() {
        // Only show once per session
        if (sessionStorage.getItem('tokenWarningShown')) return;
        sessionStorage.setItem('tokenWarningShown', 'true');

        const toast = document.createElement('div');
        toast.className = 'token-toast warning';
        toast.innerHTML = `
            <span>⚡ Low token balance: ${tokenState.balance.toLocaleString()} tokens remaining</span>
            <button onclick="window.TokenSystem.showPurchaseModal(); this.parentElement.remove()">Buy More</button>
        `;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.remove(), 10000);
    }

    // Show token purchase modal
    function showPurchaseModal() {
        const packages = [
            { name: 'Starter Pack', tokens: 500, price: 4.99, bonus: 0 },
            { name: 'Pro Pack', tokens: 2000, price: 14.99, bonus: 10 },
            { name: 'Power Pack', tokens: 5000, price: 29.99, bonus: 20 },
            { name: 'Enterprise Pack', tokens: 15000, price: 79.99, bonus: 50 }
        ];

        const modal = document.createElement('div');
        modal.className = 'token-modal-overlay';
        modal.id = 'token-purchase-modal';
        
        modal.innerHTML = `
            <div class="token-modal purchase-modal">
                <div class="token-modal-header">
                    <h3>⚡ Purchase Tokens</h3>
                    <button class="token-modal-close" onclick="this.closest('.token-modal-overlay').remove()">×</button>
                </div>
                <div class="token-modal-body">
                    <p class="token-intro">Tokens are used for AI-powered features. Purchase more to continue using Ezra's advanced features.</p>
                    
                    <div class="token-packages">
                        ${packages.map(pkg => {
                            const bonusTokens = Math.floor(pkg.tokens * (pkg.bonus / 100));
                            const totalTokens = pkg.tokens + bonusTokens;
                            return `
                                <div class="token-package" data-package="${pkg.name}">
                                    <div class="package-header">
                                        <h4>${pkg.name}</h4>
                                        ${pkg.bonus > 0 ? `<span class="package-bonus">+${pkg.bonus}% bonus</span>` : ''}
                                    </div>
                                    <div class="package-tokens">
                                        <span class="token-amount">${totalTokens.toLocaleString()}</span>
                                        <span class="token-label">tokens</span>
                                        ${bonusTokens > 0 ? `<span class="bonus-amount">(${pkg.tokens.toLocaleString()} + ${bonusTokens.toLocaleString()} bonus)</span>` : ''}
                                    </div>
                                    <div class="package-price">$${pkg.price}</div>
                                    <button class="btn-purchase" onclick="window.TokenSystem.initiatePurchase('${pkg.name}')">Purchase</button>
                                </div>
                            `;
                        }).join('')}
                    </div>
                    
                    <div class="token-info">
                        <h4>Current Balance: ${tokenState.balance.toLocaleString()} tokens</h4>
                        <p class="token-features">Feature costs: Strategy (10) • Sales Script (15) • Objections (8) • Emails (12) • Analysis (20)</p>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    // Initiate token purchase
    async function initiatePurchase(packageName) {
        try {
            const { data: { user } } = await window.supabase.auth.getUser();
            if (!user) {
                alert('Please sign in to purchase tokens');
                return;
            }

            // Get package ID from database
            const { data: pkg, error } = await window.supabase
                .from('token_pricing')
                .select('id')
                .eq('name', packageName)
                .single();

            if (error || !pkg) {
                alert('Package not found. Please try again.');
                return;
            }

            // Call edge function to create checkout
            const { data, error: fnError } = await window.supabase.functions.invoke('create-token-checkout', {
                body: { packageId: pkg.id, userId: user.id }
            });

            if (fnError) throw fnError;

            if (data?.url) {
                // Open Stripe checkout in new tab
                window.open(data.url, '_blank');
            } else {
                alert('Failed to create checkout session. Please try again.');
            }
        } catch (err) {
            console.error('Purchase error:', err);
            alert('Failed to initiate purchase. Please try again.');
        }
    }

    // Get current balance
    function getBalance() {
        return tokenState.balance;
    }

    // Get token state
    function getState() {
        return { ...tokenState };
    }

    // Expose Token System globally
    window.TokenSystem = {
        init: initTokenSystem,
        fetchBalance,
        consumeTokens,
        hasEnoughTokens,
        getTokenCost,
        showPurchaseModal,
        initiatePurchase,
        getBalance,
        getState,
        config: TOKEN_CONFIG
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initTokenSystem);
    } else {
        initTokenSystem();
    }
})();
