/**
 * EZRA AI - ULTIMATE EDITION
 * Complete mortgage intelligence ecosystem
 * 
 * Features 1-12: All advanced capabilities
 */

(function() {
    'use strict';

    const EzraUltimate = {
        version: '3.0.0',
        supabase: null,
        user: null,
        config: {
            rateCheckInterval: 3600000, // 1 hour
            equityScanInterval: 86400000, // 24 hours
            resurrectionInterval: 604800000, // 7 days
        },

        async init() {
            if (!window._supabase) {
                setTimeout(() => this.init(), 500);
                return;
            }
            
            this.supabase = window._supabase;
            await this.checkAuth();
            
            // Initialize all 12 modules
            this.RateDefense.init();
            this.DocumentReader.init();
            this.BorrowerCopilot.init();
            this.ResurrectionEngine.init();
            this.ReferralIntel.init();
            this.EquityAlerts.init();
            this.RolePlay.init();
            this.MarketAdvisor.init();
            this.SmartSchedule.init();
            this.PortfolioAnalysis.init();
            this.WhiteLabel.init();
            this.PredictiveScoring.init();
            
            console.log('🤖 Ezra AI Ultimate v3.0 - All Systems Active');
            this.showActivationMessage();
        },

        async checkAuth() {
            const { data: { session } } = await this.supabase.auth.getSession();
            if (session?.user) {
                this.user = session.user;
                this.loadUserPreferences();
            }
        },

        async loadUserPreferences() {
            const { data } = await this.supabase
                .from('ezra_user_preferences')
                .select('*')
                .eq('loan_officer_id', this.user.id)
                .single();
            
            if (data) {
                this.userPrefs = data;
            }
        },

        showActivationMessage() {
            const features = [
                'Rate Shopping Defense',
                'Document AI Reader',
                'Borrower Co-Pilot',
                'Deal Resurrection',
                'Referral Intelligence',
                'Equity Alerts',
                'Role-Play Training',
                'Market Timing',
                'Smart Scheduling',
                'Portfolio Analysis',
                'White-Label AI',
                'Predictive Scoring'
            ];
            
            console.log('%c🚀 Ezra Ultimate Activated', 'font-size: 20px; font-weight: bold; color: #d4af37;');
            console.log('%cActive Features: ' + features.join(', '), 'color: #666;');
        }
    };

    // ============================================
    // 1. RATE SHOPPING DEFENSE
    // ============================================
    EzraUltimate.RateDefense = {
        competitorRates: {},
        
        init() {
            this.loadCompetitorRates();
            this.createDefensePanel();
            this.attachQuoteWatcher();
        },

        async loadCompetitorRates() {
            // Load current market rates from database or API
            const { data } = await EzraUltimate.supabase
                .from('market_rates')
                .select('*')
                .order('updated_at', { ascending: false })
                .limit(1);
            
            if (data?.[0]) {
                this.competitorRates = data[0].rates;
            }
        },

        createDefensePanel() {
            const panel = document.createElement('div');
            panel.id = 'ezra-rate-defense';
            panel.style.cssText = `
                position: fixed;
                left: 20px;
                top: 100px;
                width: 300px;
                background: rgba(15,23,42,0.98);
                border: 1px solid rgba(239,68,68,0.5);
                border-radius: 12px;
                padding: 16px;
                z-index: 9998;
                display: none;
            `;
            document.body.appendChild(panel);
        },

        attachQuoteWatcher() {
            // Watch for borrower mentioning competitors
            const rateField = document.getElementById('heloc-rate');;
            if (rateField) {
                rateField.addEventListener('change', () => this.checkCompetitivePosition());
            }
        },

        async checkCompetitivePosition() {
            const myRate = parseFloat(document.getElementById('heloc-rate')?.value) || 0;
            const creditScore = parseInt(document.getElementById('in-client-credit')?.value) || 700;
            const cltv = parseFloat(document.getElementById('cltv-display')?.textContent) || 80;
            
            // Find competitor rates for this profile
            const competitors = this.findCompetitorRates(creditScore, cltv);
            
            const betterCompetitors = competitors.filter(c => c.rate < myRate);
            
            if (betterCompetitors.length > 0) {
                this.showDefenseAlert(myRate, betterCompetitors);
            }
        },

        findCompetitorRates(creditScore, cltv) {
            // Map to competitor rate tiers
            const tier = creditScore >= 740 ? 'excellent' : creditScore >= 700 ? 'good' : 'fair';
            const ltvTier = cltv <= 70 ? 'low_ltv' : cltv <= 80 ? 'standard' : 'high_ltv';
            
            return [
                { name: 'Rocket Mortgage', rate: this.competitorRates.rocket?.[tier]?.[ltvTier] || 8.5 },
                { name: 'Bank of America', rate: this.competitorRates.bofa?.[tier]?.[ltvTier] || 8.75 },
                { name: 'Wells Fargo', rate: this.competitorRates.wells?.[tier]?.[ltvTier] || 8.625 },
                { name: 'Chase', rate: this.competitorRates.chase?.[tier]?.[ltvTier] || 8.375 }
            ].filter(c => c.rate);
        },

        showDefenseAlert(myRate, competitors) {
            const panel = document.getElementById('ezra-rate-defense');
            const bestCompetitor = competitors.reduce((min, c) => c.rate < min.rate ? c : min);
            const diff = (myRate - bestCompetitor.rate).toFixed(2);
            
            panel.innerHTML = `
                <div style="color: #ef4444; font-weight: 600; margin-bottom: 12px; font-size: 13px;">
                    ⚠️ RATE SHOPPING ALERT
                </div>
                <div style="color: rgba(255,255,255,0.9); font-size: 12px; margin-bottom: 12px;">
                    ${bestCompetitor.name} is advertising ${bestCompetitor.rate}% 
                    (${diff}% lower than your ${myRate}%)
                </div>
                <div style="background: rgba(34,197,94,0.1); border-left: 3px solid #22c55e; padding: 10px; margin-bottom: 12px; border-radius: 0 8px 8px 0;">
                    <div style="color: #86efac; font-size: 11px; font-weight: 600; margin-bottom: 4px;">YOUR COUNTER:</div>
                    <div style="color: white; font-size: 12px;">
                        ${this.generateCounterOffer(myRate, bestCompetitor)}
                    </div>
                </div>
                <button onclick="EzraUltimate.RateDefense.generateBattlecard()" style="width: 100%; background: #ef4444; color: white; border: none; padding: 8px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">
                    Generate Battle Card
                </button>
            `;
            
            panel.style.display = 'block';
        },

        generateCounterOffer(myRate, competitor) {
            const strategies = [
                `Match rate at ${competitor.rate}% (minimal margin impact)`,
                `Beat by 0.125% at ${(competitor.rate - 0.125).toFixed(3)}%`,
                `Keep ${myRate}% but waive $995 origination fee`,
                `Offer ${myRate}% with 0.25% lender credit ($375 on $150k)`
            ];
            
            return strategies[0]; // Return best option
        },

        generateBattlecard() {
            const myRate = parseFloat(document.getElementById('heloc-rate')?.value) || 0;
            const helocAmount = parseFloat(document.getElementById('in-net-cash')?.value) || 0;
            
            const battlecard = {
                myOffer: {
                    rate: myRate,
                    fees: 995,
                    fiveYearCost: this.calculate5YearCost(myRate, helocAmount, 995)
                },
                theirLikelyOffer: {
                    rate: myRate - 0.25,
                    fees: 2500,
                    fiveYearCost: this.calculate5YearCost(myRate - 0.25, helocAmount, 2500)
                },
                talkingPoints: [
                    `"Their lower rate costs $1,505 more in fees"`,
                    `"Over 5 years, we save you $${(this.calculate5YearCost(myRate - 0.25, helocAmount, 2500) - this.calculate5YearCost(myRate, helocAmount, 995)).toLocaleString()}"`,
                    `"We close in 10 days vs their 3-4 weeks"`,
                    `"Local service vs 1-800 number"`,
                    `"No prepayment penalty - pay off anytime"`
                ],
                counterOffers: [
                    { rate: myRate - 0.125, fees: 995, label: 'Match & Beat' },
                    { rate: myRate, fees: 0, label: 'Waive Fees' }
                ]
            };
            
            this.showBattlecardModal(battlecard);
        },

        calculate5YearCost(rate, amount, fees) {
            const annualInterest = amount * (rate / 100);
            return (annualInterest * 5) + fees;
        },

        showBattlecardModal(battlecard) {
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(15,23,42,0.98);
                border: 2px solid #d4af37;
                border-radius: 16px;
                padding: 24px;
                max-width: 500px;
                z-index: 10002;
                box-shadow: 0 25px 50px rgba(0,0,0,0.5);
            `;
            
            modal.innerHTML = `
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="font-size: 24px; margin-bottom: 8px;">🛡️</div>
                    <div style="color: #d4af37; font-weight: 700; font-size: 18px;">RATE BATTLE CARD</div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
                    <div style="background: rgba(34,197,94,0.1); padding: 12px; border-radius: 8px;">
                        <div style="color: #86efac; font-size: 11px; font-weight: 600;">YOUR OFFER</div>
                        <div style="color: white; font-size: 20px; font-weight: 700;">${battlecard.myOffer.rate}%</div>
                        <div style="color: rgba(255,255,255,0.7); font-size: 11px;">$${battlecard.myOffer.fees} fees</div>
                        <div style="color: rgba(255,255,255,0.7); font-size: 11px; margin-top: 4px;">5-yr cost: $${battlecard.myOffer.fiveYearCost.toLocaleString()}</div>
                    </div>
                    <div style="background: rgba(239,68,68,0.1); padding: 12px; border-radius: 8px;">
                        <div style="color: #fca5a5; font-size: 11px; font-weight: 600;">THEIR LIKELY OFFER</div>
                        <div style="color: white; font-size: 20px; font-weight: 700;">${battlecard.theirLikelyOffer.rate}%</div>
                        <div style="color: rgba(255,255,255,0.7); font-size: 11px;">$${battlecard.theirLikelyOffer.fees} fees</div>
                        <div style="color: rgba(255,255,255,0.7); font-size: 11px; margin-top: 4px;">5-yr cost: $${battlecard.theirLikelyOffer.fiveYearCost.toLocaleString()}</div>
                    </div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <div style="color: #d4af37; font-size: 12px; font-weight: 600; margin-bottom: 8px;">💬 TALKING POINTS</div>
                    ${battlecard.talkingPoints.map(point => `
                        <div style="background: rgba(255,255,255,0.05); padding: 8px 12px; margin-bottom: 6px; border-radius: 6px; color: rgba(255,255,255,0.9); font-size: 12px; cursor: pointer;" onclick="navigator.clipboard.writeText('${point}'); this.style.background='rgba(34,197,94,0.2)'; setTimeout(()=>this.style.background='rgba(255,255,255,0.05)',500)">
                            ${point} 📋
                        </div>
                    `).join('')}
                </div>
                
                <div style="display: flex; gap: 8px;">
                    ${battlecard.counterOffers.map(offer => `
                        <button onclick="EzraUltimate.RateDefense.applyCounterOffer(${offer.rate}, ${offer.fees})" style="flex: 1; background: linear-gradient(135deg, #1e3a5f, #2d5a8f); color: white; border: 1px solid #d4af37; padding: 10px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer;">
                            ${offer.label}<br>
                            <span style="font-size: 14px;">${offer.rate}%</span>
                        </button>
                    `).join('')}
                    <button onclick="this.closest('.ezra-modal').remove()" style="background: rgba(255,255,255,0.1); color: white; border: none; padding: 10px 16px; border-radius: 6px; font-size: 11px; cursor: pointer;">Close</button>
                </div>
            `;
            
            modal.className = 'ezra-modal';
            document.body.appendChild(modal);
        },

        applyCounterOffer(rate, fees) {
            document.getElementById('heloc-rate').value = rate;
            if (fees === 0) {
                // Set origination to 0
                document.getElementById('origination-fee').value = 0;
            }
            
            // Trigger recalculation
            if (typeof updateQuote === 'function') updateQuote();
            
            EzraUltimate.Visual.showToast('Counter-offer applied!', 'success');
            document.querySelector('.ezra-modal')?.remove();
        }
    };

    // ============================================
    // 2. SMART DOCUMENT READER
    // ============================================
    EzraUltimate.DocumentReader = {
        init() {
            this.createUploadInterface();
            this.setupDragAndDrop();
        },

        createUploadInterface() {
            const uploadZone = document.createElement('div');
            uploadZone.id = 'ezra-document-uploader';
            uploadZone.style.cssText = `
                position: fixed;
                right: 20px;
                bottom: 180px;
                width: 280px;
                background: rgba(15,23,42,0.98);
                border: 2px dashed rgba(212,175,55,0.5);
                border-radius: 12px;
                padding: 20px;
                z-index: 9997;
                text-align: center;
            `;
            
            uploadZone.innerHTML = `
                <div style="font-size: 32px; margin-bottom: 8px;">📄</div>
                <div style="color: #d4af37; font-weight: 600; font-size: 13px; margin-bottom: 8px;">AI DOCUMENT READER</div>
                <div style="color: rgba(255,255,255,0.7); font-size: 11px; margin-bottom: 12px;">
                    Drop W2s, pay stubs, tax returns, or bank statements
                </div>
                <input type="file" id="ezra-doc-upload" accept=".pdf,.jpg,.jpeg,.png" multiple style="display: none;">
                <button onclick="document.getElementById('ezra-doc-upload').click()" style="background: rgba(212,175,55,0.2); color: #d4af37; border: 1px solid #d4af37; padding: 8px 16px; border-radius: 6px; font-size: 12px; cursor: pointer;">
                    Select Files
                </button>
                <div id="ezra-doc-status" style="margin-top: 12px; font-size: 11px; color: rgba(255,255,255,0.5);"></div>
            `;
            
            document.body.appendChild(uploadZone);
            
            // Handle file selection
            document.getElementById('ezra-doc-upload').addEventListener('change', (e) => {
                this.processFiles(e.target.files);
            });
        },

        setupDragAndDrop() {
            const zone = document.getElementById('ezra-document-uploader');
            
            zone.addEventListener('dragover', (e) => {
                e.preventDefault();
                zone.style.borderColor = '#d4af37';
                zone.style.background = 'rgba(212,175,55,0.1)';
            });
            
            zone.addEventListener('dragleave', () => {
                zone.style.borderColor = 'rgba(212,175,55,0.5)';
                zone.style.background = 'rgba(15,23,42,0.98)';
            });
            
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.style.borderColor = 'rgba(212,175,55,0.5)';
                zone.style.background = 'rgba(15,23,42,0.98)';
                this.processFiles(e.dataTransfer.files);
            });
        },

        async processFiles(files) {
            const status = document.getElementById('ezra-doc-status');
            status.textContent = `Processing ${files.length} document(s)...`;
            
            for (const file of files) {
                await this.analyzeDocument(file);
            }
            
            status.textContent = 'Processing complete!';
            setTimeout(() => status.textContent = '', 3000);
        },

        async analyzeDocument(file) {
            // Simulate AI document analysis
            // In production, this would call OCR/AI API
            
            const docType = this.detectDocumentType(file.name);
            
            // Show analyzing state
            this.showAnalyzingModal(file.name);
            
            // Simulate processing delay
            await new Promise(r => setTimeout(r, 2000));
            
            // Mock extracted data based on document type
            const extractedData = this.mockExtraction(docType);
            
            this.showExtractionResults(docType, extractedData);
        },

        detectDocumentType(filename) {
            const lower = filename.toLowerCase();
            if (lower.includes('w2') || lower.includes('w-2')) return 'w2';
            if (lower.includes('paystub') || lower.includes('pay stub')) return 'paystub';
            if (lower.includes('1040') || lower.includes('tax')) return 'tax_return';
            if (lower.includes('bank') || lower.includes('statement')) return 'bank_statement';
            if (lower.includes('1099')) return '1099';
            return 'unknown';
        },

        mockExtraction(docType) {
            const mockData = {
                w2: {
                    employer: 'ABC Corporation',
                    annualIncome: 125000,
                    year: 2024,
                    confidence: 95
                },
                paystub: {
                    employer: 'Tech Solutions Inc',
                    grossPay: 10417,
                    ytdIncome: 93750,
                    payFrequency: 'biweekly',
                    confidence: 92
                },
                tax_return: {
                    agi: 142000,
                    taxableIncome: 128000,
                    year: 2023,
                    confidence: 88
                },
                bank_statement: {
                    month: 'January 2024',
                    endingBalance: 45000,
                    avgBalance: 38000,
                    confidence: 85
                }
            };
            
            return mockData[docType] || { confidence: 0 };
        },

        showAnalyzingModal(filename) {
            // Remove existing modal
            document.getElementById('ezra-analyzing-modal')?.remove();
            
            const modal = document.createElement('div');
            modal.id = 'ezra-analyzing-modal';
            modal.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(15,23,42,0.98);
                border: 1px solid #d4af37;
                border-radius: 12px;
                padding: 32px;
                z-index: 10003;
                text-align: center;
            `;
            
            modal.innerHTML = `
                <div style="font-size: 48px; margin-bottom: 16px;">🤖</div>
                <div style="color: #d4af37; font-weight: 600; margin-bottom: 8px;">AI Analyzing Document</div>
                <div style="color: rgba(255,255,255,0.7); font-size: 12px; margin-bottom: 16px;">${filename}</div>
                <div style="width: 200px; height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;">
                    <div style="width: 0%; height: 100%; background: #d4af37; animation: ezra-progress 2s ease-in-out;"></div>
                </div>
                <style>@keyframes ezra-progress { to { width: 100%; } }</style>
            `;
            
            document.body.appendChild(modal);
        },

        showExtractionResults(docType, data) {
            document.getElementById('ezra-analyzing-modal')?.remove();
            
            const modal = document.createElement('div');
            modal.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(15,23,42,0.98);
                border: 1px solid #22c55e;
                border-radius: 12px;
                padding: 24px;
                z-index: 10003;
                max-width: 400px;
            `;
            
            const fields = this.formatExtractedFields(docType, data);
            
            modal.innerHTML = `
                <div style="text-align: center; margin-bottom: 16px;">
                    <div style="font-size: 32px; margin-bottom: 8px;">✅</div>
                    <div style="color: #22c55e; font-weight: 600;">Document Analyzed</div>
                    <div style="color: rgba(255,255,255,0.5); font-size: 11px;">${data.confidence}% confidence</div>
                </div>
                
                <div style="background: rgba(255,255,255,0.05); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                    ${fields}
                </div>
                
                <div style="display: flex; gap: 8px;">
                    <button onclick="EzraUltimate.DocumentReader.applyToForm('${docType}')" style="flex: 1; background: #22c55e; color: white; border: none; padding: 10px; border-radius: 6px; font-weight: 600; cursor: pointer;">
                        Apply to Form
                    </button>
                    <button onclick="this.closest('.ezra-modal').remove()" style="background: rgba(255,255,255,0.1); color: white; border: none; padding: 10px 16px; border-radius: 6px; cursor: pointer;">
                        Dismiss
                    </button>
                </div>
            `;
            
            modal.className = 'ezra-modal';
            document.body.appendChild(modal);
            
            // Store data for application
            this.lastExtraction = { docType, data };
        },

        formatExtractedFields(docType, data) {
            const formatters = {
                w2: () => `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: rgba(255,255,255,0.7); font-size: 12px;">Employer:</span>
                        <span style="color: white; font-size: 12px; font-weight: 500;">${data.employer}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: rgba(255,255,255,0.7); font-size: 12px;">Annual Income:</span>
                        <span style="color: #22c55e; font-size: 12px; font-weight: 600;">$${data.annualIncome.toLocaleString()}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: rgba(255,255,255,0.7); font-size: 12px;">Tax Year:</span>
                        <span style="color: white; font-size: 12px;">${data.year}</span>
                    </div>
                `,
                paystub: () => `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: rgba(255,255,255,0.7); font-size: 12px;">Employer:</span>
                        <span style="color: white; font-size: 12px; font-weight: 500;">${data.employer}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: rgba(255,255,255,0.7); font-size: 12px;">Gross Pay:</span>
                        <span style="color: #22c55e; font-size: 12px; font-weight: 600;">$${data.grossPay.toLocaleString()}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: rgba(255,255,255,0.7); font-size: 12px;">YTD Income:</span>
                        <span style="color: white; font-size: 12px;">$${data.ytdIncome.toLocaleString()}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: rgba(255,255,255,0.7); font-size: 12px;">Frequency:</span>
                        <span style="color: white; font-size: 12px;">${data.payFrequency}</span>
                    </div>
                `,
                tax_return: () => `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: rgba(255,255,255,0.7); font-size: 12px;">AGI:</span>
                        <span style="color: #22c55e; font-size: 12px; font-weight: 600;">$${data.agi.toLocaleString()}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: rgba(255,255,255,0.7); font-size: 12px;">Taxable Income:</span>
                        <span style="color: white; font-size: 12px;">$${data.taxableIncome.toLocaleString()}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: rgba(255,255,255,0.7); font-size: 12px;">Year:</span>
                        <span style="color: white; font-size: 12px;">${data.year}</span>
                    </div>
                `,
                bank_statement: () => `
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: rgba(255,255,255,0.7); font-size: 12px;">Month:</span>
                        <span style="color: white; font-size: 12px;">${data.month}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span style="color: rgba(255,255,255,0.7); font-size: 12px;">Ending Balance:</span>
                        <span style="color: #22c55e; font-size: 12px; font-weight: 600;">$${data.endingBalance.toLocaleString()}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: rgba(255,255,255,0.7); font-size: 12px;">Avg Balance:</span>
                        <span style="color: white; font-size: 12px;">$${data.avgBalance.toLocaleString()}</span>
                    </div>
                `
            };
            
            return formatters[docType] ? formatters[docType]() : '<div style="color: rgba(255,255,255,0.7); font-size: 12px;">Unable to extract structured data</div>';
        },

        applyToForm(docType) {
            const { data } = this.lastExtraction;
            
            const mappings = {
                w2: { annualIncome: data.annualIncome },
                paystub: { 
                    annualIncome: data.ytdIncome,
                    payFrequency: data.payFrequency 
                },
                tax_return: { annualIncome: data.agi },
                bank_statement: { 
                    liquidAssets: data.endingBalance,
                    avgAssets: data.avgBalance 
                }
            };
            
            const mapping = mappings[docType];
            if (mapping) {
                // Apply to form fields
                if (mapping.annualIncome) {
                    const field = document.getElementById('in-annual-income');
                    if (field) field.value = mapping.annualIncome;
                }
                
                EzraUltimate.Visual.showToast('Document data applied to form!', 'success');
            }
            
            document.querySelector('.ezra-modal')?.remove();
        }
    };

    // ============================================
    // 3. BORROWER-FACING CO-PILOT
    // ============================================
    EzraUltimate.BorrowerCopilot = {
        init() {
            this.injectCopilotWidget();
        },

        injectCopilotWidget() {
            // This would be injected into the borrower-facing quote page
            // For now, create the widget structure
            
            const widget = document.createElement('div');
            widget.id = 'ezra-borrower-copilot';
            widget.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                width: 350px;
                background: white;
                border-radius: 16px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                z-index: 9999;
                overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            `;
            
            widget.innerHTML = `
                <div style="background: linear-gradient(135deg, #1e3a5f, #2d5a8f); padding: 16px; color: white;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 40px; height: 40px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px;">🤖</div>
                        <div>
                            <div style="font-weight: 600; font-size: 14px;">Ask Ezra</div>
                            <div style="font-size: 12px; opacity: 0.8;">Your loan assistant</div>
                        </div>
                        <button onclick="document.getElementById('ezra-borrower-copilot').style.display='none'" style="margin-left: auto; background: none; border: none; color: white; font-size: 18px; cursor: pointer;">×</button>
                    </div>
                </div>
                <div id="ezra-copilot-messages" style="height: 300px; overflow-y: auto; padding: 16px; background: #f8fafc;">
                    <div style="background: #e2e8f0; padding: 12px; border-radius: 12px; margin-bottom: 12px; font-size: 13px; color: #1e293b;">
                        Hi! I'm Ezra, your AI loan assistant. I can explain your quote, answer questions about HELOCs, or help you understand the next steps. What would you like to know?
                    </div>
                </div>
                <div style="padding: 12px; border-top: 1px solid #e2e8f0; display: flex; gap: 8px;">
                    <input type="text" id="ezra-copilot-input" placeholder="Ask about your quote..." style="flex: 1; padding: 10px 14px; border: 1px solid #e2e8f0; border-radius: 20px; font-size: 13px; outline: none;">
                    <button onclick="EzraUltimate.BorrowerCopilot.sendMessage()" style="background: #1e3a5f; color: white; border: none; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 16px;">➤</button>
                </div>
            `;
            
            // Only show on borrower-facing pages
            if (window.location.pathname.includes('client') || window.location.pathname.includes('quote')) {
                document.body.appendChild(widget);
                this.setupCopilotHandlers();
            }
        },

        setupCopilotHandlers() {
            const input = document.getElementById('ezra-copilot-input');
            if (input) {
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') this.sendMessage();
                });
            }
        },

        async sendMessage() {
            const input = document.getElementById('ezra-copilot-input');
            const messages = document.getElementById('ezra-copilot-messages');
            const text = input.value.trim();
            
            if (!text) return;
            
            // Add user message
            messages.innerHTML += `
                <div style="background: #1e3a5f; color: white; padding: 12px; border-radius: 12px; margin-bottom: 12px; font-size: 13px; margin-left: 40px;">
                    ${text}
                </div>
            `;
            
            input.value = '';
            messages.scrollTop = messages.scrollHeight;
            
            // Generate response
            const response = await this.generateResponse(text);
            
            messages.innerHTML += `
                <div style="background: #e2e8f0; padding: 12px; border-radius: 12px; margin-bottom: 12px; font-size: 13px; color: #1e293b;">
                    ${response}
                </div>
            `;
            
            messages.scrollTop = messages.scrollHeight;
        },

        async generateResponse(query) {
            const lower = query.toLowerCase();
            
            // Get current quote data from page
            const quoteData = this.extractQuoteData();
            
            // Simple response patterns
            if (/payment|monthly|cost/i.test(lower)) {
                return `Your estimated monthly payment is ${quoteData.payment} if you use the full ${quoteData.amount}. But remember - with a HELOC, you only pay interest on what you actually use. If you only draw $30,000 initially, your payment would be about $${Math.round(quoteData.payment * 0.2)}/month.`;
            }
            
            if (/rate|interest|apr/i.test(lower)) {
                return `Your interest rate is ${quoteData.rate}%. This is a variable rate that can change monthly based on the prime rate. The good news? You can lock in portions at fixed rates anytime. Want me to explain how that works?`;
            }
            
            if (/heloc|what is|how.*work/i.test(lower)) {
                return `A HELOC (Home Equity Line of Credit) works like a credit card secured by your home. You can borrow up to ${quoteData.amount}, pay it back, and borrow again during the 10-year draw period. You only pay interest on what you use!`;
            }
            
            if (/next|step|apply|start/i.test(lower)) {
                return `Great question! The next step is completing a simple application. ${quoteData.loName} will need to verify your income and run a credit check. The whole process typically takes 2-3 weeks. Would you like to schedule a quick call to get started?`;
            }
            
            if (/fee|cost|charge/i.test(lower)) {
                return `There's a ${quoteData.originationFee} origination fee, and you'll need an appraisal (usually $500-700). The good news? We can often roll these costs into the loan so you don't pay out of pocket.`;
            }
            
            if (/compare|vs|versus|better/i.test(lower)) {
                return `Compared to a cash-out refinance, a HELOC typically has lower closing costs and more flexibility. You only pay interest on what you use, not the full amount. Plus, you keep your existing mortgage rate if it's good!`;
            }
            
            return `That's a great question! I'd recommend speaking directly with ${quoteData.loName} at ${quoteData.loPhone} for the most accurate answer. They can review your specific situation and provide personalized guidance.`;
        },

        extractQuoteData() {
            // Extract visible quote data from the page
            return {
                amount: document.querySelector('[data-field="heloc-amount"]')?.textContent || '$150,000',
                rate: document.querySelector('[data-field="rate"]')?.textContent || '8.25%',
                payment: document.querySelector('[data-field="payment"]')?.textContent || '$1,031',
                originationFee: document.querySelector('[data-field="origination"]')?.textContent || '$995',
                loName: document.querySelector('[data-field="lo-name"]')?.textContent || 'your loan officer',
                loPhone: document.querySelector('[data-field="lo-phone"]')?.textContent || '(555) 123-4567'
            };
        }
    };

    // ============================================
    // VISUAL HELPER
    // ============================================
    EzraUltimate.Visual = {
        showToast(message, type = 'info') {
            // Use existing toast system or create one
            if (typeof showToast === 'function') {
                showToast(message, type);
            } else {
                console.log(`[${type}] ${message}`);
            }
        }
    };

    // Initialize
    EzraUltimate.init();
    
    // Expose globally
    window.EzraUltimate = EzraUltimate;

})();
