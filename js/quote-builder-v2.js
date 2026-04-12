/**
 * Ezra Interactive Quote Builder v2
 * Sales-focused design with lead loading from CRM tools
 */

(function() {
    'use strict';

    // Quote Builder State
    let qbState = {
        step: 0,
        clientData: null,
        rates: null,
        cashNeeded: 0,
        purpose: '',
        rateType: 'fixed',
        preset: 'simple',
        isOpen: false,
        selectedTier: 't2',
        selectedTerm: 20,
        leads: [],
        loadingLeads: false,
        quoteId: null
    };
    
    // Smart Defaults Storage Key
    const SMART_DEFAULTS_KEY = 'quote_builder_defaults';

    // Lead Sources Configuration
    const LEAD_SOURCES = {
        bonzo: { name: 'Bonzo', icon: '📋', color: '#3b82f6' },
        ghl: { name: 'GHL', icon: '🏢', color: '#10b981' },
        crm: { name: 'CRM', icon: '📊', color: '#8b5cf6' },
        manual: { name: 'Manual Entry', icon: '✏️', color: '#6b7280' }
    };

    // Quote Presets
    const QUOTE_PRESETS = {
        simple: {
            name: 'Simple',
            description: 'Clean quote with rates only',
            sections: ['rates', 'payments']
        },
        compare: {
            name: 'Compare',
            description: 'Side-by-side tier comparison',
            sections: ['comparison', 'rates', 'payments']
        },
        complete: {
            name: 'Complete',
            description: 'Full analysis with all sections',
            sections: ['summary', 'comparison', 'rates', 'payments', 'fees', 'savings']
        },
        'client-simple': {
            name: 'Client-Simple',
            description: 'Minimal client-facing version',
            sections: ['rates', 'payments', 'next-steps']
        }
    };

    // Initialize Quote Builder
    function initQuoteBuilder() {
        console.log('🏗️ Quote Builder v2 initialized');
        addFloatingButton();
        initSmartDefaults();
    }
    
    // Initialize smart defaults
    function initSmartDefaults() {
        const defaults = getSmartDefaults();
        if (defaults) {
            console.log('📋 Loaded smart defaults:', defaults);
        }
    }
    
    // Get smart defaults from storage
    function getSmartDefaults() {
        try {
            const stored = localStorage.getItem(SMART_DEFAULTS_KEY);
            return stored ? JSON.parse(stored) : null;
        } catch (e) {
            return null;
        }
    }
    
    // Save smart defaults
    function saveSmartDefaults(data) {
        const defaults = {
            lastRates: data.rates,
            lastTier: data.selectedTier,
            lastTerm: data.selectedTerm,
            lastPreset: data.preset,
            timestamp: Date.now()
        };
        localStorage.setItem(SMART_DEFAULTS_KEY, JSON.stringify(defaults));
    }
    
    // Check if we should show smart defaults banner
    function shouldShowSmartDefaults() {
        const defaults = getSmartDefaults();
        if (!defaults) return false;
        
        // Show if less than 24 hours old
        const hoursSince = (Date.now() - defaults.timestamp) / (1000 * 60 * 60);
        return hoursSince < 24;
    }

    // Add floating "+ New Quote" button
    function addFloatingButton() {
        // Check if button already exists
        if (document.getElementById('qb-floating-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'qb-floating-btn';
        btn.className = 'qb-floating-btn';
        btn.innerHTML = '<span>+</span> New Quote';
        btn.title = 'Build new quote (Ctrl+Q)';
        btn.onclick = startQuoteBuilder;
        
        document.body.appendChild(btn);

        // Add keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'q') {
                e.preventDefault();
                startQuoteBuilder();
            }
        });
    }

    // Start the quote builder wizard
    function startQuoteBuilder() {
        qbState = {
            step: 1,
            clientData: null,
            rates: getCurrentRates(),
            cashNeeded: 0,
            purpose: '',
            rateType: 'fixed',
            preset: 'simple',
            isOpen: true,
            selectedTier: 't2',
            selectedTerm: 20,
            leads: [],
            loadingLeads: false
        };
        
        renderQuoteBuilder();
    }

    // Get current rates from form
    function getCurrentRates() {
        const getRate = (id) => {
            const el = document.getElementById(id);
            return el ? parseFloat(el.value) || 0 : 0;
        };

        return {
            tier1: {
                fixed: { 30: getRate('t1-30-rate'), 20: getRate('t1-20-rate'), 15: getRate('t1-15-rate'), 10: getRate('t1-10-rate') },
                orig: getRate('t1-orig')
            },
            tier2: {
                fixed: { 30: getRate('t2-30-rate'), 20: getRate('t2-20-rate'), 15: getRate('t2-15-rate'), 10: getRate('t2-10-rate') },
                orig: getRate('t2-orig')
            },
            tier3: {
                fixed: { 30: getRate('t3-30-rate'), 20: getRate('t3-20-rate'), 15: getRate('t3-15-rate'), 10: getRate('t3-10-rate') },
                orig: getRate('t3-orig')
            }
        };
    }

    // Render the quote builder UI
    function renderQuoteBuilder() {
        const existing = document.getElementById('quote-builder-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'quote-builder-modal';
        modal.className = 'quote-builder-overlay';
        
        modal.innerHTML = `
            <div class="quote-builder-modal">
                <div class="qb-header">
                    <div class="qb-title">
                        <span class="qb-icon">🏗️</span>
                        <div>
                            <h3>Quote Builder</h3>
                            <span class="qb-subtitle">Build a professional HELOC quote in 2 minutes</span>
                        </div>
                    </div>
                    <button class="qb-close" onclick="window.QuoteBuilderV2.close()">×</button>
                </div>
                
                <div class="qb-progress">
                    <div class="qb-progress-bar">
                        <div class="qb-progress-fill" style="width: ${(qbState.step / 5) * 100}%"></div>
                    </div>
                    <div class="qb-step-indicator">Step ${qbState.step} of 5</div>
                </div>
                
                <div class="qb-body">
                    ${renderStep()}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    // Render current step content
    function renderStep() {
        switch (qbState.step) {
            case 1:
                return renderStep1_WhoAndWhat();
            case 2:
                return renderStep2_PropertyAndEquity();
            case 3:
                return renderStep3_ImportRates();
            case 4:
                return renderStep4_EzraRecommends();
            case 5:
                return renderStep5_GenerateAndPresent();
            default:
                return '';
        }
    }

    // Step 1: Who & What (with Load Lead from Tool)
    function renderStep1_WhoAndWhat() {
        return `
            <div class="qb-step">
                <h4>Step 1: Who are we building this for?</h4>
                <p class="qb-step-desc">Select an existing lead or add a new client.</p>
                
                <div class="qb-lead-sources">
                    <p class="qb-section-label">LOAD LEAD FROM TOOL:</p>
                    <div class="qb-source-grid">
                        ${Object.entries(LEAD_SOURCES).map(([key, source]) => `
                            <button class="qb-source-btn ${key}" onclick="window.QuoteBuilderV2.loadLeads('${key}')">
                                <span class="qb-source-icon">${source.icon}</span>
                                <span class="qb-source-name">${source.name}</span>
                                <span class="qb-source-count">Click to load</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
                
                <div class="qb-or-divider">
                    <span>OR</span>
                </div>
                
                <button class="qb-add-manual-btn" onclick="window.QuoteBuilderV2.showBrokerLaunchPaste()">
                    <span>📋</span> Paste Broker Launch Email
                </button>
                
                <button class="qb-add-manual-btn" onclick="window.QuoteBuilderV2.showManualEntry()">
                    <span>+</span> Add New Client Manually
                </button>
                
                <div id="qb-leads-list" class="qb-leads-list" style="display: none;">
                    <!-- Leads will be loaded here -->
                </div>
                
                <div id="qb-manual-form" class="qb-manual-form" style="display: ${qbState.clientData ? 'block' : 'none'};">
                    ${renderClientForm()}
                </div>
            </div>
        `;
    }

    // Load leads from a source
    async function loadLeads(source) {
        const leadsListEl = document.getElementById('qb-leads-list');
        if (!leadsListEl) return;
        
        leadsListEl.style.display = 'block';
        leadsListEl.innerHTML = '<div class="qb-loading">Loading leads from ' + LEAD_SOURCES[source].name + '...</div>';
        
        qbState.loadingLeads = true;
        
        try {
            // Try to fetch from actual API
            const leads = await fetchLeadsFromSource(source);
            
            // If no leads returned, use demo data
            if (!leads || leads.length === 0) {
                throw new Error('No leads from API');
            }
            
            qbState.leads = leads;
            renderLeadsList(leads, source);
        } catch (err) {
            console.log('Using demo leads for ' + source);
            // Show demo leads for testing
            const demoLeads = getDemoLeads(source);
            qbState.leads = demoLeads;
            renderLeadsList(demoLeads, source, true);
        }
        
        qbState.loadingLeads = false;
    }

    // Fetch leads from actual source
    async function fetchLeadsFromSource(source) {
        // This would integrate with actual APIs
        // For now, return empty to trigger demo mode
        return [];
    }

    // Get demo leads for testing
    function getDemoLeads(source) {
        const demos = {
            bonzo: [
                { id: 1, name: 'John Smith', phone: '(555) 123-4567', email: 'john.smith@email.com', creditScore: 760, amount: 75000, purpose: 'Kitchen remodel', status: 'Hot', timeAgo: '2 hours ago', notes: 'Pre-qualified, ready to move', address: '123 Main St, Los Angeles, CA 90210', propertyValue: 650000, mortgageBalance: 320000 },
                { id: 2, name: 'Sarah Johnson', phone: '(555) 234-5678', email: 'sarah.j@email.com', creditScore: 720, amount: 50000, purpose: 'Debt consolidation', status: 'Warm', timeAgo: '5 hours ago', notes: 'Comparing rates', address: '456 Oak Ave, San Diego, CA 92101', propertyValue: 550000, mortgageBalance: 280000 },
                { id: 3, name: 'Mike Davis', phone: '(555) 345-6789', email: 'mike.davis@email.com', creditScore: 680, amount: 120000, purpose: 'Investment property', status: 'New', timeAgo: '1 day ago', notes: 'First-time HELOC', address: '789 Pine Rd, Irvine, CA 92618', propertyValue: 800000, mortgageBalance: 400000 }
            ],
            ghl: [
                { id: 4, name: 'Emily Chen', phone: '(555) 456-7890', email: 'emily.chen@email.com', creditScore: 780, amount: 100000, purpose: 'Home addition', status: 'Hot', timeAgo: '3 hours ago', notes: 'Referred by agent', address: '321 Elm St, Pasadena, CA 91101', propertyValue: 750000, mortgageBalance: 350000 },
                { id: 5, name: 'Robert Wilson', phone: '(555) 567-8901', email: 'rob.wilson@email.com', creditScore: 740, amount: 60000, purpose: 'Emergency fund', status: 'Warm', timeAgo: '1 day ago', notes: 'Needs quick close', address: '654 Maple Dr, Torrance, CA 90505', propertyValue: 600000, mortgageBalance: 300000 }
            ],
            crm: [
                { id: 6, name: 'Lisa Anderson', phone: '(555) 678-9012', email: 'lisa.a@email.com', creditScore: 750, amount: 85000, purpose: 'Pool installation', status: 'Hot', timeAgo: '1 hour ago', notes: 'Ready to apply', address: '987 Cedar Ln, Santa Monica, CA 90401', propertyValue: 900000, mortgageBalance: 450000 },
                { id: 7, name: 'David Brown', phone: '(555) 789-0123', email: 'david.brown@email.com', creditScore: 700, amount: 45000, purpose: 'Medical expenses', status: 'New', timeAgo: '2 days ago', notes: 'Exploring options', address: '147 Birch St, Glendale, CA 91201', propertyValue: 500000, mortgageBalance: 250000 }
            ],
            manual: []
        };
        return demos[source] || [];
    }

    // Render leads list
    function renderLeadsList(leads, source, isDemo = false) {
        const leadsListEl = document.getElementById('qb-leads-list');
        const sourceInfo = LEAD_SOURCES[source];
        
        if (leads.length === 0) {
            leadsListEl.innerHTML = `
                <div class="qb-no-leads">
                    <p>No leads found in ${sourceInfo.name}.</p>
                    <button onclick="window.QuoteBuilderV2.showManualEntry()">Add Client Manually</button>
                </div>
            `;
            return;
        }
        
        leadsListEl.innerHTML = `
            <div class="qb-leads-header">
                <span>Select a lead from ${sourceInfo.name}:</span>
                ${isDemo ? '<span class="qb-demo-badge">Demo Data</span>' : ''}
            </div>
            <div class="qb-leads-grid">
                ${leads.map(lead => `
                    <div class="qb-lead-card ${lead.status.toLowerCase()}" onclick="window.QuoteBuilderV2.selectLead(${lead.id})">
                        <div class="qb-lead-header">
                            <span class="qb-lead-name">${lead.name}</span>
                            <span class="qb-lead-status ${lead.status.toLowerCase()}">${lead.status}</span>
                        </div>
                        <div class="qb-lead-details">
                            <div class="qb-lead-amount">$${(lead.amount / 1000).toFixed(0)}K needed</div>
                            <div class="qb-lead-meta">
                                <span>★ ${lead.creditScore} credit</span>
                                <span>• ${lead.timeAgo}</span>
                            </div>
                        </div>
                        <div class="qb-lead-purpose">${lead.purpose}</div>
                        ${lead.notes ? `<div class="qb-lead-notes">${lead.notes}</div>` : ''}
                    </div>
                `).join('')}
            </div>
            <div class="qb-leads-actions">
                <button class="qb-btn-secondary" onclick="document.getElementById('qb-leads-list').style.display='none'">
                    Cancel
                </button>
                <button class="qb-btn-link" onclick="window.open('https://app.getbonzo.com', '_blank')">
                    View All in ${sourceInfo.name} →
                </button>
            </div>
        `;
        
        // Scroll leads list into view
        setTimeout(() => {
            leadsListEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }

    // Select a lead
    function selectLead(leadId) {
        const lead = qbState.leads.find(l => l.id === leadId);
        if (!lead) return;
        
        qbState.clientData = {
            id: leadId,
            name: lead.name,
            phone: lead.phone,
            email: lead.email || '',
            creditScore: lead.creditScore,
            amount: lead.amount,
            purpose: lead.purpose,
            notes: lead.notes,
            source: lead.source || 'crm',
            // Pre-populate property data if available
            propertyAddress: lead.address || '',
            propertyValue: lead.propertyValue || '',
            mortgageBalance: lead.mortgageBalance || ''
        };
        
        qbState.cashNeeded = lead.amount;
        
        // Show confirmation and move to next step
        renderQuoteBuilder();
        
        // Auto-fill the form fields immediately
        setTimeout(() => {
            autoFillLeadData(lead);
        }, 100);
        
        // Auto-advance after short delay
        setTimeout(() => {
            if (confirm(`Loaded ${lead.name} - $${lead.amount.toLocaleString()} for ${lead.purpose}. Continue to property details?`)) {
                nextStep();
            }
        }, 300);
    }
    
    // Auto-fill lead data into form fields
    function autoFillLeadData(lead) {
        console.log('Auto-filling lead data:', lead);
        
        // Step 1 fields
        const nameField = document.getElementById('qb-client-name');
        if (nameField) {
            nameField.value = lead.name || '';
            nameField.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        const phoneField = document.getElementById('qb-client-phone');
        if (phoneField) {
            phoneField.value = lead.phone || '';
            phoneField.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        const creditField = document.getElementById('qb-client-credit');
        if (creditField && lead.creditScore) {
            // Map credit score to select option
            let creditValue = '<640';
            if (lead.creditScore >= 760) creditValue = '760+';
            else if (lead.creditScore >= 720) creditValue = '720-759';
            else if (lead.creditScore >= 680) creditValue = '680-719';
            else if (lead.creditScore >= 640) creditValue = '640-679';
            
            creditField.value = creditValue;
            creditField.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        const cashField = document.getElementById('qb-cash-needed');
        if (cashField) {
            cashField.value = lead.amount || '';
            cashField.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        // Set purpose radio
        if (lead.purpose) {
            const purposeMap = {
                'kitchen remodel': 'home improvement',
                'home improvement': 'home improvement',
                'debt consolidation': 'debt consolidation',
                'investment property': 'investment',
                'emergency fund': 'emergency',
                'pool installation': 'home improvement',
                'home addition': 'home improvement',
                'medical expenses': 'emergency'
            };
            const purposeValue = purposeMap[lead.purpose.toLowerCase()] || 'other';
            const radio = document.querySelector(`input[name="purpose"][value="${purposeValue}"]`);
            if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
        
        // Store for Step 2
        qbState.preFilledProperty = {
            address: lead.address,
            value: lead.propertyValue,
            mortgage: lead.mortgageBalance
        };
        
        // Also try to fill Step 2 fields immediately (if visible)
        fillStep2Fields(lead);
        
        console.log('Step 2 pre-filled data:', qbState.preFilledProperty);
    }
    
    // Fill Step 2 fields
    function fillStep2Fields(lead) {
        const addressField = document.getElementById('qb-property-address');
        if (addressField && lead.address) {
            addressField.value = lead.address;
            addressField.dispatchEvent(new Event('input', { bubbles: true }));
            console.log('Filled address:', lead.address);
        }
        
        const valueField = document.getElementById('qb-property-value');
        if (valueField && lead.propertyValue) {
            valueField.value = lead.propertyValue;
            valueField.dispatchEvent(new Event('input', { bubbles: true }));
            valueField.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('Filled property value:', lead.propertyValue);
        }
        
        const mortgageField = document.getElementById('qb-mortgage-balance');
        if (mortgageField && lead.mortgageBalance !== undefined) {
            mortgageField.value = lead.mortgageBalance;
            mortgageField.dispatchEvent(new Event('input', { bubbles: true }));
            mortgageField.dispatchEvent(new Event('change', { bubbles: true }));
            console.log('Filled mortgage:', lead.mortgageBalance);
        }
        
        // Trigger equity calculation if we have values
        if (lead.propertyValue && lead.mortgageBalance !== undefined) {
            calculateEquity();
        }
    }

    // Show broker launch paste area
    function showBrokerLaunchPaste() {
        const leadsListEl = document.getElementById('qb-leads-list');
        const manualForm = document.getElementById('qb-manual-form');
        
        if (leadsListEl) leadsListEl.style.display = 'none';
        if (manualForm) manualForm.style.display = 'none';
        
        // Create or show broker launch paste area
        let pasteArea = document.getElementById('qb-broker-launch-area');
        if (!pasteArea) {
            pasteArea = document.createElement('div');
            pasteArea.id = 'qb-broker-launch-area';
            pasteArea.className = 'qb-broker-launch-area';
            
            const stepContainer = document.querySelector('.qb-step');
            if (stepContainer) {
                stepContainer.appendChild(pasteArea);
            }
        }
        
        pasteArea.style.display = 'block';
        pasteArea.innerHTML = `
            <div class="qb-broker-paste-container">
                <h5>📋 Paste Broker Launch Email</h5>
                <p>Copy and paste the entire broker launch email below:</p>
                <textarea id="qb-broker-launch-text" class="qb-broker-textarea" placeholder="Broker Launch Notification...

Campaign = ...
First Name = ...
Last Name = ...
Phone = ...
Email = ...
Address = ...
..."></textarea>
                <div class="qb-broker-actions">
                    <button class="qb-btn-secondary" onclick="document.getElementById('qb-broker-launch-area').style.display='none'">Cancel</button>
                    <button class="qb-btn-primary" onclick="window.QuoteBuilderV2.parseBrokerLaunchEmail()">Extract Lead Data</button>
                </div>
            </div>
        `;
        
        // Scroll to paste area
        setTimeout(() => {
            pasteArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
    }
    
    // Parse broker launch email
    function parseBrokerLaunchEmail() {
        const text = document.getElementById('qb-broker-launch-text')?.value;
        if (!text?.trim()) {
            alert('Please paste the broker launch email first');
            return;
        }
        
        const parsed = parseBrokerLaunchText(text);
        
        if (!parsed.firstName && !parsed.lastName) {
            alert('Could not parse lead data. Please check the email format.');
            return;
        }
        
        // Populate client data
        qbState.clientData = {
            name: `${parsed.firstName || ''} ${parsed.lastName || ''}`.trim(),
            phone: parsed.phone || '',
            email: parsed.email || '',
            creditScore: parsed.creditScore || '',
            amount: parsed.loanAmount || parsed.cashOut || '',
            purpose: parsed.loanPurpose || '',
            propertyAddress: parsed.fullAddress || '',
            propertyValue: parsed.propertyValue || '',
            mortgageBalance: parsed.currentBalance || ''
        };
        
        qbState.cashNeeded = parsed.loanAmount || parsed.cashOut || 0;
        qbState.preFilledProperty = {
            address: parsed.fullAddress,
            value: parsed.propertyValue,
            mortgage: parsed.currentBalance
        };
        
        // Hide paste area and show manual form with data
        const pasteArea = document.getElementById('qb-broker-launch-area');
        if (pasteArea) pasteArea.style.display = 'none';
        
        document.getElementById('qb-manual-form').style.display = 'block';
        renderQuoteBuilder();
        
        // Auto-fill the form
        setTimeout(() => {
            autoFillLeadData(qbState.clientData);
            showToast(`Lead imported: ${qbState.clientData.name}`);
        }, 100);
    }
    
    // Parse broker launch text
    function parseBrokerLaunchText(text) {
        const result = {};
        
        // Helper to extract value after =
        const extract = (pattern) => {
            const match = text.match(pattern);
            return match ? match[1].trim() : null;
        };
        
        // Extract fields
        result.firstName = extract(/First Name\s*=\s*(.+)/i);
        result.lastName = extract(/Last Name\s*=\s*(.+)/i);
        result.phone = extract(/Phone\s*=\s*(.+)/i);
        result.email = extract(/Email\s*=\s*(.+)/i);
        result.loanPurpose = extract(/Loan Purpose\s*=\s*(.+)/i);
        result.propertyValue = parseInt(extract(/Property Value\s*=\s*(\d+)/i)) || 0;
        result.currentBalance = parseInt(extract(/Current Balance\s*=\s*(\d+)/i)) || 0;
        result.loanAmount = parseInt(extract(/Loan Amount\s*=\s*(\d+)/i)) || 0;
        result.cashOut = parseInt(extract(/Cash out\s*=\s*(\d+)/i)) || 0;
        
        // Credit rating mapping
        const creditRating = extract(/Credit Rating\s*=\s*(.+)/i);
        if (creditRating) {
            const creditMap = {
                'EXCELLENT': 760,
                'VERY GOOD': 740,
                'GOOD': 700,
                'FAIR': 660,
                'POOR': 620
            };
            result.creditScore = creditMap[creditRating.toUpperCase()] || 700;
        }
        
        // Address construction
        const address = extract(/Address\s*=\s*(.+)/i);
        const city = extract(/City\s*=\s*(.+)/i);
        const state = extract(/State\s*=\s*(.+)/i);
        const zip = extract(/Zip\s*=\s*(.+)/i);
        
        if (address && city && state && zip) {
            result.fullAddress = `${address}, ${city}, ${state} ${zip}`;
        }
        
        return result;
    }

    // Show manual entry form
    function showManualEntry() {
        // Hide other areas
        const leadsList = document.getElementById('qb-leads-list');
        const brokerArea = document.getElementById('qb-broker-launch-area');
        
        if (leadsList) leadsList.style.display = 'none';
        if (brokerArea) brokerArea.style.display = 'none';
        
        document.getElementById('qb-manual-form').style.display = 'block';
        qbState.clientData = { name: '', phone: '', creditScore: '', amount: '', purpose: '', notes: '' };
        renderQuoteBuilder();
    }

    // Render client form
    function renderClientForm() {
        const client = qbState.clientData || {};
        return `
            <div class="qb-form-section">
                <h5>Client Information</h5>
                <div class="qb-form-row">
                    <div class="qb-form-group">
                        <label>Client Name</label>
                        <input type="text" id="qb-client-name" value="${client.name || ''}" placeholder="John Smith">
                    </div>
                    <div class="qb-form-group">
                        <label>Phone (optional)</label>
                        <input type="tel" id="qb-client-phone" value="${client.phone || ''}" placeholder="(555) 123-4567">
                    </div>
                </div>
                <div class="qb-form-row">
                    <div class="qb-form-group">
                        <label>Credit Score</label>
                        <select id="qb-client-credit">
                            <option value="">Select...</option>
                            <option value="760+" ${client.creditScore >= 760 ? 'selected' : ''}>760+ (Excellent)</option>
                            <option value="720-759" ${client.creditScore >= 720 && client.creditScore < 760 ? 'selected' : ''}>720-759 (Very Good)</option>
                            <option value="680-719" ${client.creditScore >= 680 && client.creditScore < 720 ? 'selected' : ''}>680-719 (Good)</option>
                            <option value="640-679" ${client.creditScore >= 640 && client.creditScore < 680 ? 'selected' : ''}>640-679 (Fair)</option>
                            <option value="<640" ${client.creditScore < 640 ? 'selected' : ''}>Below 640</option>
                        </select>
                    </div>
                    <div class="qb-form-group">
                        <label>Cash Needed</label>
                        <input type="number" id="qb-cash-needed" value="${client.amount || ''}" placeholder="75000">
                    </div>
                </div>
                <div class="qb-form-group">
                    <label>Purpose</label>
                    <div class="qb-purpose-options">
                        <label class="qb-radio">
                            <input type="radio" name="purpose" value="home improvement" ${client.purpose?.includes('home') || client.purpose?.includes('kitchen') || client.purpose?.includes('remodel') ? 'checked' : ''}>
                            <span>🏠 Home Improvement</span>
                        </label>
                        <label class="qb-radio">
                            <input type="radio" name="purpose" value="debt consolidation" ${client.purpose?.includes('debt') ? 'checked' : ''}>
                            <span>💳 Debt Consolidation</span>
                        </label>
                        <label class="qb-radio">
                            <input type="radio" name="purpose" value="investment" ${client.purpose?.includes('investment') ? 'checked' : ''}>
                            <span>📈 Investment</span>
                        </label>
                        <label class="qb-radio">
                            <input type="radio" name="purpose" value="emergency" ${client.purpose?.includes('emergency') ? 'checked' : ''}>
                            <span>🚨 Emergency Fund</span>
                        </label>
                        <label class="qb-radio">
                            <input type="radio" name="purpose" value="other" ${client.purpose && !['home improvement', 'debt consolidation', 'investment', 'emergency'].some(p => client.purpose.includes(p)) ? 'checked' : ''}>
                            <span>📝 Other</span>
                        </label>
                    </div>
                </div>
                <div class="qb-form-actions">
                    <button class="qb-btn-primary" onclick="window.QuoteBuilderV2.saveClientAndNext()">
                        Continue →
                    </button>
                </div>
            </div>
        `;
    }

    // Save client and continue
    function saveClientAndNext() {
        const name = document.getElementById('qb-client-name')?.value;
        const phone = document.getElementById('qb-client-phone')?.value;
        const credit = document.getElementById('qb-client-credit')?.value;
        const amount = parseFloat(document.getElementById('qb-cash-needed')?.value) || 0;
        const purposeEl = document.querySelector('input[name="purpose"]:checked');
        const purpose = purposeEl ? purposeEl.value : '';
        
        if (!name || !amount) {
            alert('Please enter client name and cash needed');
            return;
        }
        
        qbState.clientData = {
            ...qbState.clientData,
            name,
            phone,
            creditScore: credit,
            amount,
            purpose
        };
        qbState.cashNeeded = amount;
        
        nextStep();
    }

    // Step 2: Property & Equity
    function renderStep2_PropertyAndEquity() {
        const client = qbState.clientData || {};
        const preFilled = qbState.preFilledProperty || {};
        
        // Use pre-filled data from lead if available
        const address = client.propertyAddress || preFilled.address || '';
        const propValue = client.propertyValue || preFilled.value || '';
        const mortgage = client.mortgageBalance || preFilled.mortgage || '';
        
        return `
            <div class="qb-step">
                <h4>Step 2: Property & Equity</h4>
                <p class="qb-step-desc">Let's see what ${client.name?.split(' ')[0] || 'they'} have to work with.</p>
                
                <div class="qb-form-section">
                    <div class="qb-form-group">
                        <label>Property Address</label>
                        <div class="qb-address-input">
                            <input type="text" id="qb-property-address" value="${address}" placeholder="123 Main St, City, ST 12345" onblur="window.QuoteBuilderV2.lookupProperty()">
                            <button class="qb-lookup-btn" onclick="window.QuoteBuilderV2.lookupProperty()">📍 Lookup</button>
                        </div>
                    </div>
                    
                    <div class="qb-form-row">
                        <div class="qb-form-group">
                            <label>Property Value</label>
                            <input type="number" id="qb-property-value" value="${propValue}" placeholder="650000" onchange="window.QuoteBuilderV2.calculateEquity()">
                        </div>
                        <div class="qb-form-group">
                            <label>Current Mortgage</label>
                            <input type="number" id="qb-mortgage-balance" value="${mortgage}" placeholder="320000" onchange="window.QuoteBuilderV2.calculateEquity()">
                        </div>
                    </div>
                    
                    <div id="qb-equity-preview" class="qb-equity-preview" style="display: none;">
                        <!-- Equity calculation will appear here -->
                    </div>
                </div>
                
                <div class="qb-actions">
                    <button class="qb-btn-secondary" onclick="window.QuoteBuilderV2.prevStep()">← Back</button>
                    <button class="qb-btn-primary" onclick="window.QuoteBuilderV2.savePropertyAndNext()">Continue →</button>
                </div>
            </div>
        `;
    }

    // Calculate equity
    function calculateEquity() {
        const value = parseFloat(document.getElementById('qb-property-value')?.value) || 0;
        const mortgage = parseFloat(document.getElementById('qb-mortgage-balance')?.value) || 0;
        const needed = qbState.cashNeeded || 0;
        
        if (value > 0) {
            const equity = value - mortgage;
            const maxLoan = value * 0.85 - mortgage;
            const cltv = ((mortgage + needed) / value) * 100;
            const isWithinLimit = needed <= maxLoan;
            
            const previewEl = document.getElementById('qb-equity-preview');
            previewEl.style.display = 'block';
            previewEl.innerHTML = `
                <div class="qb-equity-card">
                    <h5>Equity Analysis</h5>
                    <div class="qb-equity-row">
                        <span>Property Value:</span>
                        <strong>$${value.toLocaleString()}</strong>
                    </div>
                    <div class="qb-equity-row">
                        <span>Current Mortgage:</span>
                        <strong>$${mortgage.toLocaleString()}</strong>
                    </div>
                    <div class="qb-equity-row">
                        <span>Available Equity:</span>
                        <strong>$${equity.toLocaleString()}</strong>
                    </div>
                    <div class="qb-equity-row highlight">
                        <span>Max at 85% CLTV:</span>
                        <strong>$${maxLoan.toLocaleString()}</strong>
                    </div>
                    <div class="qb-equity-row ${isWithinLimit ? 'success' : 'warning'}">
                        <span>They want:</span>
                        <strong>$${needed.toLocaleString()} ${isWithinLimit ? '✓' : '⚠️ Exceeds limit'}</strong>
                    </div>
                    ${!isWithinLimit ? `<div class="qb-equity-alert">Maximum loan amount is $${maxLoan.toLocaleString()}</div>` : ''}
                </div>
            `;
        }
    }

    // Lookup property (placeholder for API integration)
    function lookupProperty() {
        // This would integrate with Zillow, CoreLogic, etc.
        console.log('Property lookup would happen here');
    }

    // Save property and continue
    function savePropertyAndNext() {
        const value = parseFloat(document.getElementById('qb-property-value')?.value) || 0;
        const mortgage = parseFloat(document.getElementById('qb-mortgage-balance')?.value) || 0;
        const address = document.getElementById('qb-property-address')?.value;
        
        qbState.clientData = {
            ...qbState.clientData,
            propertyValue: value,
            mortgageBalance: mortgage,
            propertyAddress: address
        };
        
        nextStep();
    }

    // Step 3: Import Rates
    function renderStep3_ImportRates() {
        const defaults = getSmartDefaults();
        const showDefaults = shouldShowSmartDefaults();
        
        return `
            <div class="qb-step">
                <h4>Step 3: Import Today's Rates</h4>
                <p class="qb-step-desc">Pull in current rates or use your saved rates.</p>
                
                ${showDefaults ? `
                    <div class="qb-smart-defaults-banner">
                        <span class="qb-icon">⚡</span>
                        <span>Use your rates from ${new Date(defaults.timestamp).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})}? (Tier ${defaults.lastTier?.replace('t', '') || '2'}, ${defaults.lastTerm}-year)</span>
                        <button onclick="window.QuoteBuilderV2.useSmartDefaults()">Use These</button>
                        <button class="qb-btn-secondary" onclick="this.parentElement.remove()">No Thanks</button>
                    </div>
                ` : ''}
                
                <div class="qb-rate-options">
                    <button class="qb-rate-option" onclick="window.QuoteBuilderV2.showRatePaste()">
                        <span class="qb-rate-icon">📋</span>
                        <h5>Paste Rate Sheet</h5>
                        <p>From Figure or Nifty Door</p>
                    </button>
                    
                    <button class="qb-rate-option" onclick="window.QuoteBuilderV2.useLastRates()">
                        <span class="qb-rate-icon">✓</span>
                        <h5>Use Last Rates</h5>
                        <p>From your previous quote</p>
                    </button>
                    
                    <button class="qb-rate-option" onclick="window.QuoteBuilderV2.skipRates()">
                        <span class="qb-rate-icon">⌚</span>
                        <h5>Skip for Now</h5>
                        <p>Use current form rates</p>
                    </button>
                </div>
                
                <div id="qb-rate-paste-area" class="qb-rate-paste-area" style="display: none;">
                    <div class="qb-rate-instructions">
                        <p><strong>📋 How to copy from Figure:</strong></p>
                        <ol>
                            <li>Open the PDF from your email</li>
                            <li>Press <kbd>Ctrl+A</kbd> to select all</li>
                            <li>Press <kbd>Ctrl+C</kbd> to copy</li>
                            <li>Press <kbd>Ctrl+V</kbd> to paste below</li>
                        </ol>
                    </div>
                    <textarea id="qb-rate-text" class="qb-rate-textarea" placeholder="Paste rate sheet here...

Example:
1st Lien HELOC - Pricing Sheet
Base Rates - 1st Lien; 30yr Term; 4.99% Lender Origination Fee
FICO/CLTV  640-659  660-679  680-699...
0-50%      7.70     7.65     7.45...
..."></textarea>
                    <button class="qb-btn-primary" onclick="window.QuoteBuilderV2.parseRates()">📊 Extract Rates</button>
                </div>
                
                <div class="qb-actions">
                    <button class="qb-btn-secondary" onclick="window.QuoteBuilderV2.prevStep()">← Back</button>
                </div>
            </div>
        `;
    }

    // Show rate paste area
    function showRatePaste() {
        document.getElementById('qb-rate-paste-area').style.display = 'block';
    }

    // Use smart defaults
    function useSmartDefaults() {
        const defaults = getSmartDefaults();
        if (defaults) {
            qbState.selectedTier = defaults.lastTier || 't2';
            qbState.selectedTerm = defaults.lastTerm || 20;
            qbState.preset = defaults.lastPreset || 'simple';
            if (defaults.lastRates) {
                qbState.rates = defaults.lastRates;
            }
            showToast('Smart defaults applied! ⚡');
        }
        nextStep();
    }
    
    // Use last rates
    function useLastRates() {
        const defaults = getSmartDefaults();
        if (defaults?.lastRates) {
            qbState.rates = defaults.lastRates;
            qbState.selectedTier = defaults.lastTier || 't2';
            qbState.selectedTerm = defaults.lastTerm || 20;
            showToast('Last rates loaded! ✓');
        }
        nextStep();
    }

    // Skip rates
    function skipRates() {
        nextStep();
    }

    // Parse rates from Figure/Nifty Door
    function parseRates() {
        const rateText = document.getElementById('qb-rate-text')?.value;
        if (!rateText?.trim()) {
            alert('Please paste rate data first');
            return;
        }
        
        const parsedRates = parseFigureRateSheet(rateText);
        
        if (parsedRates) {
            qbState.rates = parsedRates;
            showToast(`Rates extracted! 1st Lien rates loaded.`);
            nextStep();
        } else {
            // If parsing fails, still allow manual continue
            if (confirm('Could not auto-parse rates. Continue with current rates?')) {
                nextStep();
            }
        }
    }
    
    // Parse Figure rate sheet
    function parseFigureRateSheet(text) {
        const rates = {
            lienType: '1st', // or '2nd'
            baseRates: {},
            termAdjustments: {},
            occupancyAdjustments: {},
            ofeeOptions: [],
            stateAdjustments: {}
        };
        
        try {
            // Determine if 1st or 2nd lien
            if (text.includes('1st Lien') || text.includes('1stLien')) {
                rates.lienType = '1st';
            } else if (text.includes('2nd Lien') || text.includes('2ndLien') || text.includes('Junior Lien')) {
                rates.lienType = '2nd';
            }
            
            // Extract base rates table
            // Look for FICO/CLTV table pattern
            const ficoRanges = ['640-659', '660-679', '680-699', '700-719', '720-739', '740-759', '760-799', '800-850'];
            const cltvRanges = ['0-50%', '50-60%', '60-65%', '65-70%', '70-75%', '75-80%', '80-85%'];
            
            // Parse base rates
            ficoRanges.forEach((fico, ficoIndex) => {
                rates.baseRates[fico] = {};
                
                // Try to find this FICO column in the text
                const lines = text.split('\n');
                
                cltvRanges.forEach((cltv, cltvIndex) => {
                    // Look for pattern like "0-50% 7.70 7.65 7.45..."
                    const cltvLine = lines.find(line => line.trim().startsWith(cltv));
                    
                    if (cltvLine) {
                        // Split by whitespace and get the rate at the FICO index
                        const parts = cltvLine.trim().split(/\s+/);
                        // First part is CLTV, rest are rates for each FICO
                        if (parts.length > ficoIndex + 1) {
                            const rate = parseFloat(parts[ficoIndex + 1]);
                            if (!isNaN(rate)) {
                                rates.baseRates[fico][cltv] = rate;
                            }
                        }
                    }
                });
            });
            
            // Extract term adjustments
            const termMatch = text.match(/20 Year\s+([-\d.]+)/);
            if (termMatch) rates.termAdjustments['20'] = parseFloat(termMatch[1]);
            
            const term15Match = text.match(/15 Year\s+([-\d.]+)/);
            if (term15Match) rates.termAdjustments['15'] = parseFloat(term15Match[1]);
            
            const term10Match = text.match(/10 Year\s+([-\d.]+)/);
            if (term10Match) rates.termAdjustments['10'] = parseFloat(term10Match[1]);
            
            // Extract occupancy adjustment
            const invMatch = text.match(/Investment\/2nd Home\s+([\d.]+)/);
            if (invMatch) rates.occupancyAdjustments['investment'] = parseFloat(invMatch[1]);
            
            // Extract O-fee options
            const ofeeMatches = text.matchAll(/(\d\.?\d*)%\*\*/g);
            rates.ofeeOptions = Array.from(ofeeMatches).map(m => parseFloat(m[1])).filter(n => !isNaN(n));
            
            // Extract state adjustments
            const txMatch = text.match(/TX.*?([\d.]+)/);
            if (txMatch) rates.stateAdjustments['TX'] = parseFloat(txMatch[1]);
            
            const nyMatch = text.match(/NY.*?([\d.]+)/);
            if (nyMatch) rates.stateAdjustments['NY'] = parseFloat(nyMatch[1]);
            
            console.log('Parsed rates:', rates);
            
            // Return parsed rates if we got at least some data
            return Object.keys(rates.baseRates).length > 0 ? rates : null;
            
        } catch (e) {
            console.error('Error parsing rate sheet:', e);
            return null;
        }
    }

    // Step 4: Ezra Recommends
    function renderStep4_EzraRecommends() {
        const client = qbState.clientData || {};
        const firstName = client.name?.split(' ')[0] || 'they';
        const rates = qbState.rates || {};
        
        // Calculate recommendation
        const recommendation = calculateRecommendation();
        
        return `
            <div class="qb-step">
                <h4>Step 4: Ezra's Recommendation</h4>
                <p class="qb-step-desc">Based on ${firstName}'s $${(qbState.cashNeeded / 1000).toFixed(0)}K need for ${client.purpose || 'this loan'}.</p>
                
                <div class="qb-recommendation-card">
                    <div class="qb-rec-badge">🏆 RECOMMENDED</div>
                    <h5>Tier ${recommendation.tier} - ${recommendation.term} Year Fixed @ ${recommendation.rate}%</h5>
                    
                    <div class="qb-rec-why">
                        <p><strong>Why this fits ${firstName}:</strong></p>
                        <ul>
                            <li>${recommendation.why1}</li>
                            <li>${recommendation.why2}</li>
                            <li>${recommendation.why3}</li>
                        </ul>
                    </div>
                    
                    <div class="qb-rec-numbers">
                        <div class="qb-rec-number">
                            <span class="qb-rec-label">Monthly Payment</span>
                            <span class="qb-rec-value">$${recommendation.payment}/mo</span>
                        </div>
                        <div class="qb-rec-number">
                            <span class="qb-rec-label">Origination Fee</span>
                            <span class="qb-rec-value">${recommendation.orig}%</span>
                        </div>
                        <div class="qb-rec-number">
                            <span class="qb-rec-label">Total Cost</span>
                            <span class="qb-rec-value">$${recommendation.totalCost.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                
                <div class="qb-rec-actions">
                    <button class="qb-btn-secondary" onclick="window.QuoteBuilderV2.showAllOptions()">See All Options</button>
                    <button class="qb-btn-primary" onclick="window.QuoteBuilderV2.selectRecommendation()">✓ Use This Recommendation →</button>
                </div>
            </div>
        `;
    }

    // Calculate recommendation
    function calculateRecommendation() {
        // Simple logic - would be more sophisticated in production
        const amount = qbState.cashNeeded || 75000;
        const purpose = qbState.clientData?.purpose || '';
        
        // Default to Tier 2, 20-year
        let tier = '2';
        let term = 20;
        let rate = '6.375';
        let orig = '1.5';
        
        // Adjust based on amount and purpose
        if (amount > 100000) {
            tier = '1';
            rate = '5.125';
            orig = '2.0';
        } else if (amount < 50000) {
            tier = '3';
            rate = '7.125';
            orig = '0.0';
        }
        
        const payment = Math.round(amount * (parseFloat(rate) / 100) / 12);
        const totalCost = Math.round(amount * (parseFloat(orig) / 100));
        
        return {
            tier,
            term,
            rate,
            orig,
            payment,
            totalCost,
            why1: purpose.includes('home') ? `${purpose} = long-term improvement, fixed rate protects them` : 'Fixed rate = payment never changes',
            why2: `${term}-year builds equity faster than 30-year`,
            why3: `Payment ($${payment}/mo) fits most budgets`
        };
    }

    // Show all tier options
    function showAllOptions() {
        const amount = qbState.cashNeeded || 75000;
        const client = qbState.clientData || {};
        const firstName = client.name?.split(' ')[0] || 'Client';
        
        // Calculate all 3 tiers
        const tiers = [
            { tier: '1', rate: '5.125', orig: '2.0', color: '#10b981' },
            { tier: '2', rate: '6.375', orig: '1.5', color: '#3b82f6', recommended: true },
            { tier: '3', rate: '7.125', orig: '0.0', color: '#f59e0b' }
        ].map(t => {
            const payment = Math.round(amount * (parseFloat(t.rate) / 100) / 12);
            const totalCost = Math.round(amount * (parseFloat(t.orig) / 100));
            return { ...t, payment, totalCost };
        });
        
        const modal = document.createElement('div');
        modal.className = 'quote-builder-overlay';
        modal.id = 'qb-tier-comparison';
        modal.innerHTML = `
            <div class="quote-builder-modal qb-tier-modal">
                <div class="qb-header">
                    <div class="qb-title">
                        <span class="qb-icon">⚖️</span>
                        <h3>Compare All Tiers</h3>
                    </div>
                    <button class="qb-close" onclick="this.closest('.quote-builder-overlay').remove()">×</button>
                </div>
                
                <div class="qb-tier-comparison-content">
                    <p class="qb-tier-subtitle">$${amount.toLocaleString()} HELOC for ${firstName}</p>
                    
                    <div class="qb-tier-cards">
                        ${tiers.map(t => `
                            <div class="qb-tier-card ${t.recommended ? 'recommended' : ''}" onclick="window.QuoteBuilderV2.selectTier('${t.tier}')">
                                <div class="qb-tier-header" style="background: ${t.color}">
                                    <span class="qb-tier-name">Tier ${t.tier}</span>
                                    ${t.recommended ? '<span class="qb-tier-badge">✓ Recommended</span>' : ''}
                                </div>
                                <div class="qb-tier-body">
                                    <div class="qb-tier-rate">
                                        <span class="qb-tier-rate-num">${t.rate}%</span>
                                        <span class="qb-tier-rate-label">Fixed Rate</span>
                                    </div>
                                    <div class="qb-tier-details">
                                        <div class="qb-tier-row">
                                            <span>Monthly Payment</span>
                                            <strong>$${t.payment}/mo</strong>
                                        </div>
                                        <div class="qb-tier-row">
                                            <span>Origination Fee</span>
                                            <strong>${t.orig}% ($${t.totalCost.toLocaleString()})</strong>
                                        </div>
                                        <div class="qb-tier-row">
                                            <span>Term</span>
                                            <strong>20 Years</strong>
                                        </div>
                                    </div>
                                    <button class="qb-tier-select-btn ${t.recommended ? 'recommended' : ''}">
                                        ${t.recommended ? '✓ Use This Tier' : 'Select Tier ' + t.tier}
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div class="qb-tier-help">
                        <p><strong>How to choose:</strong></p>
                        <ul>
                            <li><strong>Tier 1:</strong> Best rates, highest fees. Good for large loans ($100K+) held long-term.</li>
                            <li><strong>Tier 2:</strong> Balanced option. Lower fees, competitive rates. Best for most borrowers.</li>
                            <li><strong>Tier 3:</strong> No origination fee. Higher rate but no upfront cost. Good for smaller loans or short-term use.</li>
                        </ul>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }
    
    // Select a specific tier
    function selectTier(tier) {
        qbState.selectedTier = 't' + tier;
        
        // Close the comparison modal
        const modal = document.getElementById('qb-tier-comparison');
        if (modal) modal.remove();
        
        // Update the recommendation display if on step 4
        if (qbState.step === 4) {
            renderQuoteBuilder();
        }
        
        showToast(`Tier ${tier} selected!`);
    }

    // Select recommendation
    function selectRecommendation() {
        const rec = calculateRecommendation();
        qbState.selectedTier = 't' + rec.tier;
        qbState.selectedTerm = rec.term;
        nextStep();
    }

    // Step 5: Generate & Present
    function renderStep5_GenerateAndPresent() {
        const client = qbState.clientData || {};
        const rec = calculateRecommendation();
        const firstName = client.name?.split(' ')[0] || 'Client';
        
        return `
            <div class="qb-step">
                <h4>Step 5: Generate & Present</h4>
                <p class="qb-step-desc">Here's what I built for ${firstName}:</p>
                
                <div class="qb-quote-preview">
                    <div class="qb-preview-header">
                        <h5>${client.name || 'Client Name'}</h5>
                        <span class="qb-preview-amount">$${qbState.cashNeeded.toLocaleString()} HELOC</span>
                    </div>
                    <div class="qb-preview-details">
                        <div class="qb-preview-row">
                            <span>Tier ${rec.tier} - ${rec.term} Year Fixed</span>
                            <strong>${rec.rate}%</strong>
                        </div>
                        <div class="qb-preview-row">
                            <span>Monthly Payment</span>
                            <strong>$${rec.payment}/mo</strong>
                        </div>
                        <div class="qb-preview-row">
                            <span>Origination Fee</span>
                            <strong>${rec.orig}% ($${rec.totalCost.toLocaleString()})</strong>
                        </div>
                    </div>
                </div>
                
                <div class="qb-talking-points">
                    <h5>Your Talking Points for ${firstName}:</h5>
                    <ul>
                        <li>"Your payment is only $${rec.payment}/month - less than most car payments"</li>
                        <li>"The ${rec.orig}% fee saves you money compared to other options"</li>
                        <li>"${rec.term}-year term means you'll own your home free and clear sooner"</li>
                        <li>"Fixed rate = no surprises, your payment never changes"</li>
                    </ul>
                </div>
                
                <div class="qb-call-script">
                    <h5>What to Say When You Call:</h5>
                    <div class="qb-script-box">
                        "Hi ${firstName}, I've got your HELOC quote ready. Great news - I can get you $${qbState.cashNeeded.toLocaleString()} for the ${client.purpose || 'project'} at ${rec.rate}% fixed, $${rec.payment} a month. When's a good time to walk you through it?"
                    </div>
                    <button class="qb-btn-copy" onclick="window.QuoteBuilderV2.copyScript()">📋 Copy</button>
                </div>
                
                <div class="qb-final-actions">
                    <button class="qb-btn-action" onclick="window.QuoteBuilderV2.generatePDF()">
                        <span>📄</span> Generate PDF
                    </button>
                    <button class="qb-btn-action" onclick="window.QuoteBuilderV2.emailClient()">
                        <span>📧</span> Email to ${firstName}
                    </button>
                    <button class="qb-btn-action" onclick="window.QuoteBuilderV2.textClient()">
                        <span>💬</span> Text ${firstName}
                    </button>
                    <button class="qb-btn-action primary" onclick="window.QuoteBuilderV2.saveAndClose()">
                        <span>✓</span> Save & Close
                    </button>
                </div>
            </div>
        `;
    }

    // Copy script
    function copyScript() {
        const script = document.querySelector('.qb-script-box')?.textContent;
        if (script) {
            navigator.clipboard.writeText(script.trim());
            alert('Script copied to clipboard!');
        }
    }

    // Generate PDF
    function generatePDF() {
        alert('PDF generation would happen here');
    }

    // Email client
    function emailClient() {
        const client = qbState.clientData;
        if (client?.email) {
            window.location.href = `mailto:${client.email}?subject=Your HELOC Quote`;
        } else {
            alert('No email address for this client');
        }
    }

    // Text client
    function textClient() {
        const client = qbState.clientData;
        if (client?.phone) {
            window.location.href = `sms:${client.phone}`;
        } else {
            alert('No phone number for this client');
        }
    }

    // Save and close
    function saveAndClose() {
        // Apply to form
        applyQuoteToForm();
        
        // Save smart defaults for next time
        saveSmartDefaults(qbState);
        
        // Save to follow-up system
        const rec = calculateRecommendation();
        if (window.QuoteBuilderFollowUp) {
            qbState.quoteId = window.QuoteBuilderFollowUp.saveQuote({
                clientName: qbState.clientData?.name || 'Unknown',
                clientPhone: qbState.clientData?.phone || '',
                clientEmail: qbState.clientData?.email || '',
                amount: qbState.cashNeeded || 0,
                tier: rec.tier,
                rate: rec.rate,
                payment: rec.payment,
                purpose: qbState.clientData?.purpose || ''
            });
        }
        
        close();
        showToast('Quote saved successfully! 🎉');
        
        // Show objection prep option
        setTimeout(() => {
            if (confirm('Would you like to see pre-call briefing with talking points?')) {
                showPreCallBriefing();
            }
        }, 500);
    }
    
    // Show pre-call briefing
    function showPreCallBriefing() {
        if (window.QuoteBuilderObjections) {
            const rec = calculateRecommendation();
            window.QuoteBuilderObjections.showObjectionPrep({
                clientName: qbState.clientData?.name,
                amount: qbState.cashNeeded,
                creditScore: parseInt(qbState.clientData?.creditScore) || 720,
                ltv: qbState.clientData?.propertyValue ? 
                    ((qbState.clientData.mortgageBalance || 0) / qbState.clientData.propertyValue * 100) : 70,
                tier: rec.tier,
                rate: rec.rate,
                monthlyPayment: rec.payment,
                purpose: qbState.clientData?.purpose
            });
        }
    }

    // Apply quote to main form
    function applyQuoteToForm() {
        const client = qbState.clientData;
        const rec = calculateRecommendation();
        
        // Set form values
        const nameField = document.getElementById('in-client-name');
        if (nameField) nameField.value = client.name || '';
        
        const creditField = document.getElementById('in-client-credit');
        if (creditField) creditField.value = client.creditScore || '';
        
        const homeValueField = document.getElementById('in-home-value');
        if (homeValueField) homeValueField.value = client.propertyValue || '';
        
        const mortgageField = document.getElementById('in-mortgage-balance');
        if (mortgageField) mortgageField.value = client.mortgageBalance || '';
        
        const cashField = document.getElementById('in-net-cash');
        if (cashField) cashField.value = qbState.cashNeeded || '';
        
        // Trigger update
        if (typeof updateQuote === 'function') {
            updateQuote();
        }
    }

    // Navigation functions
    function nextStep() {
        if (qbState.step < 5) {
            qbState.step++;
            renderQuoteBuilder();
            
            // If advancing to Step 2, fill in pre-filled property data
            if (qbState.step === 2 && qbState.preFilledProperty) {
                setTimeout(() => {
                    const preFilled = qbState.preFilledProperty;
                    console.log('Filling Step 2 with pre-filled data:', preFilled);
                    
                    const addressField = document.getElementById('qb-property-address');
                    if (addressField && preFilled.address) {
                        addressField.value = preFilled.address;
                        addressField.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                    
                    const valueField = document.getElementById('qb-property-value');
                    if (valueField && preFilled.value) {
                        valueField.value = preFilled.value;
                        valueField.dispatchEvent(new Event('input', { bubbles: true }));
                        valueField.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    
                    const mortgageField = document.getElementById('qb-mortgage-balance');
                    if (mortgageField && preFilled.mortgage !== undefined) {
                        mortgageField.value = preFilled.mortgage;
                        mortgageField.dispatchEvent(new Event('input', { bubbles: true }));
                        mortgageField.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                    
                    // Trigger equity calculation
                    if (preFilled.value && preFilled.mortgage !== undefined) {
                        calculateEquity();
                    }
                }, 100);
            }
        }
    }

    function prevStep() {
        if (qbState.step > 1) {
            qbState.step--;
            renderQuoteBuilder();
        }
    }

    function close() {
        qbState.isOpen = false;
        const modal = document.getElementById('quote-builder-modal');
        if (modal) modal.remove();
    }

    // Show toast notification
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'qb-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // Expose Quote Builder globally
    window.QuoteBuilderV2 = {
        init: initQuoteBuilder,
        start: startQuoteBuilder,
        close,
        nextStep,
        prevStep,
        loadLeads,
        selectLead,
        showManualEntry,
        saveClientAndNext,
        calculateEquity,
        lookupProperty,
        savePropertyAndNext,
        showRatePaste,
        useLastRates,
        useSmartDefaults,
        skipRates,
        parseRates,
        showAllOptions,
        selectRecommendation,
        copyScript,
        generatePDF,
        emailClient,
        textClient,
        saveAndClose,
        showPreCallBriefing,
        showObjectionFinder: () => window.QuoteBuilderObjections?.showObjectionFinder(),
        // Expose state and calculation for other modules
        getState: () => ({ ...qbState }),
        calculateRecommendation,
        selectTier,
        showBrokerLaunchPaste,
        parseBrokerLaunchEmail,
        parseFigureRateSheet,
        fillStep2Fields
    };

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initQuoteBuilder);
    } else {
        initQuoteBuilder();
    }
})();
