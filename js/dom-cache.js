/**
 * DOM Cache Module - Reduces DOM queries by caching element references
 * Usage: Import and call DOMCache.init() after DOM is ready
 */

const DOMCache = {
    elements: {},
    initialized: false,

    // Common element IDs used throughout the application
    elementIds: [
        // Quote form inputs
        'homeValue',
        'mortgageBalance', 
        'currentMortgageBalance',
        'mortgageBalanceInput',
        'helocAmount',
        'creditScore',
        'clientName',
        'clientEmail',
        'clientPhone',
        'clientNotes',
        
        // Rate inputs
        'tier1Rate',
        'tier2Rate',
        'tier3Rate',
        'tier4Rate',
        'tier1MaxLtv',
        'tier2MaxLtv',
        'tier3MaxLtv',
        'tier4MaxLtv',
        
        // Display elements
        'totalEquity',
        'availableEquity',
        'cltvRatio',
        'ltvAfterHeloc',
        'monthlyPayment',
        'maxHelocAmount',
        ' blendedRate',
        
        // Buttons
        'generateQuoteBtn',
        'saveQuoteBtn',
        'loadQuoteBtn',
        'exportPdfBtn',
        'shareQuoteBtn',
        'copyLinkBtn',
        'generateLinkBtn',
        
        // Containers
        'quoteResults',
        'quotePreview',
        'rateMatrix',
        'tierComparison',
        'savingsAnalysis',
        
        // Navigation
        'navDashboard',
        'navQuotes',
        'navLeads',
        'navSettings',
        
        // Modals
        'shareModal',
        'leadModal',
        'settingsModal',
        'ezraChatModal',
        
        // Ezra Chat
        'ezraChatInput',
        'ezraChatMessages',
        'ezraSendBtn',
        'ezraVoiceBtn',
        
        // Lead management
        'leadList',
        'leadSearch',
        'leadFilter',
        'leadCount',
        
        // Notifications
        'notificationContainer',
        'toastContainer',
        
        // Loading states
        'loadingOverlay',
        'spinner',
        
        // Auth
        'userEmail',
        'userName',
        'logoutBtn',
        'loginBtn',
        'registerBtn'
    ],

    /**
     * Initialize the DOM cache
     * Call this after DOM is fully loaded
     */
    init() {
        if (this.initialized) return;
        
        this.elementIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                this.elements[id] = element;
            }
        });
        
        this.initialized = true;
        console.log(`DOMCache: Cached ${Object.keys(this.elements).length} elements`);
    },

    /**
     * Get a cached element
     * Falls back to document.getElementById if not cached
     */
    get(id) {
        if (!this.initialized) {
            console.warn('DOMCache not initialized, calling init()');
            this.init();
        }
        
        if (this.elements[id]) {
            return this.elements[id];
        }
        
        // Fallback and cache
        const element = document.getElementById(id);
        if (element) {
            this.elements[id] = element;
        }
        return element;
    },

    /**
     * Get multiple elements at once
     */
    getMultiple(ids) {
        return ids.map(id => this.get(id));
    },

    /**
     * Check if element exists in cache
     */
    has(id) {
        return !!this.elements[id];
    },

    /**
     * Add a new element to cache dynamically
     */
    add(id) {
        const element = document.getElementById(id);
        if (element) {
            this.elements[id] = element;
            return true;
        }
        return false;
    },

    /**
     * Remove element from cache
     */
    remove(id) {
        delete this.elements[id];
    },

    /**
     * Clear the cache
     */
    clear() {
        this.elements = {};
        this.initialized = false;
    },

    /**
     * Refresh cache (useful after dynamic content changes)
     */
    refresh() {
        this.clear();
        this.init();
    },

    /**
     * Get cache statistics
     */
    stats() {
        return {
            cached: Object.keys(this.elements).length,
            totalExpected: this.elementIds.length,
            initialized: this.initialized
        };
    },

    /**
     * Batch update multiple elements' values
     */
    setValues(updates) {
        Object.entries(updates).forEach(([id, value]) => {
            const el = this.get(id);
            if (el) {
                if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                    el.value = value;
                } else {
                    el.textContent = value;
                }
            }
        });
    },

    /**
     * Batch update multiple elements' styles
     */
    setStyles(updates) {
        Object.entries(updates).forEach(([id, styles]) => {
            const el = this.get(id);
            if (el) {
                Object.assign(el.style, styles);
            }
        });
    },

    /**
     * Toggle visibility of multiple elements
     */
    toggleVisibility(ids, show) {
        ids.forEach(id => {
            const el = this.get(id);
            if (el) {
                el.style.display = show ? '' : 'none';
            }
        });
    },

    /**
     * Add event listeners to cached elements
     */
    on(ids, event, handler) {
        if (typeof ids === 'string') {
            ids = [ids];
        }
        ids.forEach(id => {
            const el = this.get(id);
            if (el) {
                el.addEventListener(event, handler);
            }
        });
    }
};

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => DOMCache.init());
} else {
    DOMCache.init();
}

// Export for use in other scripts
window.DOMCache = DOMCache;
