/**
 * Quote Builder Quick Actions Bar
 * Phase 3: Floating action bar for one-click access to all features
 */

(function() {
    'use strict';

    // Quick Actions State
    let actionsState = {
        isExpanded: false,
        isVisible: true,
        position: 'bottom-right' // bottom-right, bottom-left, top-right, top-left
    };

    // Quick Actions Configuration
    const QUICK_ACTIONS = [
        {
            id: 'new-quote',
            label: 'New Quote',
            icon: '+',
            shortcut: 'Ctrl+Q',
            action: () => window.QuoteBuilderV2?.start(),
            primary: true
        },
        {
            id: 'voice',
            label: 'Voice Input',
            icon: '🎤',
            shortcut: 'Hold V',
            action: () => window.QuoteBuilderVoice?.start(),
            condition: () => window.QuoteBuilderVoice?.isSupported()
        },
        {
            id: 'presentation',
            label: 'Presentation Mode',
            icon: '📺',
            shortcut: 'Ctrl+P',
            action: () => window.QuoteBuilderPresentation?.start()
        },
        {
            id: 'compare',
            label: 'Compare Deals',
            icon: '⚖️',
            shortcut: 'Ctrl+Shift+C',
            action: () => window.QuoteBuilderCompare?.open()
        },
        {
            id: 'objections',
            label: 'Objection Finder',
            icon: '🔍',
            shortcut: 'Ctrl+O',
            action: () => window.QuoteBuilderObjections?.showObjectionFinder()
        },
        {
            id: 'followups',
            label: 'Quote Follow-ups',
            icon: '🔔',
            shortcut: 'Ctrl+F',
            action: () => window.QuoteBuilderFollowUp?.showFollowUpDashboard(),
            badge: () => getPendingFollowUpCount()
        },
        {
            id: 'prep',
            label: 'Pre-Call Briefing',
            icon: '🎯',
            shortcut: 'Ctrl+B',
            action: () => showPreCallBriefing()
        }
    ];

    // Initialize quick actions
    function initQuickActions() {
        console.log('⚡ Quick Actions Bar initialized');
        renderQuickActionsBar();
        addKeyboardListeners();
        addContextualTriggers();
    }

    // Get pending follow-up count
    function getPendingFollowUpCount() {
        const quotes = window.QuoteBuilderFollowUp?.getQuoteHistory?.() || [];
        return quotes.filter(q => q.status !== 'won' && q.status !== 'lost').length;
    }

    // Render quick actions bar
    function renderQuickActionsBar() {
        // Remove existing
        const existing = document.getElementById('qb-quick-actions');
        if (existing) existing.remove();
        
        const bar = document.createElement('div');
        bar.id = 'qb-quick-actions';
        bar.className = `qb-quick-actions ${actionsState.position} ${actionsState.isExpanded ? 'expanded' : ''}`;
        
        const visibleActions = QUICK_ACTIONS.filter(a => !a.condition || a.condition());
        
        bar.innerHTML = `
            <button class="qb-quick-toggle" onclick="window.QuoteBuilderQuickActions.toggle()" title="Quick Actions">
                <span class="qb-quick-toggle-icon">⚡</span>
            </button>
            
            <div class="qb-quick-menu">
                ${visibleActions.map(action => `
                    <button class="qb-quick-action ${action.primary ? 'primary' : ''}" 
                            onclick="window.QuoteBuilderQuickActions.execute('${action.id}')"
                            title="${action.label} (${action.shortcut})">
                        <span class="qb-quick-action-icon">${action.icon}</span>
                        <span class="qb-quick-action-label">${action.label}</span>
                        ${action.badge ? `<span class="qb-quick-badge">${action.badge()}</span>` : ''}
                    </button>
                `).join('')}
            </div>
            
            <div class="qb-quick-hint">
                <span>Press ? for shortcuts</span>
            </div>
        `;
        
        document.body.appendChild(bar);
    }

    // Toggle expanded state
    function toggle() {
        actionsState.isExpanded = !actionsState.isExpanded;
        const bar = document.getElementById('qb-quick-actions');
        if (bar) {
            bar.classList.toggle('expanded', actionsState.isExpanded);
        }
    }

    // Execute action
    function execute(actionId) {
        const action = QUICK_ACTIONS.find(a => a.id === actionId);
        if (action?.action) {
            action.action();
            // Auto-collapse after action
            actionsState.isExpanded = false;
            const bar = document.getElementById('qb-quick-actions');
            if (bar) bar.classList.remove('expanded');
        }
    }

    // Add keyboard listeners
    function addKeyboardListeners() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger if typing in input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            // Toggle with ? key
            if (e.key === '?' || e.key === '/') {
                e.preventDefault();
                toggle();
                return;
            }
            
            // Close with Escape
            if (e.key === 'Escape' && actionsState.isExpanded) {
                actionsState.isExpanded = false;
                const bar = document.getElementById('qb-quick-actions');
                if (bar) bar.classList.remove('expanded');
                return;
            }
            
            // Check shortcuts
            checkShortcuts(e);
        });
    }

    // Check keyboard shortcuts
    function checkShortcuts(e) {
        // Ctrl+Q - New Quote
        if ((e.ctrlKey || e.metaKey) && e.key === 'q') {
            e.preventDefault();
            window.QuoteBuilderV2?.start();
            return;
        }
        
        // Ctrl+P - Presentation Mode
        if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
            e.preventDefault();
            window.QuoteBuilderPresentation?.start();
            return;
        }
        
        // Ctrl+Shift+C - Compare
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
            e.preventDefault();
            window.QuoteBuilderCompare?.open();
            return;
        }
        
        // Ctrl+O - Objection Finder
        if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
            e.preventDefault();
            window.QuoteBuilderObjections?.showObjectionFinder();
            return;
        }
        
        // Ctrl+F - Follow-ups
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            window.QuoteBuilderFollowUp?.showFollowUpDashboard();
            return;
        }
        
        // Ctrl+B - Pre-call Briefing
        if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
            e.preventDefault();
            showPreCallBriefing();
            return;
        }
        
        // Hold V for Voice
        if (e.key === 'v' && !e.ctrlKey && !e.metaKey) {
            if (window.QuoteBuilderVoice?.isSupported()) {
                window.QuoteBuilderVoice?.start();
            }
        }
    }

    // Add contextual triggers
    function addContextualTriggers() {
        // Show follow-up notification if pending
        setTimeout(() => {
            const count = getPendingFollowUpCount();
            if (count > 0) {
                showContextualNotification(`${count} quote${count > 1 ? 's' : ''} need follow-up`, () => {
                    window.QuoteBuilderFollowUp?.showFollowUpDashboard();
                });
            }
        }, 5000);
    }

    // Show contextual notification
    function showContextualNotification(message, onClick) {
        const notification = document.createElement('div');
        notification.className = 'qb-contextual-notification';
        notification.innerHTML = `
            <span class="qb-contextual-icon">🔔</span>
            <span class="qb-contextual-message">${message}</span>
            <button class="qb-contextual-action">View</button>
        `;
        
        notification.querySelector('.qb-contextual-action').addEventListener('click', () => {
            onClick();
            notification.remove();
        });
        
        document.body.appendChild(notification);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 10000);
    }

    // Show pre-call briefing
    function showPreCallBriefing() {
        // Get current form data
        const clientName = document.getElementById('in-client-name')?.value || 'Client';
        const cashNeeded = parseFloat(document.getElementById('in-net-cash')?.value) || 75000;
        const creditScore = document.getElementById('in-client-credit')?.value || '720-759';
        const homeValue = parseFloat(document.getElementById('in-home-value')?.value) || 650000;
        const mortgageBalance = parseFloat(document.getElementById('in-mortgage-balance')?.value) || 320000;
        const purpose = document.getElementById('in-purpose')?.value || 'home improvement';
        
        // Parse credit score
        const creditNum = parseInt(creditScore) || 720;
        
        // Calculate LTV
        const ltv = ((mortgageBalance + cashNeeded) / homeValue) * 100;
        
        // Determine tier
        let tier = '2', rate = '6.375';
        if (creditNum >= 760) {
            tier = '1';
            rate = '5.125';
        } else if (creditNum < 680) {
            tier = '3';
            rate = '7.125';
        }
        
        // Calculate payment
        const monthlyRate = parseFloat(rate) / 100 / 12;
        const numPayments = 20 * 12;
        const payment = Math.round(cashNeeded * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1));
        
        window.QuoteBuilderObjections?.showObjectionPrep({
            clientName,
            amount: cashNeeded,
            creditScore: creditNum,
            ltv,
            tier,
            rate,
            monthlyPayment: payment,
            purpose
        });
    }

    // Show shortcuts help
    function showShortcutsHelp() {
        const modal = document.createElement('div');
        modal.className = 'quote-builder-overlay';
        modal.innerHTML = `
            <div class="quote-builder-modal qb-shortcuts-help">
                <div class="qb-header">
                    <h3>⌨️ Keyboard Shortcuts</h3>
                    <button class="qb-close" onclick="this.closest('.quote-builder-overlay').remove()">×</button>
                </div>
                <div class="qb-shortcuts-list">
                    ${QUICK_ACTIONS.map(a => `
                        <div class="qb-shortcut-item">
                            <span class="qb-shortcut-keys">${a.shortcut}</span>
                            <span class="qb-shortcut-label">${a.label}</span>
                        </div>
                    `).join('')}
                    <div class="qb-shortcut-item">
                        <span class="qb-shortcut-keys">?</span>
                        <span class="qb-shortcut-label">Toggle Quick Actions</span>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Update badge counts
    function updateBadges() {
        const bar = document.getElementById('qb-quick-actions');
        if (!bar) return;
        
        const followupAction = bar.querySelector('[data-action="followups"]');
        if (followupAction) {
            const count = getPendingFollowUpCount();
            const badge = followupAction.querySelector('.qb-quick-badge');
            if (badge) {
                badge.textContent = count;
                badge.style.display = count > 0 ? 'block' : 'none';
            }
        }
    }

    // Expose globally
    window.QuoteBuilderQuickActions = {
        init: initQuickActions,
        toggle,
        execute,
        showPreCallBriefing,
        showShortcutsHelp,
        updateBadges
    };

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initQuickActions);
    } else {
        initQuickActions();
    }
})();
