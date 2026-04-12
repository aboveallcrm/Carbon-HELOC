/**
 * Interactive Quote Builder for Above All Carbon HELOC
 * Ezra-guided quote building wizard
 */

(function() {
    'use strict';

    // Quote Builder State
    let qbState = {
        step: 0,
        clientData: null,
        rates: null,
        cashNeeded: 0,
        rateType: 'fixed',
        preset: 'simple',
        isOpen: false
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
        },
        'client-compare': {
            name: 'Client-Compare',
            description: 'Client-friendly comparison',
            sections: ['comparison', 'recommendation', 'next-steps']
        }
    };

    // Initialize Quote Builder
    function initQuoteBuilder() {
        console.log('Quote Builder initialized');
    }

    // Start the quote builder wizard
    function startQuoteBuilder() {
        qbState = {
            step: 1,
            clientData: null,
            rates: null,
            cashNeeded: 0,
            rateType: 'fixed',
            preset: 'simple',
            isOpen: true
        };
        
        renderQuoteBuilder();
    }

    // Render the quote builder UI
    function renderQuoteBuilder() {
        // Remove existing modal
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
                        <h3>Quote Builder</h3>
                    </div>
                    <button class="qb-close" onclick="window.QuoteBuilder.close()">×</button>
                </div>
                
                <div class="qb-progress">
                    <div class="qb-progress-bar">
                        <div class="qb-progress-fill" style="width: ${(qbState.step / 6) * 100}%"></div>
                    </div>
                    <div class="qb-step-indicator">Step ${qbState.step} of 6</div>
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
                return renderStep1_Welcome();
            case 2:
                return renderStep2_Client();
            case 3:
                return renderStep3_Rates();
            case 4:
                return renderStep4_Cash();
            case 5:
                return renderStep5_Preset();
            case 6:
                return renderStep6_Review();
            default:
                return '';
        }
    }

    // Step 1: Welcome
    function renderStep1_Welcome() {
        return `
            <div class="qb-step">
                <h4>Welcome to Quote Builder! 👋</h4>
                <p>I'll guide you through building a professional HELOC quote step by step.</p>
                
                <div class="qb-features">
                    <div class="qb-feature">
                        <span class="qb-feature-icon">📊</span>
                        <span>Import rates from Figure or Nifty Door</span>
                    </div>
                    <div class="qb-feature">
                        <span class="qb-feature-icon">💰</span>
                        <span>Calculate exact payments and fees</span>
                    </div>
                    <div class="qb-feature">
                        <span class="qb-feature-icon">📄</span>
                        <span>Generate client-ready proposals</span>
                    </div>
                </div>
                
                <div class="qb-actions">
                    <button class="qb-btn-primary" onclick="window.QuoteBuilder.nextStep()">
                        Get Started →
                    </button>
                </div>
            </div>
        `;
    }

    // Step 2: Select Client
    function renderStep2_Client() {
        return `
            <div class="qb-step">
                <h4>Step 2: Select Client</h4>
                <p>Choose a client from your pipeline or enter manually.</p>
                
                <div class="qb-client-options">
                    <div class="qb-client-option" onclick="window.QuoteBuilder.selectClientSource('pipeline')">
                        <span class="qb-option-icon">📋</span>
                        <h5>From Pipeline</h5>
                        <p>Select from your leads</p>
                    </div>
                    <div class="qb-client-option" onclick="window.QuoteBuilder.selectClientSource('manual')">
                        <span class="qb-option-icon">✏️</span>
                        <h5>Enter Manually</h5>
                        <p>Type client details</p>
                    </div>
                    <div class="qb-client-option" onclick="window.QuoteBuilder.selectClientSource('paste')">
                        <span class="qb-option-icon">📧</span>
                        <h5>Paste Email</h5>
                        <p>Extract from email text</p>
                    </div>
                </div>
                
                <div id="qb-client-form" class="qb-client-form" style="display: none;">
                    <div class="qb-form-group">
                        <label>Client Name</label>
                        <input type="text" id="qb-client-name" placeholder="John Smith">
                    </div>
                    <div class="qb-form-group">
                        <label>Credit Score</label>
                        <select id="qb-client-credit">
                            <option value="">Select range...</option>
                            <option value="760+">760+ (Excellent)</option>
                            <option value="720-759">720-759 (Very Good)</option>
                            <option value="680-719">680-719 (Good)</option>
                            <option value="640-679">640-679 (Fair)</option>
                            <option value="<640">Below 640</option>
                        </select>
                    </div>
                    <div class="qb-form-row">
                        <div class="qb-form-group">
                            <label>Home Value</label>
                            <input type="number" id="qb-home-value" placeholder="500000">
                        </div>
                        <div class="qb-form-group">
                            <label>Mortgage Balance</label>
                            <input type="number" id="qb-mortgage-balance" placeholder="300000">
                        </div>
                    </div>
                </div>
                
                <div class="qb-actions">
                    <button class="qb-btn-secondary" onclick="window.QuoteBuilder.prevStep()">← Back</button>
                    <button class="qb-btn-primary" onclick="window.QuoteBuilder.saveClientAndNext()">Continue →</button>
                </div>
            </div>
        `;
    }

    // Step 3: Import Rates
    function renderStep3_Rates() {
        return `
            <div class="qb-step">
                <h4>Step 3: Import Rates</h4>
                <p>Paste your rate sheet from Figure or Nifty Door.</p>
                
                <div class="qb-rate-tabs">
                    <button class="qb-tab active" onclick="window.QuoteBuilder.setRateSource('figure')">Figure</button>
                    <button class="qb-tab" onclick="window.QuoteBuilder.setRateSource('niftydoor')">Nifty Door</button>
                    <button class="qb-tab" onclick="window.QuoteBuilder.setRateSource('manual')">Manual</button>
                </div>
                
                <div class="qb-rate-input">
                    <textarea id="qb-rate-text" placeholder="Paste rate sheet here..."></textarea>
                    <details class="qb-help">
                        <summary>How to copy rates</summary>
                        <div class="qb-help-content">
                            <p><strong>From Figure:</strong></p>
                            <ol>
                                <li>Log into your Figure account</li>
                                <li>Go to "Rate Sheets" or "Pricing"</li>
                                <li>Select your product (HELOC 1st/2nd)</li>
                                <li>Click "Copy All" or select table</li>
                                <li>Paste directly here</li>
                            </ol>
                            <p><strong>From Nifty Door:</strong></p>
                            <ol>
                                <li>Log into Nifty Door</li>
                                <li>Go to "Pricing Engine"</li>
                                <li>Run pricing for your scenario</li>
                                <li>Click "Copy Results"</li>
                                <li>Paste directly here</li>
                            </ol>
                        </div>
                    </details>
                </div>
                
                <div class="qb-actions">
                    <button class="qb-btn-secondary" onclick="window.QuoteBuilder.prevStep()">← Back</button>
                    <button class="qb-btn-primary" onclick="window.QuoteBuilder.parseRates()">Extract Rates</button>
                </div>
            </div>
        `;
    }

    // Step 4: Cash Needed
    function renderStep4_Cash() {
        return `
            <div class="qb-step">
                <h4>Step 4: Cash Needed</h4>
                <p>How much cash does the borrower need?</p>
                
                <div class="qb-cash-input">
                    <div class="qb-form-group">
                        <label>Cash Needed ($)</label>
                        <input type="number" id="qb-cash-needed" placeholder="75000" 
                               value="${qbState.cashNeeded || ''}"
                               onchange="window.QuoteBuilder.updateCashNeeded(this.value)">
                    </div>
                    
                    <div class="qb-cltv-preview">
                        <div class="qb-cltv-label">Estimated CLTV:</div>
                        <div class="qb-cltv-value" id="qb-cltv-value">--</div>
                    </div>
                </div>
                
                <div class="qb-rate-type">
                    <label>Rate Type</label>
                    <div class="qb-rate-options">
                        <label class="qb-radio">
                            <input type="radio" name="rate-type" value="fixed" 
                                   ${qbState.rateType === 'fixed' ? 'checked' : ''}
                                   onchange="window.QuoteBuilder.setRateType('fixed')">
                            <span>Fixed Rate</span>
                        </label>
                        <label class="qb-radio">
                            <input type="radio" name="rate-type" value="variable"
                                   ${qbState.rateType === 'variable' ? 'checked' : ''}
                                   onchange="window.QuoteBuilder.setRateType('variable')">
                            <span>Variable Rate</span>
                        </label>
                        <label class="qb-radio">
                            <input type="radio" name="rate-type" value="both"
                                   ${qbState.rateType === 'both' ? 'checked' : ''}
                                   onchange="window.QuoteBuilder.setRateType('both')">
                            <span>Show Both</span>
                        </label>
                    </div>
                </div>
                
                <div class="qb-actions">
                    <button class="qb-btn-secondary" onclick="window.QuoteBuilder.prevStep()">← Back</button>
                    <button class="qb-btn-primary" onclick="window.QuoteBuilder.nextStep()">Continue →</button>
                </div>
            </div>
        `;
    }

    // Step 5: Select Preset
    function renderStep5_Preset() {
        const presets = Object.entries(QUOTE_PRESETS).map(([key, preset]) => `
            <div class="qb-preset ${qbState.preset === key ? 'selected' : ''}" 
                 onclick="window.QuoteBuilder.selectPreset('${key}')">
                <h5>${preset.name}</h5>
                <p>${preset.description}</p>
                <div class="qb-preset-sections">
                    ${preset.sections.map(s => `<span>${s}</span>`).join('')}
                </div>
            </div>
        `).join('');

        return `
            <div class="qb-step">
                <h4>Step 5: Quote Style</h4>
                <p>Choose how you want to present the quote.</p>
                
                <div class="qb-presets">
                    ${presets}
                </div>
                
                <div class="qb-actions">
                    <button class="qb-btn-secondary" onclick="window.QuoteBuilder.prevStep()">← Back</button>
                    <button class="qb-btn-primary" onclick="window.QuoteBuilder.nextStep()">Review →</button>
                </div>
            </div>
        `;
    }

    // Step 6: Review & Generate
    function renderStep6_Review() {
        const preset = QUOTE_PRESETS[qbState.preset];
        
        return `
            <div class="qb-step">
                <h4>Step 6: Review & Generate</h4>
                <p>Review your quote details before generating.</p>
                
                <div class="qb-review">
                    <div class="qb-review-item">
                        <span class="qb-review-label">Client:</span>
                        <span class="qb-review-value">${qbState.clientData?.name || 'Not set'}</span>
                    </div>
                    <div class="qb-review-item">
                        <span class="qb-review-label">Cash Needed:</span>
                        <span class="qb-review-value">$${parseInt(qbState.cashNeeded).toLocaleString()}</span>
                    </div>
                    <div class="qb-review-item">
                        <span class="qb-review-label">Rate Type:</span>
                        <span class="qb-review-value">${qbState.rateType}</span>
                    </div>
                    <div class="qb-review-item">
                        <span class="qb-review-label">Quote Style:</span>
                        <span class="qb-review-value">${preset.name}</span>
                    </div>
                </div>
                
                <div class="qb-actions">
                    <button class="qb-btn-secondary" onclick="window.QuoteBuilder.prevStep()">← Back</button>
                    <button class="qb-btn-primary qb-btn-generate" onclick="window.QuoteBuilder.generateQuote()">
                        Generate Quote ✨
                    </button>
                </div>
            </div>
        `;
    }

    // Navigation functions
    function nextStep() {
        if (qbState.step < 6) {
            qbState.step++;
            renderQuoteBuilder();
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

    // Step 2: Client selection
    function selectClientSource(source) {
        const form = document.getElementById('qb-client-form');
        form.style.display = source === 'manual' ? 'block' : 'none';
        
        if (source === 'pipeline') {
            // Open lead selector
            alert('Lead selector would open here - integrate with your leads system');
        }
    }

    function saveClientAndNext() {
        const name = document.getElementById('qb-client-name')?.value;
        const credit = document.getElementById('qb-client-credit')?.value;
        const homeValue = document.getElementById('qb-home-value')?.value;
        const mortgageBalance = document.getElementById('qb-mortgage-balance')?.value;
        
        qbState.clientData = {
            name,
            credit,
            homeValue: parseFloat(homeValue) || 0,
            mortgageBalance: parseFloat(mortgageBalance) || 0
        };
        
        nextStep();
    }

    // Step 3: Rate parsing
    function setRateSource(source) {
        document.querySelectorAll('.qb-tab').forEach(tab => tab.classList.remove('active'));
        event.target.classList.add('active');
    }

    function parseRates() {
        const rateText = document.getElementById('qb-rate-text').value;
        if (!rateText.trim()) {
            alert('Please paste rate data first');
            return;
        }
        
        // Use the existing rate parser from ezra-chat.js
        if (window.Ezra && window.Ezra.parseRateSheet) {
            const rates = window.Ezra.parseRateSheet(rateText);
            qbState.rates = rates;
            alert('Rates extracted successfully!');
            nextStep();
        } else {
            // Fallback: just store the text
            qbState.rates = { raw: rateText };
            nextStep();
        }
    }

    // Step 4: Cash and rate type
    function updateCashNeeded(value) {
        qbState.cashNeeded = parseFloat(value) || 0;
        updateCLTV();
    }

    function setRateType(type) {
        qbState.rateType = type;
    }

    function updateCLTV() {
        if (!qbState.clientData) return;
        
        const homeValue = qbState.clientData.homeValue || 0;
        const mortgageBalance = qbState.clientData.mortgageBalance || 0;
        const cashNeeded = qbState.cashNeeded || 0;
        
        if (homeValue > 0) {
            const cltv = ((mortgageBalance + cashNeeded) / homeValue) * 100;
            document.getElementById('qb-cltv-value').textContent = cltv.toFixed(1) + '%';
        }
    }

    // Step 5: Preset selection
    function selectPreset(preset) {
        qbState.preset = preset;
        document.querySelectorAll('.qb-preset').forEach(p => p.classList.remove('selected'));
        event.currentTarget.classList.add('selected');
    }

    // Step 6: Generate quote
    function generateQuote() {
        // Apply data to form
        if (qbState.clientData) {
            const nameField = document.getElementById('in-client-name');
            if (nameField) nameField.value = qbState.clientData.name;
            
            const creditField = document.getElementById('in-client-credit');
            if (creditField) creditField.value = qbState.clientData.credit;
            
            const homeValueField = document.getElementById('in-home-value');
            if (homeValueField) homeValueField.value = qbState.clientData.homeValue;
            
            const mortgageField = document.getElementById('in-mortgage-balance');
            if (mortgageField) mortgageField.value = qbState.clientData.mortgageBalance;
            
            const cashField = document.getElementById('in-net-cash');
            if (cashField) cashField.value = qbState.cashNeeded;
        }
        
        // Apply rates if parsed
        if (qbState.rates && window.Ezra && window.Ezra.applyRatesToForm) {
            window.Ezra.applyRatesToForm(qbState.rates);
        }
        
        // Trigger quote update
        if (typeof updateQuote === 'function') {
            updateQuote();
        }
        
        // Close modal
        close();
        
        // Show success message
        showToast('Quote generated successfully! ✨');
    }

    // Utility: Show toast
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'qb-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // Expose Quote Builder globally
    window.QuoteBuilder = {
        init: initQuoteBuilder,
        start: startQuoteBuilder,
        close,
        nextStep,
        prevStep,
        selectClientSource,
        saveClientAndNext,
        setRateSource,
        parseRates,
        updateCashNeeded,
        setRateType,
        selectPreset,
        generateQuote
    };

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initQuoteBuilder);
    } else {
        initQuoteBuilder();
    }
})();
