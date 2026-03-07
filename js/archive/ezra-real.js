/**
 * Ezra AI - Real Data Integration
 * 
 * This version of Ezra:
 * 1. Fetches real borrower data from Supabase
 * 2. Performs actual HELOC calculations
 * 3. Auto-fills real form fields
 * 4. Structures deals with actual numbers
 */

(function() {
    'use strict';

    const EzraReal = {
        supabase: null,
        user: null,
        currentQuote: null,
        
        // ============================================
        // INITIALIZATION
        // ============================================
        init() {
            if (!window._supabase) {
                setTimeout(() => this.init(), 500);
                return;
            }
            this.supabase = window._supabase;
            this.checkAuth();
            console.log('Ezra Real: Initialized');
        },

        async checkAuth() {
            const { data: { session } } = await this.supabase.auth.getSession();
            if (session?.user) {
                this.user = session.user;
            }
        },

        // ============================================
        // REAL BORROWER DATA FETCHING
        // ============================================
        async getBorrowers(searchTerm = '') {
            let query = this.supabase
                .from('leads')
                .select('*')
                .eq('user_id', this.user.id)
                .order('created_at', { ascending: false })
                .limit(50);

            if (searchTerm) {
                query = query.or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%`);
            }

            const { data, error } = await query;
            return error ? [] : data;
        },

        async getBorrowerById(id) {
            const { data, error } = await this.supabase
                .from('leads')
                .select('*')
                .eq('id', id)
                .eq('user_id', this.user.id)
                .single();
            return error ? null : data;
        },

        async getBorrowerByName(name) {
            const { data, error } = await this.supabase
                .from('leads')
                .select('*')
                .eq('user_id', this.user.id)
                .ilike('name', `%${name}%`)
                .limit(5);
            return error ? [] : data;
        },

        // ============================================
        // REAL QUOTE CALCULATIONS
        // ============================================
        calculateHELOC(inputs) {
            const {
                propertyValue = 0,
                mortgageBalance = 0,
                desiredHeloc = 0,
                creditScore = 700,
                propertyType = 'primary',
                state = 'CA'
            } = inputs;

            // Max LTV based on credit score and property type
            let maxLTV = 85;
            if (creditScore < 680) maxLTV = 80;
            if (creditScore < 640) maxLTV = 75;
            if (propertyType === 'investment') maxLTV = 75;

            // Calculate max total loans
            const maxTotalLoans = propertyValue * (maxLTV / 100);
            
            // Calculate tappable equity
            const tappableEquity = Math.max(0, maxTotalLoans - mortgageBalance);
            
            // Max HELOC amount
            const maxHeloc = Math.min(tappableEquity, 500000);
            
            // Actual HELOC amount (requested or max available)
            const helocAmount = desiredHeloc > 0 ? Math.min(desiredHeloc, maxHeloc) : maxHeloc;
            
            // Calculate CLTV
            const totalDebt = mortgageBalance + helocAmount;
            const cltv = (totalDebt / propertyValue) * 100;
            
            // Estimate interest rate
            const rate = this.estimateRate(creditScore, cltv, propertyType);
            
            // Calculate payments
            const interestOnlyPayment = (helocAmount * (rate / 100)) / 12;
            
            // Fully amortized payment (20 years)
            const monthlyRate = rate / 100 / 12;
            const numPayments = 20 * 12;
            const fullyAmortizedPayment = helocAmount > 0 ?
                (helocAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
                (Math.pow(1 + monthlyRate, numPayments) - 1) : 0;

            // Origination fee
            const originationFee = helocAmount >= 100000 ? 995 : helocAmount >= 50000 ? 795 : 595;

            // Qualification
            const qualification = this.determineQualification({
                creditScore,
                cltv,
                helocAmount,
                maxLTV
            });

            return {
                propertyValue,
                mortgageBalance,
                helocAmount,
                maxHeloc,
                tappableEquity,
                cltv: Math.round(cltv * 100) / 100,
                maxLTV,
                rate: Math.round(rate * 100) / 100,
                interestOnlyPayment: Math.round(interestOnlyPayment),
                fullyAmortizedPayment: Math.round(fullyAmortizedPayment),
                originationFee,
                qualification,
                drawPeriod: 10,
                repaymentTerm: 20,
                // Strategy based on numbers
                strategy: this.generateStrategy({
                    helocAmount,
                    tappableEquity,
                    cltv,
                    creditScore,
                    rate
                })
            };
        },

        estimateRate(creditScore, cltv, propertyType) {
            let baseRate = 8.5;
            
            // Credit score adjustments
            if (creditScore >= 760) baseRate -= 1.0;
            else if (creditScore >= 740) baseRate -= 0.75;
            else if (creditScore >= 720) baseRate -= 0.5;
            else if (creditScore >= 700) baseRate -= 0.25;
            else if (creditScore < 680) baseRate += 0.5;
            else if (creditScore < 640) baseRate += 1.0;
            
            // CLTV adjustments
            if (cltv <= 70) baseRate -= 0.25;
            else if (cltv > 80) baseRate += 0.5;
            
            // Property type
            if (propertyType === 'investment') baseRate += 0.5;
            
            return Math.round(baseRate * 100) / 100;
        },

        determineQualification(inputs) {
            const { creditScore, cltv, helocAmount, maxLTV } = inputs;
            const issues = [];
            
            if (creditScore < 680) issues.push(`Credit score ${creditScore} below 680 threshold`);
            if (cltv > maxLTV) issues.push(`CLTV ${cltv.toFixed(1)}% exceeds max ${maxLTV}%`);
            if (helocAmount < 25000) issues.push(`HELOC amount below $25,000 minimum`);
            if (creditScore < 640) issues.push(`Credit score below 640 - may need manual review`);
            
            return {
                status: issues.length === 0 ? 'qualified' : issues.length <= 1 ? 'conditional' : 'review_required',
                issues,
                maxLTV
            };
        },

        generateStrategy(inputs) {
            const { helocAmount, tappableEquity, cltv, creditScore, rate } = inputs;
            const strategies = [];
            
            if (helocAmount >= 150000) {
                strategies.push(`Large HELOC (${this.formatCurrency(helocAmount)}) - recommend staged draws to minimize interest`);
            } else if (helocAmount >= 75000) {
                strategies.push(`Mid-size HELOC - good for debt consolidation or home improvements`);
            } else {
                strategies.push(`Conservative HELOC - perfect for emergency fund or small projects`);
            }
            
            if (cltv <= 70) {
                strategies.push(`Strong equity position (${(100-cltv).toFixed(0)}% equity remaining) - room for future needs`);
            }
            
            if (creditScore >= 740) {
                strategies.push(`Tier 1 credit (${creditScore}) - qualifies for best rates at ${rate}%`);
            }
            
            if (tappableEquity > helocAmount * 2) {
                strategies.push(`Additional ${this.formatCurrency(tappableEquity - helocAmount)} equity available for future draws`);
            }
            
            return strategies;
        },

        // ============================================
        // REAL FORM FIELD MAPPING
        // ============================================
        getFormFields() {
            return {
                // Client info
                clientName: document.getElementById('in-client-name'),
                clientCredit: document.getElementById('in-client-credit'),
                
                // Property
                homeValue: document.getElementById('in-home-value'),
                mortgageBalance: document.getElementById('in-mortgage-balance'),
                propertyType: document.getElementById('in-property-type'),
                propertyAddress: document.getElementById('custom-address-input'),
                
                // HELOC
                helocAmount: document.getElementById('in-net-cash'),
                helocRate: document.getElementById('heloc-rate'),
                originationFee: document.getElementById('origination-fee'),
                drawPeriod: document.getElementById('draw-period'),
                repaymentTerm: document.getElementById('repayment-term'),
                
                // LO Info
                loName: document.getElementById('lo-name'),
                loPhone: document.getElementById('lo-phone'),
                loEmail: document.getElementById('lo-email'),
                loCompany: document.getElementById('lo-company'),
                loNmls: document.getElementById('lo-nmls'),
                
                // Output fields
                cltvDisplay: document.getElementById('cltv-display'),
                paymentDisplay: document.getElementById('payment-display'),
                totalCostDisplay: document.getElementById('total-cost-display'),
            };
        },

        applyToForm(quoteData) {
            const fields = this.getFormFields();
            const applied = [];
            
            // Map quote data to form fields
            const mappings = [
                { data: 'propertyValue', field: fields.homeValue },
                { data: 'mortgageBalance', field: fields.mortgageBalance },
                { data: 'helocAmount', field: fields.helocAmount },
                { data: 'rate', field: fields.helocRate },
                { data: 'originationFee', field: fields.originationFee },
                { data: 'drawPeriod', field: fields.drawPeriod },
                { data: 'repaymentTerm', field: fields.repaymentTerm },
            ];
            
            mappings.forEach(({ data, field }) => {
                if (field && quoteData[data] !== undefined) {
                    field.value = quoteData[data];
                    field.dispatchEvent(new Event('change'));
                    field.dispatchEvent(new Event('input'));
                    
                    // Visual feedback
                    field.style.transition = 'background 0.3s';
                    field.style.background = '#dcfce7';
                    setTimeout(() => field.style.background = '', 1000);
                    
                    applied.push(data);
                }
            });
            
            // Trigger calculations
            if (typeof updateCalculations === 'function') {
                updateCalculations();
            }
            if (typeof autoSave === 'function') {
                autoSave();
            }
            
            return applied;
        },

        // ============================================
        // COMMAND PROCESSORS
        // ============================================
        async processCommand(command, params = {}) {
            switch (command) {
                case 'create_quote':
                    return await this.cmdCreateQuote(params);
                    
                case 'structure_deal':
                    return await this.cmdStructureDeal(params);
                    
                case 'analyze_borrower':
                    return await this.cmdAnalyzeBorrower(params);
                    
                case 'find_borrower':
                    return await this.cmdFindBorrower(params);
                    
                case 'calculate_heloc':
                    return this.cmdCalculateHeloc(params);
                    
                case 'compare_scenarios':
                    return this.cmdCompareScenarios(params);
                    
                default:
                    return { error: `Unknown command: ${command}` };
            }
        },

        async cmdCreateQuote(params) {
            const { borrowerName, propertyValue, mortgageBalance, helocAmount, creditScore } = params;
            
            // Try to find borrower if name provided
            let borrower = null;
            if (borrowerName) {
                const borrowers = await this.getBorrowerByName(borrowerName);
                if (borrowers.length === 1) {
                    borrower = borrowers[0];
                }
            }
            
            // Calculate real HELOC
            const quote = this.calculateHELOC({
                propertyValue: parseFloat(propertyValue) || 0,
                mortgageBalance: parseFloat(mortgageBalance) || 0,
                desiredHeloc: parseFloat(helocAmount) || 0,
                creditScore: parseInt(creditScore) || (borrower?.credit_score || 700)
            });
            
            // Store for auto-fill
            this.currentQuote = quote;
            
            return {
                success: true,
                quote,
                borrower: borrower ? {
                    id: borrower.id,
                    name: borrower.name,
                    email: borrower.email,
                    phone: borrower.phone
                } : null,
                message: this.formatQuoteResponse(quote, borrower)
            };
        },

        async cmdStructureDeal(params) {
            const { propertyValue, mortgageBalance, creditScore, goals } = params;
            
            // Calculate multiple scenarios
            const scenarios = [];
            
            // Scenario 1: Conservative (70% CLTV)
            const conservativeAmount = Math.max(0, (propertyValue * 0.70) - mortgageBalance);
            if (conservativeAmount >= 25000) {
                scenarios.push({
                    name: 'Conservative',
                    ...this.calculateHELOC({
                        propertyValue,
                        mortgageBalance,
                        desiredHeloc: conservativeAmount,
                        creditScore
                    }),
                    riskLevel: 'low',
                    description: 'Lower CLTV for better rates and future flexibility'
                });
            }
            
            // Scenario 2: Standard (80% CLTV)
            const standardAmount = Math.max(0, (propertyValue * 0.80) - mortgageBalance);
            if (standardAmount >= 25000) {
                scenarios.push({
                    name: 'Standard',
                    ...this.calculateHELOC({
                        propertyValue,
                        mortgageBalance,
                        desiredHeloc: standardAmount,
                        creditScore
                    }),
                    riskLevel: 'medium',
                    description: 'Balanced approach - good rate with meaningful equity access'
                });
            }
            
            // Scenario 3: Maximum (85% CLTV)
            const maxAmount = Math.max(0, (propertyValue * 0.85) - mortgageBalance);
            if (maxAmount >= 25000 && creditScore >= 680) {
                scenarios.push({
                    name: 'Maximum',
                    ...this.calculateHELOC({
                        propertyValue,
                        mortgageBalance,
                        desiredHeloc: maxAmount,
                        creditScore
                    }),
                    riskLevel: 'higher',
                    description: 'Maximum equity access - monitor CLTV closely'
                });
            }
            
            // Recommend best scenario based on goals
            let recommendation = scenarios[0];
            if (goals?.includes('emergency') || goals?.includes('conservative')) {
                recommendation = scenarios.find(s => s.riskLevel === 'low') || scenarios[0];
            } else if (goals?.includes('maximum') || goals?.includes('debt')) {
                recommendation = scenarios[scenarios.length - 1];
            }
            
            return {
                success: true,
                scenarios,
                recommendation,
                message: this.formatDealStructureResponse(scenarios, recommendation, goals)
            };
        },

        async cmdAnalyzeBorrower(params) {
            const { borrowerId, borrowerName } = params;
            
            let borrower;
            if (borrowerId) {
                borrower = await this.getBorrowerById(borrowerId);
            } else if (borrowerName) {
                const borrowers = await this.getBorrowerByName(borrowerName);
                borrower = borrowers[0];
            }
            
            if (!borrower) {
                return { error: 'Borrower not found' };
            }
            
            // Analyze based on available data
            const analysis = {
                borrower: {
                    name: borrower.name,
                    creditScore: borrower.credit_score,
                    email: borrower.email,
                    phone: borrower.phone,
                    source: borrower.source,
                    status: borrower.status,
                    createdAt: borrower.created_at
                },
                opportunities: [],
                recommendations: []
            };
            
            // If we have property data, calculate opportunities
            if (borrower.property_value) {
                const helocOpportunity = this.calculateHELOC({
                    propertyValue: borrower.property_value,
                    mortgageBalance: borrower.mortgage_balance || 0,
                    creditScore: borrower.credit_score || 700
                });
                
                if (helocOpportunity.tappableEquity >= 50000) {
                    analysis.opportunities.push({
                        type: 'HELOC',
                        tappableEquity: helocOpportunity.tappableEquity,
                        maxHeloc: helocOpportunity.maxHeloc,
                        estimatedRate: helocOpportunity.rate,
                        confidence: borrower.credit_score >= 700 ? 'high' : 'medium'
                    });
                }
            }
            
            // Recommendations based on data
            if (!borrower.credit_score) {
                analysis.recommendations.push('Get credit score to provide accurate quote');
            }
            if (!borrower.property_value) {
                analysis.recommendations.push('Collect property value and mortgage balance');
            }
            if (borrower.status === 'new') {
                analysis.recommendations.push('New lead - prioritize follow-up within 24 hours');
            }
            
            return {
                success: true,
                analysis,
                message: this.formatBorrowerAnalysisResponse(analysis)
            };
        },

        async cmdFindBorrower(params) {
            const { searchTerm } = params;
            const borrowers = await this.getBorrowers(searchTerm);
            
            return {
                success: true,
                count: borrowers.length,
                borrowers: borrowers.map(b => ({
                    id: b.id,
                    name: b.name,
                    email: b.email,
                    phone: b.phone,
                    creditScore: b.credit_score,
                    status: b.status,
                    createdAt: b.created_at
                })),
                message: borrowers.length > 0 
                    ? `Found ${borrowers.length} borrower(s) matching "${searchTerm}"`
                    : `No borrowers found matching "${searchTerm}"`
            };
        },

        cmdCalculateHeloc(params) {
            const quote = this.calculateHELOC(params);
            return {
                success: true,
                quote,
                message: this.formatCalculationResponse(quote)
            };
        },

        cmdCompareScenarios(params) {
            const { baseParams, variations } = params;
            const scenarios = variations.map(v => ({
                name: v.name,
                ...this.calculateHELOC({ ...baseParams, ...v.params })
            }));
            
            return {
                success: true,
                scenarios,
                message: this.formatComparisonResponse(scenarios)
            };
        },

        // ============================================
        // RESPONSE FORMATTERS
        // ============================================
        formatQuoteResponse(quote, borrower) {
            const lines = [];
            
            lines.push(`## HELOC Quote${borrower ? ` for ${borrower.name}` : ''}`);
            lines.push('');
            lines.push(`**Loan Amount:** ${this.formatCurrency(quote.helocAmount)}`);
            lines.push(`**Interest Rate:** ${quote.rate}%`);
            lines.push(`**Origination Fee:** ${this.formatCurrency(quote.originationFee)}`);
            lines.push('');
            lines.push(`**Property Value:** ${this.formatCurrency(quote.propertyValue)}`);
            lines.push(`**Current Mortgage:** ${this.formatCurrency(quote.mortgageBalance)}`);
            lines.push(`**Combined LTV:** ${quote.cltv}%`);
            lines.push(`**Tappable Equity:** ${this.formatCurrency(quote.tappableEquity)}`);
            lines.push('');
            lines.push(`**Interest-Only Payment:** ${this.formatCurrency(quote.interestOnlyPayment)}/month`);
            lines.push(`**Fully Amortized:** ${this.formatCurrency(quote.fullyAmortizedPayment)}/month`);
            lines.push('');
            lines.push(`**Qualification:** ${quote.qualification.status.toUpperCase()}`);
            if (quote.qualification.issues.length > 0) {
                lines.push(`*Considerations: ${quote.qualification.issues.join(', ')}*`);
            }
            lines.push('');
            lines.push('**Strategy:**');
            quote.strategy.forEach(s => lines.push(`• ${s}`));
            
            return lines.join('\n');
        },

        formatDealStructureResponse(scenarios, recommendation, goals) {
            const lines = [];
            
            lines.push('## Deal Structure Analysis');
            lines.push('');
            lines.push(`**Recommended:** ${recommendation.name} Scenario`);
            lines.push(`• HELOC Amount: ${this.formatCurrency(recommendation.helocAmount)}`);
            lines.push(`• Rate: ${recommendation.rate}%`);
            lines.push(`• CLTV: ${recommendation.cltv}%`);
            lines.push(`• Payment: ${this.formatCurrency(recommendation.interestOnlyPayment)}/mo`);
            lines.push('');
            lines.push('**All Scenarios:**');
            scenarios.forEach(s => {
                const marker = s.name === recommendation.name ? '✓ ' : '  ';
                lines.push(`${marker}${s.name}: ${this.formatCurrency(s.helocAmount)} at ${s.rate}% (${s.riskLevel} risk)`);
            });
            
            return lines.join('\n');
        },

        formatBorrowerAnalysisResponse(analysis) {
            const lines = [];
            
            lines.push(`## Borrower Analysis: ${analysis.borrower.name}`);
            lines.push('');
            lines.push(`**Credit Score:** ${analysis.borrower.creditScore || 'Unknown'}`);
            lines.push(`**Status:** ${analysis.borrower.status}`);
            lines.push(`**Source:** ${analysis.borrower.source || 'Unknown'}`);
            lines.push('');
            
            if (analysis.opportunities.length > 0) {
                lines.push('**Opportunities:**');
                analysis.opportunities.forEach(opp => {
                    lines.push(`• ${opp.type}: ${this.formatCurrency(opp.tappableEquity)} available`);
                    lines.push(`  Est. Rate: ${opp.estimatedRate}% (${opp.confidence} confidence)`);
                });
                lines.push('');
            }
            
            if (analysis.recommendations.length > 0) {
                lines.push('**Next Steps:**');
                analysis.recommendations.forEach(r => lines.push(`• ${r}`));
            }
            
            return lines.join('\n');
        },

        formatCalculationResponse(quote) {
            return `**HELOC Calculation Results**

• Max HELOC: ${this.formatCurrency(quote.maxHeloc)}
• At ${quote.cltv}% CLTV (max ${quote.maxLTV}%)
• Est. Rate: ${quote.rate}%
• Interest-Only: ${this.formatCurrency(quote.interestOnlyPayment)}/month`;
        },

        formatComparisonResponse(scenarios) {
            const lines = ['**Scenario Comparison**', ''];
            scenarios.forEach(s => {
                lines.push(`${s.name}:`);
                lines.push(`  Amount: ${this.formatCurrency(s.helocAmount)}`);
                lines.push(`  Rate: ${s.rate}% | Payment: ${this.formatCurrency(s.interestOnlyPayment)}/mo`);
                lines.push('');
            });
            return lines.join('\n');
        },

        // ============================================
        // UTILITIES
        // ============================================
        formatCurrency(amount) {
            if (!amount || amount === 0) return '$0';
            return '$' + amount.toLocaleString('en-US');
        },

        parseCommand(message) {
            const lower = message.toLowerCase();
            
            // Create quote command
            if (/create (a )?quote|build (a )?quote|new quote/i.test(message)) {
                const params = {};
                
                // Extract borrower name
                const nameMatch = message.match(/(?:for|borrower|client)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
                if (nameMatch) params.borrowerName = nameMatch[1];
                
                // Extract amounts
                const amountMatches = message.matchAll(/\$?(\d+(?:,\d{3})*(?:\.\d+)?)\s*(k|m)?/gi);
                const amounts = [];
                for (const match of amountMatches) {
                    let val = parseFloat(match[1].replace(/,/g, ''));
                    if (match[2]?.toLowerCase() === 'k') val *= 1000;
                    if (match[2]?.toLowerCase() === 'm') val *= 1000000;
                    amounts.push(val);
                }
                
                if (amounts.length >= 1) params.propertyValue = amounts[0];
                if (amounts.length >= 2) params.mortgageBalance = amounts[1];
                if (amounts.length >= 3) params.helocAmount = amounts[2];
                
                // Extract credit score
                const creditMatch = message.match(/(?:credit|fico|score)\s*(?:of|is)?\s*:?\s*(\d{3})/i);
                if (creditMatch) params.creditScore = parseInt(creditMatch[1]);
                
                return { command: 'create_quote', params };
            }
            
            // Structure deal command
            if (/structure|analyze deal|deal structure/i.test(message)) {
                const params = {};
                const amounts = message.match(/\$?(\d+(?:,\d{3})*)/g);
                if (amounts) {
                    params.propertyValue = parseFloat(amounts[0].replace(/,/g, ''));
                    if (amounts[1]) params.mortgageBalance = parseFloat(amounts[1].replace(/,/g, ''));
                }
                const creditMatch = message.match(/(\d{3})/);
                if (creditMatch) params.creditScore = parseInt(creditMatch[1]);
                
                return { command: 'structure_deal', params };
            }
            
            // Find borrower command
            if (/find|search|lookup.*borrower|who is/i.test(message)) {
                const nameMatch = message.match(/(?:find|search|lookup|who is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
                return { 
                    command: 'find_borrower', 
                    params: { searchTerm: nameMatch ? nameMatch[1] : message }
                };
            }
            
            // Analyze borrower command
            if (/analyze.*borrower|borrower.*analysis|tell me about/i.test(message)) {
                const nameMatch = message.match(/(?:analyze|tell me about)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
                return { 
                    command: 'analyze_borrower', 
                    params: { borrowerName: nameMatch ? nameMatch[1] : '' }
                };
            }
            
            // Calculate command
            if (/calculate|compute|what.*payment|how much/i.test(message)) {
                const params = {};
                const amounts = message.match(/\$?(\d+(?:,\d{3})*)/g);
                if (amounts) {
                    params.propertyValue = parseFloat(amounts[0].replace(/,/g, ''));
                    if (amounts[1]) params.mortgageBalance = parseFloat(amounts[1].replace(/,/g, ''));
                    if (amounts[2]) params.desiredHeloc = parseFloat(amounts[2].replace(/,/g, ''));
                }
                return { command: 'calculate_heloc', params };
            }
            
            return null;
        }
    };

    // Initialize
    EzraReal.init();

    // Expose globally
    window.EzraReal = EzraReal;

})();
