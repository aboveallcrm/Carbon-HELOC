/**
 * Quote Builder v2 - Refactored
 * Simplified, reliable, no timing issues
 */

(function() {
    'use strict';

    // Simple state - one source of truth
    const state = {
        step: 1,
        client: null,
        property: null,
        rates: null,
        recommendation: null,
        leads: [],
        isOpen: false
    };

    // Demo leads data
    const DEMO_LEADS = {
        bonzo: [
            { id: 1, name: 'John Smith', phone: '(555) 123-4567', email: 'john@example.com', creditScore: 760, amount: 75000, purpose: 'Kitchen remodel', status: 'Hot', address: '123 Main St, Los Angeles, CA 90210', propertyValue: 650000, mortgageBalance: 320000 },
            { id: 2, name: 'Sarah Johnson', phone: '(555) 234-5678', email: 'sarah@example.com', creditScore: 720, amount: 50000, purpose: 'Debt consolidation', status: 'Warm', address: '456 Oak Ave, San Diego, CA 92101', propertyValue: 550000, mortgageBalance: 280000 },
            { id: 3, name: 'Mike Davis', phone: '(555) 345-6789', email: 'mike@example.com', creditScore: 680, amount: 120000, purpose: 'Investment property', status: 'New', address: '789 Pine Rd, Irvine, CA 92618', propertyValue: 800000, mortgageBalance: 400000 }
        ],
        ghl: [
            { id: 4, name: 'Emily Chen', phone: '(555) 456-7890', email: 'emily@example.com', creditScore: 780, amount: 100000, purpose: 'Home addition', status: 'Hot', address: '321 Elm St, Pasadena, CA 91101', propertyValue: 750000, mortgageBalance: 350000 },
            { id: 5, name: 'Robert Wilson', phone: '(555) 567-8901', email: 'rob@example.com', creditScore: 740, amount: 60000, purpose: 'Emergency fund', status: 'Warm', address: '654 Maple Dr, Torrance, CA 90505', propertyValue: 600000, mortgageBalance: 300000 }
        ],
        crm: [
            { id: 6, name: 'Lisa Anderson', phone: '(555) 678-9012', email: 'lisa@example.com', creditScore: 750, amount: 85000, purpose: 'Pool installation', status: 'Hot', address: '987 Cedar Ln, Santa Monica, CA 90401', propertyValue: 900000, mortgageBalance: 450000 },
            { id: 7, name: 'David Brown', phone: '(555) 789-0123', email: 'david@example.com', creditScore: 700, amount: 45000, purpose: 'Medical expenses', status: 'New', address: '147 Birch St, Glendale, CA 91201', propertyValue: 500000, mortgageBalance: 250000 }
        ]
    };

    // Initialize
    function init() {
        addFloatingButton();
        console.log('✓ Quote Builder initialized');
    }

    // Add floating button
    function addFloatingButton() {
        if (document.getElementById('qb-floating-btn')) return;
        
        const btn = document.createElement('button');
        btn.id = 'qb-floating-btn';
        btn.className = 'qb-floating-btn';
        btn.innerHTML = '<span>+</span> New Quote';
        btn.title = 'New Quote (Ctrl+Q)';
        btn.onclick = open;
        document.body.appendChild(btn);

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'q') {
                e.preventDefault();
                open();
            }
        });
    }

    // Open quote builder
    function open() {
        resetState();
        state.isOpen = true;
        render();
    }

    // Close quote builder
    function close() {
        state.isOpen = false;
        const modal = document.getElementById('quote-builder-modal');
        if (modal) modal.remove();
    }

    // Reset state
    function resetState() {
        state.step = 1;
        state.client = { name: '', phone: '', email: '', creditScore: '', amount: '', purpose: '' };
        state.property = { address: '', value: '', mortgage: '' };
        state.rates = null;
        state.recommendation = null;
        state.leads = [];
    }

    // Render entire modal
    function render() {
        const existing = document.getElementById('quote-builder-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'quote-builder-modal';
        modal.className = 'quote-builder-overlay';
        modal.innerHTML = `
            <div class="quote-builder-modal">
                ${renderHeader()}
                ${renderProgress()}
                <div class="qb-body">
                    ${renderCurrentStep()}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Render header
    function renderHeader() {
        return `
            <div class="qb-header">
                <div class="qb-title">
                    <span class="qb-icon">🏗️</span>
                    <div>
                        <h3>Quote Builder</h3>
                        <span class="qb-subtitle">Build a professional HELOC quote</span>
                    </div>
                </div>
                <button class="qb-close" onclick="QuoteBuilder.close()">×</button>
            </div>
        `;
    }

    // Render progress bar
    function renderProgress() {
        return `
            <div class="qb-progress">
                <div class="qb-progress-bar">
                    <div class="qb-progress-fill" style="width: ${(state.step / 5) * 100}%"></div>
                </div>
                <div class="qb-step-indicator">Step ${state.step} of 5</div>
            </div>
        `;
    }

    // Render current step
    function renderCurrentStep() {
        switch (state.step) {
            case 1: return renderStep1();
            case 2: return renderStep2();
            case 3: return renderStep3();
            case 4: return renderStep4();
            case 5: return renderStep5();
            default: return '';
        }
    }

    // Step 1: Client Selection
    function renderStep1() {
        return `
            <div class="qb-step">
                <h4>Step 1: Who are we building this for?</h4>
                
                <div class="qb-lead-sources">
                    <p class="qb-section-label">LOAD LEAD FROM:</p>
                    <div class="qb-source-grid">
                        <button class="qb-source-btn bonzo" onclick="QuoteBuilder.loadLeads('bonzo')">
                            <span class="qb-source-icon">📋</span>
                            <span class="qb-source-name">Bonzo</span>
                        </button>
                        <button class="qb-source-btn ghl" onclick="QuoteBuilder.loadLeads('ghl')">
                            <span class="qb-source-icon">🏢</span>
                            <span class="qb-source-name">GHL</span>
                        </button>
                        <button class="qb-source-btn crm" onclick="QuoteBuilder.loadLeads('crm')">
                            <span class="qb-source-icon">📊</span>
                            <span class="qb-source-name">CRM</span>
                        </button>
                    </div>
                </div>
                
                <div id="qb-leads-list" class="qb-leads-list" style="display: none;"></div>
                
                <div class="qb-or-divider"><span>OR</span></div>
                
                <button class="qb-add-manual-btn" onclick="QuoteBuilder.showBrokerPaste()">
                    <span>📋</span> Paste Broker Launch Email
                </button>
                
                <div id="qb-broker-paste" class="qb-broker-paste" style="display: none;">
                    <textarea id="broker-text" placeholder="Paste broker launch email here..."></textarea>
                    <button class="qb-btn-primary" onclick="QuoteBuilder.parseBrokerEmail()">Extract Data</button>
                </div>
                
                <div class="qb-or-divider"><span>OR</span></div>
                
                <div class="qb-form-section">
                    <h5>Enter Client Information</h5>
                    <div class="qb-form-row">
                        <div class="qb-form-group">
                            <label>Client Name</label>
                            <input type="text" id="client-name" value="${state.client.name}" placeholder="John Smith">
                        </div>
                        <div class="qb-form-group">
                            <label>Phone</label>
                            <input type="tel" id="client-phone" value="${state.client.phone}" placeholder="(555) 123-4567">
                        </div>
                    </div>
                    <div class="qb-form-row">
                        <div class="qb-form-group">
                            <label>Credit Score</label>
                            <select id="client-credit">
                                <option value="">Select...</option>
                                <option value="760+" ${state.client.creditScore >= 760 ? 'selected' : ''}>760+ (Excellent)</option>
                                <option value="720-759" ${state.client.creditScore >= 720 && state.client.creditScore < 760 ? 'selected' : ''}>720-759 (Very Good)</option>
                                <option value="680-719" ${state.client.creditScore >= 680 && state.client.creditScore < 720 ? 'selected' : ''}>680-719 (Good)</option>
                                <option value="640-679" ${state.client.creditScore >= 640 && state.client.creditScore < 680 ? 'selected' : ''}>640-679 (Fair)</option>
                                <option value="<640" ${state.client.creditScore < 640 ? 'selected' : ''}>Below 640</option>
                            </select>
                        </div>
                        <div class="qb-form-group">
                            <label>Cash Needed</label>
                            <input type="number" id="client-amount" value="${state.client.amount}" placeholder="75000">
                        </div>
                    </div>
                    <div class="qb-form-group">
                        <label>Purpose</label>
                        <div class="qb-purpose-options">
                            <label class="qb-radio"><input type="radio" name="purpose" value="home improvement" ${state.client.purpose === 'home improvement' ? 'checked' : ''}><span>🏠 Home Improvement</span></label>
                            <label class="qb-radio"><input type="radio" name="purpose" value="debt consolidation" ${state.client.purpose === 'debt consolidation' ? 'checked' : ''}><span>💳 Debt Consolidation</span></label>
                            <label class="qb-radio"><input type="radio" name="purpose" value="investment" ${state.client.purpose === 'investment' ? 'checked' : ''}><span>📈 Investment</span></label>
                            <label class="qb-radio"><input type="radio" name="purpose" value="emergency" ${state.client.purpose === 'emergency' ? 'checked' : ''}><span>🚨 Emergency</span></label>
                        </div>
                    </div>
                </div>
                
                <div class="qb-actions">
                    <button class="qb-btn-primary" onclick="QuoteBuilder.goToStep(2)">Continue →</button>
                </div>
            </div>
        `;
    }

    // Step 2: Property
    function renderStep2() {
        return `
            <div class="qb-step">
                <h4>Step 2: Property & Equity</h4>
                
                <div class="qb-form-section">
                    <div class="qb-form-group">
                        <label>Property Address</label>
                        <input type="text" id="property-address" value="${state.property.address}" placeholder="123 Main St, City, ST 12345">
                    </div>
                    
                    <div class="qb-form-row">
                        <div class="qb-form-group">
                            <label>Property Value</label>
                            <input type="number" id="property-value" value="${state.property.value}" placeholder="650000" onchange="QuoteBuilder.calculateEquity()">
                        </div>
                        <div class="qb-form-group">
                            <label>Current Mortgage</label>
                            <input type="number" id="property-mortgage" value="${state.property.mortgage}" placeholder="320000" onchange="QuoteBuilder.calculateEquity()">
                        </div>
                    </div>
                    
                    <div id="equity-preview" class="qb-equity-preview" style="display: ${state.property.value && state.property.mortgage ? 'block' : 'none'}">
                        ${renderEquityPreview()}
                    </div>
                </div>
                
                <div class="qb-actions">
                    <button class="qb-btn-secondary" onclick="QuoteBuilder.goToStep(1)">← Back</button>
                    <button class="qb-btn-primary" onclick="QuoteBuilder.goToStep(3)">Continue →</button>
                </div>
            </div>
        `;
    }

    // Render equity preview
    function renderEquityPreview() {
        const value = parseFloat(state.property.value) || 0;
        const mortgage = parseFloat(state.property.mortgage) || 0;
        const equity = value - mortgage;
        const ltv = value > 0 ? ((mortgage / value) * 100).toFixed(1) : 0;
        
        return `
            <div class="qb-equity-card">
                <div class="qb-equity-row"><span>Property Value:</span><strong>$${value.toLocaleString()}</strong></div>
                <div class="qb-equity-row"><span>Current Mortgage:</span><strong>$${mortgage.toLocaleString()}</strong></div>
                <div class="qb-equity-row highlight"><span>Available Equity:</span><strong>$${equity.toLocaleString()}</strong></div>
                <div class="qb-equity-row"><span>Current LTV:</span><strong>${ltv}%</strong></div>
            </div>
        `;
    }

    // Step 3: Rates
    function renderStep3() {
        return `
            <div class="qb-step">
                <h4>Step 3: Import Today's Rates</h4>
                
                <div class="qb-rate-options">
                    <button class="qb-rate-option" onclick="QuoteBuilder.showRatePaste()">
                        <span class="qb-rate-icon">📋</span>
                        <h5>Paste Rate Sheet</h5>
                        <p>From Figure or Nifty Door</p>
                    </button>
                    <button class="qb-rate-option" onclick="QuoteBuilder.goToStep(4)">
                        <span class="qb-rate-icon">✓</span>
                        <h5>Use Current Rates</h5>
                        <p>From rate matrix</p>
                    </button>
                </div>
                
                <div id="rate-paste-area" class="qb-rate-paste-area" style="display: none;">
                    <div class="qb-rate-instructions">
                        <p><strong>How to copy from Figure:</strong></p>
                        <ol>
                            <li>Open the PDF from your email</li>
                            <li>Press <kbd>Ctrl+A</kbd> to select all</li>
                            <li>Press <kbd>Ctrl+C</kbd> to copy</li>
                            <li>Press <kbd>Ctrl+V</kbd> to paste below</li>
                        </ol>
                    </div>
                    <textarea id="rate-text" placeholder="Paste rate sheet here..."></textarea>
                    <button class="qb-btn-primary" onclick="QuoteBuilder.parseRates()">Extract Rates</button>
                </div>
                
                <div class="qb-actions">
                    <button class="qb-btn-secondary" onclick="QuoteBuilder.goToStep(2)">← Back</button>
                </div>
            </div>
        `;
    }

    // Step 4: Recommendation
    function renderStep4() {
        const rec = calculateRecommendation();
        state.recommendation = rec;
        
        return `
            <div class="qb-step">
                <h4>Step 4: Recommendation</h4>
                
                <div class="qb-recommendation-card">
                    <div class="qb-rec-badge">🏆 RECOMMENDED</div>
                    <h5>Tier ${rec.tier} - ${rec.term} Year Fixed @ ${rec.rate}%</h5>
                    
                    <div class="qb-rec-numbers">
                        <div class="qb-rec-number">
                            <span class="qb-rec-label">Monthly Payment</span>
                            <span class="qb-rec-value">$${rec.payment}/mo</span>
                        </div>
                        <div class="qb-rec-number">
                            <span class="qb-rec-label">Origination Fee</span>
                            <span class="qb-rec-value">${rec.orig}%</span>
                        </div>
                    </div>
                </div>
                
                <div class="qb-actions">
                    <button class="qb-btn-secondary" onclick="QuoteBuilder.goToStep(3)">← Back</button>
                    <button class="qb-btn-primary" onclick="QuoteBuilder.goToStep(5)">Continue →</button>
                </div>
            </div>
        `;
    }

    // Step 5: Generate
    function renderStep5() {
        const rec = state.recommendation || calculateRecommendation();
        
        return `
            <div class="qb-step">
                <h4>Step 5: Generate & Present</h4>
                
                <div class="qb-quote-summary">
                    <h5>${state.client.name || 'Client'}</h5>
                    <div class="qb-summary-row">
                        <span>Amount:</span><strong>$${state.client.amount.toLocaleString()}</strong>
                    </div>
                    <div class="qb-summary-row">
                        <span>Rate:</span><strong>${rec.rate}% Fixed</strong>
                    </div>
                    <div class="qb-summary-row">
                        <span>Payment:</span><strong>$${rec.payment}/mo</strong>
                    </div>
                </div>
                
                <div class="qb-final-actions">
                    <button class="qb-btn-action" onclick="QuoteBuilder.saveQuote()">
                        <span>✓</span> Save Quote
                    </button>
                </div>
                
                <div class="qb-actions">
                    <button class="qb-btn-secondary" onclick="QuoteBuilder.goToStep(4)">← Back</button>
                </div>
            </div>
        `;
    }

    // Navigation
    function goToStep(step) {
        // Save current step data before moving
        saveCurrentStepData();
        state.step = step;
        render();
    }

    // Save data from current step inputs
    function saveCurrentStepData() {
        if (state.step === 1) {
            state.client = {
                name: document.getElementById('client-name')?.value || '',
                phone: document.getElementById('client-phone')?.value || '',
                creditScore: parseInt(document.getElementById('client-credit')?.value) || '',
                amount: parseFloat(document.getElementById('client-amount')?.value) || '',
                purpose: document.querySelector('input[name="purpose"]:checked')?.value || ''
            };
        } else if (state.step === 2) {
            state.property = {
                address: document.getElementById('property-address')?.value || '',
                value: parseFloat(document.getElementById('property-value')?.value) || '',
                mortgage: parseFloat(document.getElementById('property-mortgage')?.value) || ''
            };
        }
    }

    // Load leads
    function loadLeads(source) {
        const listEl = document.getElementById('qb-leads-list');
        listEl.style.display = 'block';
        listEl.innerHTML = '<div class="qb-loading">Loading...</div>';
        
        // Use demo data
        setTimeout(() => {
            state.leads = DEMO_LEADS[source] || [];
            renderLeadsList(source);
        }, 300);
    }

    // Render leads list
    function renderLeadsList(source) {
        const listEl = document.getElementById('qb-leads-list');
        
        if (state.leads.length === 0) {
            listEl.innerHTML = '<div class="qb-no-leads">No leads found</div>';
            return;
        }
        
        listEl.innerHTML = `
            <div class="qb-leads-header">
                <span>Select a lead from ${source}:</span>
                <span class="qb-demo-badge">Demo Data</span>
            </div>
            <div class="qb-leads-grid">
                ${state.leads.map(lead => `
                    <div class="qb-lead-card ${lead.status.toLowerCase()}" onclick="QuoteBuilder.selectLead(${lead.id})">
                        <div class="qb-lead-header">
                            <span class="qb-lead-name">${lead.name}</span>
                            <span class="qb-lead-status ${lead.status.toLowerCase()}">${lead.status}</span>
                        </div>
                        <div class="qb-lead-details">
                            <div class="qb-lead-amount">$${(lead.amount / 1000).toFixed(0)}K needed</div>
                            <div class="qb-lead-meta">
                                <span>★ ${lead.creditScore} credit</span>
                                <span>• ${lead.purpose}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        listEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Select lead
    function selectLead(leadId) {
        const lead = state.leads.find(l => l.id === leadId);
        if (!lead) return;
        
        // Populate ALL data at once
        state.client = {
            name: lead.name,
            phone: lead.phone,
            email: lead.email || '',
            creditScore: lead.creditScore,
            amount: lead.amount,
            purpose: mapPurpose(lead.purpose)
        };
        
        state.property = {
            address: lead.address || '',
            value: lead.propertyValue || '',
            mortgage: lead.mortgageBalance || ''
        };
        
        // Re-render Step 1 with data
        render();
        
        // Show confirmation
        showToast(`Loaded ${lead.name}`);
    }

    // Map purpose string to value
    function mapPurpose(purpose) {
        const p = purpose?.toLowerCase() || '';
        if (p.includes('kitchen') || p.includes('home') || p.includes('remodel') || p.includes('addition') || p.includes('pool')) return 'home improvement';
        if (p.includes('debt')) return 'debt consolidation';
        if (p.includes('investment')) return 'investment';
        if (p.includes('emergency') || p.includes('medical')) return 'emergency';
        return '';
    }

    // Show broker paste
    function showBrokerPaste() {
        const el = document.getElementById('qb-broker-paste');
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }

    // Parse broker email
    function parseBrokerEmail() {
        const text = document.getElementById('broker-text')?.value || '';
        
        // Simple parsing
        const firstName = text.match(/First Name\s*=\s*(.+)/i)?.[1]?.trim();
        const lastName = text.match(/Last Name\s*=\s*(.+)/i)?.[1]?.trim();
        const phone = text.match(/Phone\s*=\s*(.+)/i)?.[1]?.trim();
        const email = text.match(/Email\s*=\s*(.+)/i)?.[1]?.trim();
        const amount = parseFloat(text.match(/Loan Amount\s*=\s*(\d+)/i)?.[1]);
        const value = parseFloat(text.match(/Property Value\s*=\s*(\d+)/i)?.[1]);
        const mortgage = parseFloat(text.match(/Current Balance\s*=\s*(\d+)/i)?.[1]);
        
        const address = text.match(/Address\s*=\s*(.+)/i)?.[1]?.trim();
        const city = text.match(/City\s*=\s*(.+)/i)?.[1]?.trim();
        const stateCode = text.match(/State\s*=\s*(.+)/i)?.[1]?.trim();
        const zip = text.match(/Zip\s*=\s*(.+)/i)?.[1]?.trim();
        
        // Update state
        if (firstName || lastName) {
            state.client.name = `${firstName || ''} ${lastName || ''}`.trim();
        }
        if (phone) state.client.phone = phone;
        if (email) state.client.email = email;
        if (amount) state.client.amount = amount;
        
        if (address && city && stateCode && zip) {
            state.property.address = `${address}, ${city}, ${stateCode} ${zip}`;
        }
        if (value) state.property.value = value;
        if (!isNaN(mortgage)) state.property.mortgage = mortgage;
        
        render();
        showToast('Lead data extracted!');
    }

    // Show rate paste
    function showRatePaste() {
        const el = document.getElementById('rate-paste-area');
        el.style.display = el.style.display === 'none' ? 'block' : 'none';
    }

    // Parse rates
    function parseRates() {
        // Simplified - just advance
        showToast('Rates extracted!');
        goToStep(4);
    }

    // Calculate equity
    function calculateEquity() {
        saveCurrentStepData();
        render();
    }

    // Calculate recommendation
    function calculateRecommendation() {
        const amount = state.client.amount || 75000;
        
        let tier = '2', rate = '6.375', orig = '1.5';
        
        if (amount > 100000) { tier = '1'; rate = '5.125'; orig = '2.0'; }
        else if (amount < 50000) { tier = '3'; rate = '7.125'; orig = '0.0'; }
        
        const payment = Math.round(amount * (parseFloat(rate) / 100) / 12);
        
        return { tier, term: 20, rate, orig, payment };
    }

    // Save quote
    function saveQuote() {
        // Save to localStorage
        const quotes = JSON.parse(localStorage.getItem('qb_quotes') || '[]');
        quotes.push({
            id: Date.now(),
            timestamp: Date.now(),
            client: state.client,
            property: state.property,
            recommendation: state.recommendation,
            status: 'generated'
        });
        localStorage.setItem('qb_quotes', JSON.stringify(quotes.slice(-50)));
        
        close();
        showToast('Quote saved! 🎉');
    }

    // Show toast
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'qb-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // Expose public API
    window.QuoteBuilder = {
        init,
        open,
        close,
        goToStep,
        loadLeads,
        selectLead,
        showBrokerPaste,
        parseBrokerEmail,
        showRatePaste,
        parseRates,
        calculateEquity,
        saveQuote
    };

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
