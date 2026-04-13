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
        isOpen: false,
        snapshot: null,     // Figure DealSnapshot when imported
        offerGrid: null     // Parsed offer grid { tiers: [{originationPct, cells[]}] }
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

    // Check if user has Pro+ tier (Quote Builder is Pro/Enterprise only)
    function hasProTier() {
        const tier = (window.currentUserTier || 'starter').toLowerCase();
        const level = ['starter', 'pro', 'enterprise'].indexOf(tier);
        const effectiveLevel = (window.currentUserRole === 'super_admin') ? 2 : (level === -1 ? 0 : level);
        return effectiveLevel >= 1;
    }

    // Initialize
    function init() {
        if (!hasProTier()) {
            console.log('✗ Quote Builder disabled — Pro+ feature');
            return;
        }
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
        if (!hasProTier()) {
            showToast('Quote Builder is a Pro feature. Please upgrade to access it.');
            return;
        }
        resetState();
        state.isOpen = true;
        render();
    }

    // Close quote builder
    function close() {
        state.isOpen = false;
        stopEzraRatePolling();
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
        state.snapshot = null;
        state.offerGrid = null;
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
        
        // Start/stop Ezra rate polling based on current step
        if (state.step === 3) {
            startEzraRatePolling();
        } else {
            stopEzraRatePolling();
        }
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
                        <div class="qb-form-group" style="flex:1 1 100%;">
                            <label>Email</label>
                            <input type="email" id="client-email" value="${state.client.email || ''}" placeholder="client@example.com">
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

    // Sticky client badge — shows on Steps 2–5 so LO always sees who they're quoting
    function renderClientBadge() {
        const c = state.client || {};
        if (!c.name && !c.phone && !c.email) return '';
        const parts = [];
        if (c.phone) parts.push(`<a href="tel:${c.phone}" class="qb-cb-link">${c.phone}</a>`);
        if (c.email) parts.push(`<a href="mailto:${c.email}" class="qb-cb-link">${c.email}</a>`);
        return `
            <div class="qb-client-badge">
                <div class="qb-cb-name">Quote for <strong>${c.name || 'Client'}</strong></div>
                ${parts.length ? `<div class="qb-cb-meta">${parts.join(' · ')}</div>` : ''}
            </div>
        `;
    }

    // Step 2 contact context — read-only, above property inputs
    function renderContactReadonly() {
        const c = state.client || {};
        const bits = [];
        if (c.creditScore) bits.push(`<span>Credit: <strong>${c.creditScore}</strong></span>`);
        if (c.amount) bits.push(`<span>Cash needed: <strong>$${Number(c.amount).toLocaleString()}</strong></span>`);
        if (c.purpose) bits.push(`<span>Purpose: <strong>${c.purpose}</strong></span>`);
        if (!bits.length) return '';
        return `<div class="qb-contact-readonly">${bits.join('')}</div>`;
    }

    // Step 2: Property
    function renderStep2() {
        return `
            <div class="qb-step">
                ${renderClientBadge()}
                <h4>Step 2: Property & Equity</h4>

                ${renderContactReadonly()}

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
        const hasEzraRates = checkEzraRates();
        
        return `
            <div class="qb-step">
                ${renderClientBadge()}
                <h4>Step 3: Import Today's Rates</h4>
                
                ${hasEzraRates ? `
                    <div class="qb-ezra-rates-ready">
                        <span class="qb-check-icon">✓</span>
                        <div>
                            <strong>Ezra has rates loaded!</strong>
                            <p>Rate sheet with all 3 origination tiers is ready to use.</p>
                        </div>
                        <button class="qb-btn-primary" onclick="QuoteBuilder.useEzraRates()">Use Ezra's Rates</button>
                    </div>
                ` : `
                    <div class="qb-rate-options">
                        <button class="qb-rate-option" onclick="QuoteBuilder.openEzraForRates()">
                            <span class="qb-rate-icon">📋</span>
                            <h5>Import via Ezra</h5>
                            <p>Paste Figure rates in Ezra chat</p>
                        </button>
                        <button class="qb-rate-option" onclick="QuoteBuilder.goToStep(4)">
                            <span class="qb-rate-icon">✓</span>
                            <h5>Use Current Rates</h5>
                            <p>From rate matrix</p>
                        </button>
                    </div>
                    
                    <div class="qb-ezra-instructions">
                        <p><strong>How to import rates via Ezra:</strong></p>
                        <ol>
                            <li>Click "Import via Ezra" above to open Ezra chat</li>
                            <li>In Ezra, paste your Figure rate sheet (Ctrl+A, Ctrl+C, Ctrl+V)</li>
                            <li>Ezra will parse all 3 origination fee tiers:
                                <ul>
                                    <li>4.99% origination</li>
                                    <li>2.99% origination</li>
                                    <li>1.5% origination</li>
                                </ul>
                            </li>
                            <li>Return here and click "Use Ezra's Rates"</li>
                        </ol>
                    </div>
                `}
                
                <div class="qb-actions">
                    <button class="qb-btn-secondary" onclick="QuoteBuilder.goToStep(2)">← Back</button>
                </div>
            </div>
        `;
    }
    
    // Check if Ezra has rates loaded
    function checkEzraRates() {
        // Check if Ezra's rate sheet matrix exists and has data
        if (window.EzraState && window.EzraState.rateSheetMatrix) {
            const matrix = window.EzraState.rateSheetMatrix;
            return matrix.baseRates && Object.keys(matrix.baseRates).length > 0;
        }
        return false;
    }
    
    // Poll for Ezra rates (called when Step 3 is rendered)
    let ezraRatePollInterval = null;
    
    function startEzraRatePolling() {
        // Clear any existing poll
        if (ezraRatePollInterval) {
            clearInterval(ezraRatePollInterval);
        }
        
        // Poll every 2 seconds to check if Ezra has rates
        ezraRatePollInterval = setInterval(() => {
            if (state.step === 3 && checkEzraRates()) {
                // Rates detected! Re-render Step 3 to show "Use Ezra's Rates" button
                const stepContainer = document.querySelector('.qb-step');
                if (stepContainer && !document.querySelector('.qb-ezra-rates-ready')) {
                    // Only re-render if we haven't already shown the rates ready state
                    render();
                    showToast('✓ Ezra rates detected!');
                }
            }
        }, 2000);
    }
    
    function stopEzraRatePolling() {
        if (ezraRatePollInterval) {
            clearInterval(ezraRatePollInterval);
            ezraRatePollInterval = null;
        }
    }
    
    // Open Ezra chat for rate import
    function openEzraForRates() {
        // Boost Ezra's z-index so it appears above the Quote Builder overlay (z-index: 10000)
        const ezraWidget = document.getElementById('ezra-widget');
        if (ezraWidget) {
            ezraWidget.style.zIndex = '10010';
        }
        const ezraContainer = document.getElementById('ezra-container');
        if (ezraContainer) {
            ezraContainer.style.zIndex = '10010';
        }
        const ezraOrb = document.getElementById('ezra-orb');
        if (ezraOrb) {
            ezraOrb.style.zIndex = '10010';
        }
        
        // Ensure Ezra is initialized
        if (typeof window.Ezra !== 'undefined' && window.Ezra.open) {
            window.Ezra.open();
            
            // Send message to Ezra prompting for rate paste
            setTimeout(() => {
                if (window.Ezra.sendMessage) {
                    window.Ezra.sendMessage('Paste my Figure rate sheet');
                }
            }, 600);
            
            showToast('Ezra opened. Paste your Figure rate sheet there.');
        } else {
            // Fallback: try clicking the orb directly if Ezra API isn't ready
            if (ezraOrb) {
                ezraOrb.click();
                showToast('Ezra opened. Paste your Figure rate sheet there.');
            } else {
                showToast('Ezra is still loading. Please wait a moment and try again.');
                
                // Retry once after 2 seconds
                setTimeout(() => {
                    if (typeof window.Ezra !== 'undefined' && window.Ezra.open) {
                        window.Ezra.open();
                        setTimeout(() => {
                            if (window.Ezra.sendMessage) {
                                window.Ezra.sendMessage('Paste my Figure rate sheet');
                            }
                        }, 600);
                        showToast('Ezra opened. Paste your Figure rate sheet there.');
                    } else {
                        const orbRetry = document.getElementById('ezra-orb');
                        if (orbRetry) {
                            orbRetry.style.zIndex = '10010';
                            orbRetry.click();
                            showToast('Ezra opened. Paste your Figure rate sheet there.');
                        } else {
                            showToast('Could not open Ezra. Please open it manually from the floating orb.');
                        }
                    }
                }, 2000);
            }
        }
    }
    
    // Use Ezra's parsed rates
    function useEzraRates() {
        if (!checkEzraRates()) {
            showToast('No rates found in Ezra. Please paste rate sheet in Ezra first.');
            return;
        }
        
        // Copy Ezra's rates to our state
        const matrix = window.EzraState.rateSheetMatrix;
        state.rates = {
            source: 'ezra',
            matrix: matrix,
            timestamp: Date.now()
        };
        
        showToast('✓ Rates imported from Ezra!');
        goToStep(4);
    }

    // Step 4: Recommendation
    function renderStep4() {
        const rec = calculateRecommendation();
        state.recommendation = rec;

        // Snapshot banner — only appears when opened via openWithSnapshot()
        let snapshotBanner = '';
        if (state.snapshot && state.offerGrid) {
            const tierCount = state.offerGrid.tiers.length;
            const tierPcts = state.offerGrid.tiers.map(t => `${t.originationPct}%`).join(' · ');
            const hint = tierCount < 3
                ? `<span style="color:#b45309;">Figure offered ${tierCount} origination option${tierCount === 1 ? '' : 's'} for this borrower.</span>`
                : '';
            snapshotBanner = `
                <div class="qb-snapshot-banner">
                    <span>📄 <strong>Imported from Figure</strong> — ${tierPcts} ${hint}</span>
                    <button onclick="QuoteBuilder.goToStep(1)" class="qb-btn-link">Edit inputs</button>
                </div>
            `;
        }

        const typeLabel = rec.type === 'variable' ? 'Variable' : 'Fixed';

        return `
            <div class="qb-step">
                ${renderClientBadge()}
                <h4>Step 4: Recommendation</h4>

                ${snapshotBanner}

                <div class="qb-recommendation-card">
                    <div class="qb-rec-badge">🏆 RECOMMENDED</div>
                    <h5>Tier ${rec.tier} - ${rec.term} Year ${typeLabel} @ ${rec.rate}%</h5>

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
                    <button class="qb-btn-secondary" onclick="QuoteBuilder.goToStep(${state.snapshot ? 1 : 3})">← Back</button>
                    <button class="qb-btn-action qb-btn-share" onclick="QuoteBuilder.shareQuote()">
                        <span>🔗</span> Share Quote with Client
                    </button>
                    <button class="qb-btn-primary" onclick="QuoteBuilder.goToStep(5)">Continue →</button>
                </div>
                <div id="qb-share-result" style="display:none; margin-top:12px;"></div>
            </div>
        `;
    }

    // Step 5: Generate
    function renderStep5() {
        const rec = state.recommendation || calculateRecommendation();
        
        return `
            <div class="qb-step">
                ${renderClientBadge()}
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
                    <button class="qb-btn-action qb-btn-share" onclick="QuoteBuilder.shareQuote()">
                        <span>🔗</span> Share Quote (PDF + Link)
                    </button>
                    <div id="qb-share-result" style="display:none; margin-top:12px;"></div>
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
                email: document.getElementById('client-email')?.value || (state.client && state.client.email) || '',
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
        const amount = parseFloat(state.client.amount) || 75000;

        // If a Figure snapshot offer grid is present, pick the real best cell.
        // Strategy: choose the LOWEST origination tier, 20yr fixed (or closest term ≤20), matching the loan amount band.
        if (state.offerGrid && state.offerGrid.tiers && state.offerGrid.tiers.length) {
            // Lowest origination % = best long-term value for most borrowers
            const preferredTier = [...state.offerGrid.tiers].sort((a, b) => a.originationPct - b.originationPct)[0];
            const tierIdx = state.offerGrid.tiers.indexOf(preferredTier) + 1;
            // Pick the cell whose band contains the amount, fixed, 20yr (or fallback)
            const inBand = (c) => (!c.minAmt || amount >= c.minAmt) && (!c.maxAmt || amount <= c.maxAmt);
            const prefTerm = 20;
            let cell = preferredTier.cells.find(c => c.type === 'fixed' && c.term === prefTerm && inBand(c));
            if (!cell) {
                // Fallback: any fixed in band, shortest term
                cell = preferredTier.cells
                    .filter(c => c.type === 'fixed' && inBand(c))
                    .sort((a, b) => a.term - b.term)[0];
            }
            if (!cell) {
                // Last fallback: first cell available
                cell = preferredTier.cells[0];
            }
            if (cell) {
                const r = parseFloat(cell.rate);
                // Simple interest-only approximation for quick display; full amortization handled elsewhere
                const payment = Math.round(amount * (r / 100) / 12);
                return {
                    tier: String(tierIdx),
                    term: cell.term,
                    rate: r.toFixed(2),
                    orig: preferredTier.originationPct.toFixed(2),
                    payment,
                    type: cell.type,
                    source: 'figure_snapshot'
                };
            }
        }

        // Fallback demo logic for non-snapshot flow
        let tier = '2', rate = '6.375', orig = '1.5';
        if (amount > 100000) { tier = '1'; rate = '5.125'; orig = '2.0'; }
        else if (amount < 50000) { tier = '3'; rate = '7.125'; orig = '0.0'; }
        const payment = Math.round(amount * (parseFloat(rate) / 100) / 12);
        return { tier, term: 20, rate, orig, payment };
    }

    // Build the quote_data payload that client-quote.html expects.
    // Mirrors the shape produced by AboveAllCarbon_HELOC_v12_FIXED.html generateClientLink().
    function buildQuoteDataForShare() {
        const rec = state.recommendation || calculateRecommendation();
        const c = state.client || {};
        const p = state.property || {};
        return {
            clientName: c.name || '',
            clientEmail: c.email || '',
            clientPhone: c.phone || '',
            creditScore: c.creditScore || '',
            propertyAddress: p.address || '',
            propertyType: 'Primary residence',
            homeValue: String(p.value || ''),
            maxQualCash: parseFloat(c.amount) || 0,
            mortgageBalance: String(p.mortgage || ''),
            helocPayoff: '0',
            cashBack: String(c.amount || ''),
            cltv: p.value ? (((parseFloat(p.mortgage || 0) + parseFloat(c.amount || 0)) / parseFloat(p.value)) * 100).toFixed(2) : '',
            totalLoan: String(c.amount || ''),
            rate: String(rec.rate),
            term: rec.term,
            payment: String(rec.payment),
            origination: String(rec.orig),
            recType: rec.type === 'variable' ? 'variable' : 'fixed',
            recTier: 't' + (rec.tier || '2'),
            recTerm: String(rec.term),
            rec2Enabled: false,
            showVariable: false,
            showIO: false,
            date: new Date().toLocaleDateString(),
            // Source marker so client-quote.html can render the Figure snapshot banner if desired
            source: state.snapshot ? 'figure_snapshot' : 'manual',
            linkOptions: {
                showLoInfo: true,
                showAiChat: false,  // LO-only — scripts never reach client per plan rule
                showApply: true,
                showVideo: false,
                videoUrl: '',
                showSalesPsych: true,
                preset: 'original',
                showFees: true,
                showBestOfBoth: true,
                showVsAlternatives: true,
                recTierDisplay: 'rec'
            }
        };
    }

    // Pull LO info from profiles so client-quote.html has the LO card data.
    async function fetchLoInfoSnapshot() {
        const sb = window._supabase;
        const userId = window.currentUserId;
        if (!sb || !userId) return {};
        try {
            const { data } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
            if (!data) return {};
            // Map profile columns into the lo_info shape client-quote.html reads.
            return {
                name: data.lo_name || data.full_name || window.currentUserEmail || '',
                title: data.lo_title || 'Loan Officer',
                email: data.lo_email || window.currentUserEmail || '',
                phone: data.lo_phone || '',
                nmls: data.lo_nmls || '',
                coNmls: data.company_nmls || '',
                company: data.company_name || data.lender_name || '',
                lenderName: data.lender_name || data.company_name || '',
                companyLogo: data.company_logo_url || '',
                headshotUrl: data.lo_headshot_url || data.avatar_url || '',
                calendarLink: data.lo_calendar_link || '',
                bio: data.lo_bio || '',
                googleRating: data.google_rating || '',
                reviewLink: data.review_link || '',
                dre: data.lo_dre || ''
            };
        } catch (err) {
            console.warn('[QB] fetchLoInfoSnapshot failed:', err);
            return {};
        }
    }

    // Ensure a share result container exists in the DOM regardless of which step the LO triggers share from
    function _ensureShareResultEl() {
        let el = document.getElementById('qb-share-result');
        if (el) {
            el.style.display = 'block';
            return el;
        }
        // Not on current step — inject a floating panel into the QB modal body as a fallback
        const modalBody = document.querySelector('#quote-builder-modal .qb-body') || document.querySelector('#quote-builder-modal .quote-builder-modal') || document.body;
        el = document.createElement('div');
        el.id = 'qb-share-result';
        el.style.cssText = 'margin:16px 20px; display:block;';
        modalBody.appendChild(el);
        return el;
    }

    // Share quote — insert quote_links row, create short link, copy URL to clipboard
    async function shareQuote() {
        console.log('[QB] shareQuote called. state:', state, 'supabase:', !!window._supabase, 'userId:', window.currentUserId);
        const sb = window._supabase;
        const userId = window.currentUserId;
        const resultEl = _ensureShareResultEl();

        if (!sb) {
            const msg = '❌ Supabase client not loaded (window._supabase is missing). Check that main.js finished loading and auth initialized.';
            resultEl.innerHTML = `<div class="qb-share-error">${msg}</div>`;
            console.error('[QB]', msg);
            showToast('Share: Supabase not ready');
            return;
        }
        if (!userId) {
            const msg = '❌ Not authenticated (window.currentUserId missing). Log in and try again.';
            resultEl.innerHTML = `<div class="qb-share-error">${msg}</div>`;
            console.error('[QB]', msg);
            showToast('Share: not authenticated');
            return;
        }

        resultEl.innerHTML = '<div class="qb-share-loading">🔗 Generating share link…</div>';

        try {
            const quoteData = buildQuoteDataForShare();
            console.log('[QB] shareQuote built quoteData:', quoteData);
            const loInfo = await fetchLoInfoSnapshot();
            const code = Math.random().toString(36).substring(2, 10);

            // Insert quote_links row
            const insertObj = {
                code,
                user_id: userId,
                quote_data: quoteData,
                lo_info: loInfo,
                lo_tier: window.currentUserTier || 'starter'
            };
            console.log('[QB] inserting quote_links:', insertObj);
            const { error: insErr } = await sb.from('quote_links').insert(insertObj);
            if (insErr) {
                console.error('[QB] quote_links insert error:', insErr);
                throw insErr;
            }

            // Build raw URL
            const baseUrl = window.location.origin + window.location.pathname.replace(/[^/]*$/, '');
            const rawLink = baseUrl + 'client-quote.html?id=' + code;
            console.log('[QB] raw link:', rawLink);

            // Try to shorten via RPC (reuses the proven create_short_link function)
            let finalUrl = rawLink;
            try {
                const { data: shortData, error: shortErr } = await sb.rpc('create_short_link', {
                    p_destination_url: rawLink,
                    p_title: 'HELOC Quote - ' + (quoteData.clientName || 'Client'),
                    p_category: 'quote',
                    p_domain: 'go.aboveallcrm.com',
                    p_user_id: userId,
                    p_utm_source: 'carbon_heloc',
                    p_utm_medium: 'quote_link',
                    p_utm_campaign: 'qb_share'
                });
                if (shortErr) console.warn('[QB] create_short_link RPC error:', shortErr);
                if (shortData && shortData.length > 0 && shortData[0].out_short_url) {
                    finalUrl = shortData[0].out_short_url;
                    await sb.from('quote_links')
                        .update({ short_link_id: shortData[0].out_id, short_url: finalUrl })
                        .eq('code', code);
                }
            } catch (shortErr) {
                console.warn('[QB] short link failed, using raw URL:', shortErr);
            }

            // Copy to clipboard
            let copied = false;
            try {
                await navigator.clipboard.writeText(finalUrl);
                copied = true;
            } catch {}

            // Render result block
            const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));
            resultEl.innerHTML = `
                <div class="qb-share-result">
                    <div class="qb-share-title">✅ Quote link ready${copied ? ' — copied to clipboard' : ''}</div>
                    <div class="qb-share-url">
                        <input type="text" readonly value="${esc(finalUrl)}" onclick="this.select()">
                        <button class="qb-btn-link" onclick="navigator.clipboard.writeText('${esc(finalUrl)}').then(()=>QuoteBuilder._toastCopied())">Copy</button>
                    </div>
                    <div class="qb-share-actions">
                        <a href="${esc(finalUrl)}" target="_blank" rel="noopener" class="qb-btn-link">👁️ Preview</a>
                        ${quoteData.clientEmail ? `<a href="mailto:${esc(quoteData.clientEmail)}?subject=${encodeURIComponent('Your HELOC Quote')}&body=${encodeURIComponent('Hi ' + (quoteData.clientName || '') + ',\n\nHere is your personalized HELOC quote:\n' + finalUrl + '\n\nLet me know if you have any questions.')}" class="qb-btn-link">✉️ Email to Client</a>` : ''}
                        ${quoteData.clientPhone ? `<a href="sms:${esc(quoteData.clientPhone)}?body=${encodeURIComponent('Your HELOC quote: ' + finalUrl)}" class="qb-btn-link">💬 Text to Client</a>` : ''}
                    </div>
                </div>
            `;
            // Scroll result into view — the LO shouldn't have to hunt for it
            try { resultEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch {}
            showToast('Share link ready!');
            console.log('[QB] share complete. URL:', finalUrl);
        } catch (err) {
            console.error('[QB] shareQuote failed:', err);
            resultEl.innerHTML = `<div class="qb-share-error">❌ ${err.message || 'Failed to generate share link'}<br><small>Check browser console for details.</small></div>`;
            showToast('Share failed — check console.');
        }
    }

    function _toastCopied() { showToast('Copied!'); }

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
    // Open directly from a Figure DealSnapshot — pre-fills client + property + offer grid,
    // skips Steps 1–3 and lands on Step 4 (Recommendation).
    function openWithSnapshot(snap) {
        console.log('[QuoteBuilder.openWithSnapshot] called with:', snap, 'tier:', window.currentUserTier, 'role:', window.currentUserRole);
        if (!hasProTier()) {
            console.warn('[QuoteBuilder] blocked by tier gate — user tier:', window.currentUserTier, 'role:', window.currentUserRole);
            showToast('Quote Builder is a Pro feature. Please upgrade to access it.');
            return;
        }
        if (!snap) {
            showToast('No snapshot provided.');
            return;
        }
        resetState();
        state.snapshot = snap;

        const b = snap.borrower || {};
        const p = snap.property || {};
        const lien = snap.lien || {};
        const maxLoanFromGrid = (snap.offerGrid?.tiers?.[0]?.cells || [])
            .reduce((m, c) => Math.max(m, c.maxAmt || 0), 0);

        state.client = {
            name: b.name || '',
            phone: b.phone || '',
            email: b.email || '',
            creditScore: b.fico || '',
            amount: maxLoanFromGrid || '',
            purpose: '' // Figure app doesn't capture this — LO picks on Step 5
        };

        state.property = {
            address: p.address || '',
            value: p.avm || '',
            mortgage: lien.currentBalance || ''
        };

        state.offerGrid = snap.offerGrid || null;
        state.rates = { source: 'figure_snapshot', matrix: state.offerGrid, timestamp: Date.now() };

        state.isOpen = true;
        state.step = 4; // Jump straight to Recommendation
        render();
        showToast('Figure snapshot imported — review recommendation.');
    }

    window.QuoteBuilder = {
        init,
        open,
        openWithSnapshot,
        close,
        goToStep,
        loadLeads,
        selectLead,
        showBrokerPaste,
        parseBrokerEmail,
        showRatePaste,
        parseRates,
        openEzraForRates,
        useEzraRates,
        calculateEquity,
        saveQuote,
        shareQuote,
        _toastCopied
    };

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
