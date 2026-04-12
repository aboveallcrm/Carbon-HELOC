/**
 * Quote Builder Follow-Up System
 * Phase 2: Track quotes, send reminders, prep for objections
 */

(function() {
    'use strict';

    // Quote History Storage
    const QB_STORAGE_KEY = 'quote_builder_history';
    
    // Follow-up intervals (in days)
    const FOLLOW_UP_SCHEDULE = [2, 5, 10, 30];
    
    // Initialize follow-up system
    function initFollowUpSystem() {
        console.log('📋 Quote Builder Follow-Up System initialized');
        checkPendingFollowUps();
        // Check every hour
        setInterval(checkPendingFollowUps, 60 * 60 * 1000);
    }

    // Save quote to history
    function saveQuote(quoteData) {
        const quotes = getQuoteHistory();
        const quote = {
            id: 'quote_' + Date.now(),
            timestamp: Date.now(),
            clientName: quoteData.clientName,
            clientPhone: quoteData.clientPhone,
            clientEmail: quoteData.clientEmail,
            amount: quoteData.amount,
            tier: quoteData.tier,
            rate: quoteData.rate,
            payment: quoteData.payment,
            purpose: quoteData.purpose,
            status: 'generated', // generated, sent, viewed, responded, won, lost
            sentTimestamp: null,
            viewedTimestamp: null,
            followUps: [],
            notes: ''
        };
        
        quotes.unshift(quote);
        
        // Keep only last 100 quotes
        if (quotes.length > 100) {
            quotes.pop();
        }
        
        localStorage.setItem(QB_STORAGE_KEY, JSON.stringify(quotes));
        return quote.id;
    }

    // Get quote history
    function getQuoteHistory() {
        try {
            const stored = localStorage.getItem(QB_STORAGE_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            return [];
        }
    }

    // Update quote status
    function updateQuoteStatus(quoteId, status, notes = '') {
        const quotes = getQuoteHistory();
        const quote = quotes.find(q => q.id === quoteId);
        if (!quote) return false;
        
        quote.status = status;
        if (notes) quote.notes = notes;
        
        if (status === 'sent' && !quote.sentTimestamp) {
            quote.sentTimestamp = Date.now();
        }
        if (status === 'viewed' && !quote.viewedTimestamp) {
            quote.viewedTimestamp = Date.now();
        }
        if (status === 'responded') {
            quote.respondedTimestamp = Date.now();
        }
        
        localStorage.setItem(QB_STORAGE_KEY, JSON.stringify(quotes));
        return true;
    }

    // Check for pending follow-ups
    function checkPendingFollowUps() {
        const quotes = getQuoteHistory();
        const now = Date.now();
        const pendingFollowUps = [];
        
        quotes.forEach(quote => {
            if (quote.status === 'won' || quote.status === 'lost') return;
            
            const sentTime = quote.sentTimestamp || quote.timestamp;
            const daysSinceSent = Math.floor((now - sentTime) / (1000 * 60 * 60 * 24));
            
            // Check if any follow-up is due
            FOLLOW_UP_SCHEDULE.forEach((day, index) => {
                if (daysSinceSent >= day && !quote.followUps[index]) {
                    pendingFollowUps.push({
                        quote,
                        followUpIndex: index,
                        daysSinceSent
                    });
                }
            });
        });
        
        if (pendingFollowUps.length > 0) {
            showFollowUpNotification(pendingFollowUps);
        }
        
        return pendingFollowUps;
    }

    // Show follow-up notification
    function showFollowUpNotification(pendingFollowUps) {
        // Don't show multiple notifications
        if (document.getElementById('qb-followup-notification')) return;
        
        const count = pendingFollowUps.length;
        const notification = document.createElement('div');
        notification.id = 'qb-followup-notification';
        notification.className = 'qb-followup-notification';
        notification.innerHTML = `
            <div class="qb-followup-content">
                <span class="qb-followup-icon">🔔</span>
                <div class="qb-followup-text">
                    <strong>${count} quote${count > 1 ? 's' : ''} need follow-up</strong>
                    <span>Click to view and take action</span>
                </div>
                <button class="qb-followup-view" onclick="window.QuoteBuilderFollowUp.showFollowUpDashboard()">
                    View
                </button>
                <button class="qb-followup-dismiss" onclick="this.parentElement.parentElement.remove()">
                    ×
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            notification.remove();
        }, 10000);
    }

    // Show follow-up dashboard
    function showFollowUpDashboard() {
        const quotes = getQuoteHistory();
        const pendingQuotes = quotes.filter(q => 
            q.status !== 'won' && q.status !== 'lost'
        );
        
        const modal = document.createElement('div');
        modal.className = 'quote-builder-overlay';
        modal.id = 'qb-followup-dashboard';
        modal.innerHTML = `
            <div class="quote-builder-modal qb-followup-modal">
                <div class="qb-header">
                    <div class="qb-title">
                        <span class="qb-icon">📋</span>
                        <div>
                            <h3>Quote Follow-Ups</h3>
                            <span class="qb-subtitle">Track and follow up on sent quotes</span>
                        </div>
                    </div>
                    <button class="qb-close" onclick="this.closest('.quote-builder-overlay').remove()">×</button>
                </div>
                
                <div class="qb-followup-tabs">
                    <button class="qb-tab active" onclick="window.QuoteBuilderFollowUp.switchTab('pending')">
                        Pending (${pendingQuotes.length})
                    </button>
                    <button class="qb-tab" onclick="window.QuoteBuilderFollowUp.switchTab('won')">
                        Won (${quotes.filter(q => q.status === 'won').length})
                    </button>
                    <button class="qb-tab" onclick="window.QuoteBuilderFollowUp.switchTab('lost')">
                        Lost (${quotes.filter(q => q.status === 'lost').length})
                    </button>
                </div>
                
                <div class="qb-followup-list">
                    ${renderQuoteList(pendingQuotes)}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Remove notification if exists
        const notification = document.getElementById('qb-followup-notification');
        if (notification) notification.remove();
    }

    // Render quote list
    function renderQuoteList(quotes) {
        if (quotes.length === 0) {
            return `
                <div class="qb-no-quotes">
                    <span class="qb-no-quotes-icon">📭</span>
                    <p>No quotes in this category</p>
                </div>
            `;
        }
        
        return quotes.map(quote => {
            const daysSince = Math.floor((Date.now() - (quote.sentTimestamp || quote.timestamp)) / (1000 * 60 * 60 * 24));
            const nextFollowUp = getNextFollowUp(quote);
            
            return `
                <div class="qb-quote-item ${quote.status}">
                    <div class="qb-quote-header">
                        <span class="qb-quote-name">${quote.clientName}</span>
                        <span class="qb-quote-status ${quote.status}">${formatStatus(quote.status)}</span>
                    </div>
                    <div class="qb-quote-details">
                        <span class="qb-quote-amount">$${quote.amount.toLocaleString()}</span>
                        <span class="qb-quote-tier">Tier ${quote.tier} @ ${quote.rate}%</span>
                        <span class="qb-quote-time">${daysSince} days ago</span>
                    </div>
                    ${nextFollowUp ? `
                        <div class="qb-quote-followup-due">
                            🔔 Follow-up ${nextFollowUp.overdue ? 'overdue' : 'due'}: ${nextFollowUp.text}
                        </div>
                    ` : ''}
                    <div class="qb-quote-actions">
                        ${renderQuoteActions(quote)}
                    </div>
                </div>
            `;
        }).join('');
    }

    // Get next follow-up info
    function getNextFollowUp(quote) {
        if (quote.status === 'won' || quote.status === 'lost') return null;
        
        const sentTime = quote.sentTimestamp || quote.timestamp;
        const daysSince = Math.floor((Date.now() - sentTime) / (1000 * 60 * 60 * 24));
        
        for (let i = 0; i < FOLLOW_UP_SCHEDULE.length; i++) {
            if (!quote.followUps[i] && daysSince >= FOLLOW_UP_SCHEDULE[i]) {
                return {
                    overdue: daysSince > FOLLOW_UP_SCHEDULE[i],
                    text: `${FOLLOW_UP_SCHEDULE[i]} day follow-up`
                };
            }
        }
        
        return null;
    }

    // Format status for display
    function formatStatus(status) {
        const statusMap = {
            'generated': 'Generated',
            'sent': 'Sent',
            'viewed': 'Viewed',
            'responded': 'Responded',
            'won': 'Won',
            'lost': 'Lost'
        };
        return statusMap[status] || status;
    }

    // Render quote actions based on status
    function renderQuoteActions(quote) {
        const actions = [];
        
        if (quote.status === 'generated') {
            actions.push(`<button onclick="window.QuoteBuilderFollowUp.sendQuote('${quote.id}')">📧 Send</button>`);
        }
        
        if (quote.status === 'sent' || quote.status === 'viewed') {
            actions.push(`<button onclick="window.QuoteBuilderFollowUp.draftFollowUp('${quote.id}')">📝 Draft Follow-up</button>`);
            actions.push(`<button onclick="window.QuoteBuilderFollowUp.markAsWon('${quote.id}')">✓ Mark Won</button>`);
            actions.push(`<button onclick="window.QuoteBuilderFollowUp.markAsLost('${quote.id}')">✗ Mark Lost</button>`);
        }
        
        if (quote.status === 'responded') {
            actions.push(`<button onclick="window.QuoteBuilderFollowUp.markAsWon('${quote.id}')">✓ Mark Won</button>`);
            actions.push(`<button onclick="window.QuoteBuilderFollowUp.markAsLost('${quote.id}')">✗ Mark Lost</button>`);
        }
        
        actions.push(`<button onclick="window.QuoteBuilderFollowUp.viewQuote('${quote.id}')">👁 View</button>`);
        
        return actions.join('');
    }

    // Draft follow-up message
    function draftFollowUp(quoteId) {
        const quotes = getQuoteHistory();
        const quote = quotes.find(q => q.id === quoteId);
        if (!quote) return;
        
        const daysSince = Math.floor((Date.now() - (quote.sentTimestamp || quote.timestamp)) / (1000 * 60 * 60 * 24));
        const firstName = quote.clientName.split(' ')[0];
        
        let message = '';
        if (daysSince <= 3) {
            message = `Hi ${firstName}, following up on the HELOC quote I sent. The ${quote.rate}% rate is still available. Any questions I can answer?`;
        } else if (daysSince <= 7) {
            message = `Hi ${firstName}, wanted to check in on the HELOC quote. Rates have ${Math.random() > 0.5 ? 'stayed stable' : 'ticked up slightly'} since we spoke. Still interested in moving forward?`;
        } else {
            message = `Hi ${firstName}, following up on the HELOC quote from last week. The ${quote.rate}% rate is still available for now. Let me know if you'd like to discuss or if your situation has changed.`;
        }
        
        // Show draft modal
        const modal = document.createElement('div');
        modal.className = 'quote-builder-overlay';
        modal.innerHTML = `
            <div class="quote-builder-modal qb-draft-modal">
                <div class="qb-header">
                    <div class="qb-title">
                        <span class="qb-icon">📝</span>
                        <h3>Draft Follow-up</h3>
                    </div>
                    <button class="qb-close" onclick="this.closest('.quote-builder-overlay').remove()">×</button>
                </div>
                
                <div class="qb-draft-content">
                    <p><strong>To:</strong> ${quote.clientName}</p>
                    <p><strong>Subject:</strong> Following up on your HELOC quote</p>
                    
                    <textarea class="qb-draft-message" id="qb-followup-message">${message}</textarea>
                    
                    <div class="qb-draft-actions">
                        <button class="qb-btn-secondary" onclick="this.closest('.quote-builder-overlay').remove()">Cancel</button>
                        <button class="qb-btn-primary" onclick="window.QuoteBuilderFollowUp.sendFollowUp('${quoteId}')">Send Follow-up</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    // Send follow-up
    function sendFollowUp(quoteId) {
        const message = document.getElementById('qb-followup-message')?.value;
        if (!message) return;
        
        // Update quote with follow-up
        const quotes = getQuoteHistory();
        const quote = quotes.find(q => q.id === quoteId);
        if (quote) {
            const daysSince = Math.floor((Date.now() - (quote.sentTimestamp || quote.timestamp)) / (1000 * 60 * 60 * 24));
            const followUpIndex = FOLLOW_UP_SCHEDULE.findIndex(day => daysSince >= day && !quote.followUps[FOLLOW_UP_SCHEDULE.indexOf(day)]);
            if (followUpIndex >= 0) {
                quote.followUps[followUpIndex] = {
                    timestamp: Date.now(),
                    message: message
                };
                localStorage.setItem(QB_STORAGE_KEY, JSON.stringify(quotes));
            }
        }
        
        // Close modal
        const modal = document.querySelector('.quote-builder-overlay');
        if (modal) modal.remove();
        
        // Copy to clipboard
        navigator.clipboard.writeText(message);
        showToast('Follow-up copied! Paste in your SMS/email app.');
    }

    // Mark as won
    function markAsWon(quoteId) {
        updateQuoteStatus(quoteId, 'won', 'Deal closed successfully');
        showFollowUpDashboard(); // Refresh
        showToast('🎉 Congratulations! Deal marked as won.');
    }

    // Mark as lost
    function markAsLost(quoteId) {
        const reason = prompt('Why was this deal lost? (optional)');
        updateQuoteStatus(quoteId, 'lost', reason || '');
        showFollowUpDashboard(); // Refresh
        showToast('Deal marked as lost. On to the next one!');
    }

    // Send quote (mark as sent)
    function sendQuote(quoteId) {
        updateQuoteStatus(quoteId, 'sent');
        showFollowUpDashboard(); // Refresh
        showToast('Quote marked as sent. Follow-up reminder set.');
    }

    // View quote details
    function viewQuote(quoteId) {
        const quotes = getQuoteHistory();
        const quote = quotes.find(q => q.id === quoteId);
        if (!quote) return;
        
        alert(`Quote Details:\n\nClient: ${quote.clientName}\nAmount: $${quote.amount.toLocaleString()}\nTier: ${quote.tier} @ ${quote.rate}%\nPayment: $${quote.payment}/mo\nStatus: ${formatStatus(quote.status)}\n\nNotes: ${quote.notes || 'None'}`);
    }

    // Switch tab in dashboard
    function switchTab(tab) {
        const quotes = getQuoteHistory();
        let filteredQuotes = [];
        
        switch(tab) {
            case 'pending':
                filteredQuotes = quotes.filter(q => q.status !== 'won' && q.status !== 'lost');
                break;
            case 'won':
                filteredQuotes = quotes.filter(q => q.status === 'won');
                break;
            case 'lost':
                filteredQuotes = quotes.filter(q => q.status === 'lost');
                break;
        }
        
        // Update tabs
        document.querySelectorAll('.qb-followup-tabs .qb-tab').forEach(t => {
            t.classList.remove('active');
        });
        event.target.classList.add('active');
        
        // Update list
        const listEl = document.querySelector('.qb-followup-list');
        if (listEl) {
            listEl.innerHTML = renderQuoteList(filteredQuotes);
        }
    }

    // Show toast
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'qb-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // Expose globally
    window.QuoteBuilderFollowUp = {
        init: initFollowUpSystem,
        saveQuote,
        getQuoteHistory,
        updateQuoteStatus,
        showFollowUpDashboard,
        draftFollowUp,
        sendFollowUp,
        markAsWon,
        markAsLost,
        sendQuote,
        viewQuote,
        switchTab,
        checkPendingFollowUps
    };

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initFollowUpSystem);
    } else {
        initFollowUpSystem();
    }
})();
