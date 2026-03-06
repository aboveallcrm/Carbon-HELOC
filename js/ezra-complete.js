/**
 * EZRA AI - Complete Intelligence System
 * 
 * Features:
 * - Real-time quote guardian
 * - Voice control
 * - Smart follow-ups
 * - Deal scoring
 * - Visual overlay
 * - Competitive intelligence
 * - Emotional intelligence
 * - Vision/document analysis
 * - Workflow automation
 * - Learning engine
 */

(function() {
    'use strict';

    // ============================================
    // EZRA CORE SYSTEM
    // ============================================
    const Ezra = {
        version: '2.0.0',
        supabase: null,
        user: null,
        currentQuote: null,
        settings: {},
        learning: {
            patterns: {},
            preferences: {},
            history: []
        },
        
        // Initialize all modules
        async init() {
            if (!window._supabase) {
                setTimeout(() => this.init(), 500);
                return;
            }
            
            this.supabase = window._supabase;
            await this.checkAuth();
            await this.loadSettings();
            await this.loadLearningData();
            
            // Initialize all modules
            this.QuoteGuardian.init();
            this.VoiceControl.init();
            this.VisualOverlay.init();
            this.FollowUpEngine.init();
            this.WorkflowAutomation.init();
            
            console.log('🤖 Ezra AI v2.0 - Fully Activated');
            this.showWelcomeMessage();
        },

        async checkAuth() {
            const { data: { session } } = await this.supabase.auth.getSession();
            if (session?.user) {
                this.user = session.user;
            }
        },

        async loadSettings() {
            const { data } = await this.supabase
                .from('ezra_user_preferences')
                .select('*')
                .eq('loan_officer_id', this.user?.id)
                .single();
            
            if (data) {
                this.settings = data;
            }
        },

        async loadLearningData() {
            // Load user's historical patterns
            const { data: deals } = await this.supabase
                .from('quotes')
                .select('*')
                .eq('user_id', this.user?.id)
                .order('created_at', { ascending: false })
                .limit(100);
            
            if (deals) {
                this.learning.history = deals;
                this.analyzePatterns(deals);
            }
        },

        analyzePatterns(deals) {
            const closed = deals.filter(d => d.status === 'closed');
            
            this.learning.patterns = {
                avgCloseTime: this.calculateAvgCloseTime(closed),
                bestFollowUpTiming: this.findBestFollowUpTiming(closed),
                optimalScenarios: this.findOptimalScenarios(closed),
                commonObjections: this.findCommonObjections(deals),
                successFactors: this.identifySuccessFactors(closed)
            };
        },

        showWelcomeMessage() {
            const hour = new Date().getHours();
            let greeting = 'Good morning';
            if (hour >= 12) greeting = 'Good afternoon';
            if (hour >= 17) greeting = 'Good evening';
            
            const patterns = this.learning.patterns;
            let insight = '';
            
            if (patterns.avgCloseTime) {
                insight = ` Your average close time is ${patterns.avgCloseTime} days.`;
            }
            
            this.VisualOverlay.showNotification({
                title: `${greeting}! 🤖`,
                message: `Ezra is ready to help you close more deals.${insight}`,
                type: 'info',
                duration: 5000
            });
        }
    };

    // ============================================
    // 1. QUOTE GUARDIAN - Real-time Context Awareness
    // ============================================
    Ezra.QuoteGuardian = {
        isActive: true,
        lastAnalysis: null,
        confidenceScore: 100,
        
        init() {
            this.attachWatchers();
            this.createConfidenceMeter();
            this.createSuggestionPanel();
        },

        attachWatchers() {
            const criticalFields = [
                'in-home-value',
                'in-mortgage-balance', 
                'in-net-cash',
                'in-client-credit',
                'in-client-name'
            ];
            
            criticalFields.forEach(id => {
                const field = document.getElementById(id);
                if (field) {
                    field.addEventListener('change', () => this.analyzeQuote());
                    field.addEventListener('blur', () => this.analyzeQuote());
                }
            });
            
            // Watch for calculation updates
            const observer = new MutationObserver(() => {
                this.analyzeQuote();
            });
            
            const cltvDisplay = document.getElementById('cltv-display');
            if (cltvDisplay) {
                observer.observe(cltvDisplay, { childList: true, subtree: true });
            }
        },

        createConfidenceMeter() {
            const meter = document.createElement('div');
            meter.id = 'ezra-confidence-meter';
            meter.innerHTML = `
                <div class="ezra-meter-container">
                    <div class="ezra-meter-label">Deal Confidence</div>
                    <div class="ezra-meter-bar">
                        <div class="ezra-meter-fill" style="width: 100%"></div>
                    </div>
                    <div class="ezra-meter-score">100%</div>
                    <div class="ezra-meter-factors"></div>
                </div>
            `;
            
            // Insert near quote summary
            const summary = document.getElementById('quote-summary') || document.querySelector('.quote-container');
            if (summary) {
                summary.insertBefore(meter, summary.firstChild);
            }
            
            this.addMeterStyles();
        },

        addMeterStyles() {
            if (document.getElementById('ezra-meter-styles')) return;
            
            const styles = document.createElement('style');
            styles.id = 'ezra-meter-styles';
            styles.textContent = `
                #ezra-confidence-meter {
                    background: linear-gradient(135deg, rgba(30,58,95,0.9), rgba(45,90,143,0.9));
                    border-radius: 12px;
                    padding: 16px 20px;
                    margin-bottom: 20px;
                    border: 1px solid rgba(212,175,55,0.3);
                }
                
                .ezra-meter-container {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }
                
                .ezra-meter-label {
                    color: #d4af37;
                    font-weight: 600;
                    font-size: 13px;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                
                .ezra-meter-bar {
                    height: 8px;
                    background: rgba(0,0,0,0.3);
                    border-radius: 4px;
                    overflow: hidden;
                }
                
                .ezra-meter-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #22c55e, #eab308, #ef4444);
                    border-radius: 4px;
                    transition: width 0.5s ease, background 0.3s ease;
                }
                
                .ezra-meter-fill.high { background: #22c55e; }
                .ezra-meter-fill.medium { background: #eab308; }
                .ezra-meter-fill.low { background: #ef4444; }
                
                .ezra-meter-score {
                    font-size: 24px;
                    font-weight: 700;
                    color: white;
                }
                
                .ezra-meter-factors {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                }
                
                .ezra-factor {
                    font-size: 11px;
                    padding: 4px 10px;
                    border-radius: 12px;
                    background: rgba(255,255,255,0.1);
                    color: rgba(255,255,255,0.8);
                }
                
                .ezra-factor.positive { background: rgba(34,197,94,0.2); color: #86efac; }
                .ezra-factor.warning { background: rgba(234,179,8,0.2); color: #fde047; }
                .ezra-factor.negative { background: rgba(239,68,68,0.2); color: #fca5a5; }
            `;
            document.head.appendChild(styles);
        },

        createSuggestionPanel() {
            const panel = document.createElement('div');
            panel.id = 'ezra-suggestion-panel';
            panel.style.cssText = `
                position: fixed;
                right: 20px;
                top: 100px;
                width: 320px;
                max-height: 400px;
                overflow-y: auto;
                background: rgba(15,23,42,0.95);
                border: 1px solid rgba(212,175,55,0.3);
                border-radius: 12px;
                padding: 16px;
                z-index: 9998;
                display: none;
            `;
            document.body.appendChild(panel);
        },

        analyzeQuote() {
            const quote = this.gatherQuoteData();
            if (!quote.propertyValue) return;
            
            const analysis = this.calculateConfidence(quote);
            this.updateConfidenceMeter(analysis);
            this.generateSuggestions(quote, analysis);
            
            this.lastAnalysis = { quote, analysis, timestamp: Date.now() };
        },

        gatherQuoteData() {
            return {
                propertyValue: parseFloat(document.getElementById('in-home-value')?.value) || 0,
                mortgageBalance: parseFloat(document.getElementById('in-mortgage-balance')?.value) || 0,
                helocAmount: parseFloat(document.getElementById('in-net-cash')?.value) || 0,
                creditScore: parseInt(document.getElementById('in-client-credit')?.value) || 0,
                clientName: document.getElementById('in-client-name')?.value || '',
                cltv: parseFloat(document.getElementById('cltv-display')?.textContent) || 0
            };
        },

        calculateConfidence(quote) {
            let score = 100;
            const factors = [];
            const warnings = [];
            const positives = [];
            
            // CLTV Analysis
            if (quote.cltv > 85) {
                score -= 25;
                factors.push({ type: 'negative', text: `CLTV ${quote.cltv.toFixed(1)}% exceeds 85% limit` });
            } else if (quote.cltv > 80) {
                score -= 15;
                factors.push({ type: 'warning', text: `CLTV ${quote.cltv.toFixed(1)}% near limit` });
                warnings.push({
                    priority: 'high',
                    message: `You're at ${quote.cltv.toFixed(1)}% CLTV. Reducing HELOC by $${Math.round((quote.cltv - 80) * quote.propertyValue / 100).toLocaleString()} would improve pricing.`,
                    action: () => this.adjustHeloc(quote.helocAmount - ((quote.cltv - 80) * quote.propertyValue / 100))
                });
            } else if (quote.cltv < 70) {
                score += 10;
                factors.push({ type: 'positive', text: 'Strong equity position' });
                positives.push('Excellent equity position - room for future needs');
            }
            
            // Credit Score Analysis
            if (quote.creditScore >= 740) {
                score += 15;
                factors.push({ type: 'positive', text: `Tier 1 credit (${quote.creditScore})` });
                positives.push(`740+ credit qualifies for best rates`);
            } else if (quote.creditScore >= 720) {
                score += 10;
                factors.push({ type: 'positive', text: `Strong credit (${quote.creditScore})` });
            } else if (quote.creditScore < 680) {
                score -= 20;
                factors.push({ type: 'negative', text: `Below-prime credit (${quote.creditScore})` });
                warnings.push({
                    priority: 'medium',
                    message: `Credit score ${quote.creditScore} may require manual review or higher rates.`,
                    action: null
                });
            }
            
            // Loan Amount Analysis
            if (quote.helocAmount < 25000) {
                score -= 10;
                factors.push({ type: 'warning', text: 'Below minimum loan amount' });
            } else if (quote.helocAmount > 400000) {
                score -= 5;
                factors.push({ type: 'warning', text: 'Jumbo loan - additional scrutiny' });
            }
            
            // Completeness
            if (!quote.clientName) {
                score -= 5;
                factors.push({ type: 'warning', text: 'Missing borrower name' });
            }
            
            // Historical pattern matching
            if (Ezra.learning.patterns.successFactors) {
                const match = this.matchSuccessFactors(quote);
                if (match.score > 0.8) {
                    score += 10;
                    factors.push({ type: 'positive', text: 'Matches your winning profile' });
                }
            }
            
            return {
                score: Math.max(0, Math.min(100, score)),
                factors,
                warnings,
                positives,
                tier: score >= 80 ? 'strong' : score >= 60 ? 'conditional' : 'review',
                recommendation: this.generateRecommendation(score, quote)
            };
        },

        matchSuccessFactors(quote) {
            // Compare against historical closed deals
            const closed = Ezra.learning.history.filter(d => d.status === 'closed');
            if (!closed.length) return { score: 0 };
            
            let matches = 0;
            let total = 0;
            
            closed.forEach(deal => {
                const data = deal.quote_data || {};
                if (Math.abs(data.combined_ltv - quote.cltv) < 5) matches++;
                if (Math.abs(data.credit_score - quote.creditScore) < 20) matches++;
                total += 2;
            });
            
            return { score: matches / total };
        },

        generateRecommendation(score, quote) {
            if (score >= 90) return 'Strong deal - proceed with confidence';
            if (score >= 80) return 'Good deal - standard processing';
            if (score >= 60) return 'Conditional - review factors below';
            return 'Needs work - address issues before submitting';
        },

        updateConfidenceMeter(analysis) {
            const fill = document.querySelector('.ezra-meter-fill');
            const score = document.querySelector('.ezra-meter-score');
            const factors = document.querySelector('.ezra-meter-factors');
            
            if (fill) {
                fill.style.width = `${analysis.score}%`;
                fill.className = 'ezra-meter-fill ' + (analysis.score >= 80 ? 'high' : analysis.score >= 60 ? 'medium' : 'low');
            }
            
            if (score) {
                score.textContent = `${analysis.score}%`;
                score.style.color = analysis.score >= 80 ? '#86efac' : analysis.score >= 60 ? '#fde047' : '#fca5a5';
            }
            
            if (factors) {
                factors.innerHTML = analysis.factors.map(f => 
                    `<span class="ezra-factor ${f.type}">${f.text}</span>`
                ).join('');
            }
        },

        generateSuggestions(quote, analysis) {
            const panel = document.getElementById('ezra-suggestion-panel');
            if (!panel || analysis.warnings.length === 0) {
                if (panel) panel.style.display = 'none';
                return;
            }
            
            panel.innerHTML = `
                <div style="color: #d4af37; font-weight: 600; margin-bottom: 12px; font-size: 13px;">
                    ⚡ EZRA SUGGESTIONS
                </div>
                ${analysis.warnings.map(w => `
                    <div style="background: rgba(234,179,8,0.1); border-left: 3px solid #eab308; padding: 12px; margin-bottom: 10px; border-radius: 0 8px 8px 0;">
                        <div style="color: white; font-size: 12px; margin-bottom: 8px;">${w.message}</div>
                        ${w.action ? `<button onclick="Ezra.QuoteGuardian.executeSuggestion(${w.action.toString()})" style="background: #eab308; color: #0f172a; border: none; padding: 6px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">Apply Fix</button>` : ''}
                    </div>
                `).join('')}
            `;
            
            panel.style.display = 'block';
        },

        adjustHeloc(newAmount) {
            const field = document.getElementById('in-net-cash');
            if (field) {
                field.value = Math.round(newAmount);
                field.dispatchEvent(new Event('change'));
                this.analyzeQuote();
            }
        },

        executeSuggestion(action) {
            if (typeof action === 'function') {
                action();
            }
        }
    };

    // ============================================
    // 2. VOICE CONTROL SYSTEM
    // ============================================
    Ezra.VoiceControl = {
        recognition: null,
        isListening: false,
        commands: {},
        
        init() {
            if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                this.setupRecognition();
                this.createVoiceButton();
            }
        },

        setupRecognition() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';
            
            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                this.processCommand(transcript);
            };
            
            this.recognition.onerror = (event) => {
                console.error('Voice recognition error:', event.error);
                this.showFeedback('Error: ' + event.error, 'error');
            };
            
            this.recognition.onend = () => {
                this.isListening = false;
                this.updateButtonState();
            };
            
            this.registerCommands();
        },

        registerCommands() {
            this.commands = {
                'create quote': this.cmdCreateQuote.bind(this),
                'build quote': this.cmdCreateQuote.bind(this),
                'make quote': this.cmdCreateQuote.bind(this),
                'new quote': this.cmdCreateQuote.bind(this),
                
                'update': this.cmdUpdateSetting.bind(this),
                'set': this.cmdUpdateSetting.bind(this),
                'change': this.cmdUpdateSetting.bind(this),
                
                'send': this.cmdSendQuote.bind(this),
                'email': this.cmdSendQuote.bind(this),
                'text': this.cmdSendQuote.bind(this),
                
                'calculate': this.cmdCalculate.bind(this),
                'what is': this.cmdCalculate.bind(this),
                
                'find': this.cmdFindBorrower.bind(this),
                'search': this.cmdFindBorrower.bind(this),
                'lookup': this.cmdFindBorrower.bind(this),
                
                'analyze': this.cmdAnalyze.bind(this),
                'structure': this.cmdAnalyze.bind(this),
                
                'save': this.cmdSave.bind(this),
                'clear': this.cmdClear.bind(this),
                'reset': this.cmdClear.bind(this)
            };
        },

        createVoiceButton() {
            const btn = document.createElement('button');
            btn.id = 'ezra-voice-btn';
            btn.innerHTML = '🎤';
            btn.style.cssText = `
                position: fixed;
                bottom: 100px;
                right: 24px;
                width: 56px;
                height: 56px;
                border-radius: 50%;
                background: linear-gradient(135deg, #1e3a5f, #2d5a8f);
                border: 2px solid #d4af37;
                color: white;
                font-size: 24px;
                cursor: pointer;
                z-index: 9999;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                transition: all 0.3s;
            `;
            
            btn.addEventListener('click', () => this.toggleListening());
            document.body.appendChild(btn);
            
            // Add tooltip
            const tooltip = document.createElement('div');
            tooltip.id = 'ezra-voice-tooltip';
            tooltip.textContent = 'Click and speak: "Create quote for John Smith 500k house"';
            tooltip.style.cssText = `
                position: fixed;
                bottom: 165px;
                right: 24px;
                background: rgba(15,23,42,0.95);
                color: white;
                padding: 8px 12px;
                border-radius: 8px;
                font-size: 12px;
                max-width: 250px;
                z-index: 9999;
                border: 1px solid rgba(212,175,55,0.3);
            `;
            document.body.appendChild(tooltip);
            
            // Hide tooltip after 5 seconds
            setTimeout(() => tooltip.style.display = 'none', 5000);
        },

        toggleListening() {
            if (this.isListening) {
                this.recognition.stop();
            } else {
                this.recognition.start();
                this.isListening = true;
                this.showFeedback('Listening...', 'info');
            }
            this.updateButtonState();
        },

        updateButtonState() {
            const btn = document.getElementById('ezra-voice-btn');
            if (btn) {
                btn.style.background = this.isListening 
                    ? 'linear-gradient(135deg, #ef4444, #dc2626)' 
                    : 'linear-gradient(135deg, #1e3a5f, #2d5a8f)';
                btn.style.animation = this.isListening ? 'pulse 1s infinite' : 'none';
            }
        },

        processCommand(transcript) {
            this.showFeedback(`Heard: "${transcript}"`, 'success');
            
            const lower = transcript.toLowerCase();
            
            // Find matching command
            for (const [phrase, handler] of Object.entries(this.commands)) {
                if (lower.includes(phrase)) {
                    handler(transcript);
                    return;
                }
            }
            
            // Try intelligent parsing
            this.intelligentParse(transcript);
        },

        intelligentParse(transcript) {
            // Extract numbers
            const numbers = transcript.match(/\d+/g)?.map(n => parseInt(n)) || [];
            
            // Extract names
            const nameMatch = transcript.match(/(?:for|name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
            
            // If we have numbers, try to build a quote
            if (numbers.length >= 2) {
                Ezra.VisualOverlay.showNotification({
                    title: 'Voice Command Detected',
                    message: `Create quote for ${nameMatch ? nameMatch[1] : 'client'} with values: ${numbers.join(', ')}?`,
                    type: 'info',
                    actions: [
                        { label: 'Yes', action: () => this.cmdCreateQuote(transcript) },
                        { label: 'No', action: () => {} }
                    ]
                });
            }
        },

        // Command Handlers
        cmdCreateQuote(transcript) {
            // Parse: "Create quote for John Smith, 500k house, 200k mortgage, 100k cash out"
            const params = this.parseQuoteParams(transcript);
            
            if (Ezra.QuoteBuilder) {
                Ezra.QuoteBuilder.create(params);
            }
            
            this.showFeedback('Creating quote...', 'success');
        },

        parseQuoteParams(transcript) {
            const params = {};
            
            // Extract name
            const nameMatch = transcript.match(/(?:for|name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
            if (nameMatch) params.name = nameMatch[1];
            
            // Extract amounts (handle k/m suffixes)
            const amountMatches = transcript.matchAll(/(\d+(?:\.\d+)?)\s*(k|m|thousand|million)?/gi);
            const amounts = [];
            for (const match of amountMatches) {
                let val = parseFloat(match[1]);
                const suffix = match[2]?.toLowerCase();
                if (suffix === 'k' || suffix === 'thousand') val *= 1000;
                if (suffix === 'm' || suffix === 'million') val *= 1000000;
                amounts.push(val);
            }
            
            if (amounts[0]) params.propertyValue = amounts[0];
            if (amounts[1]) params.mortgageBalance = amounts[1];
            if (amounts[2]) params.helocAmount = amounts[2];
            
            // Extract credit score
            const creditMatch = transcript.match(/(?:credit|fico|score)\s*(?:of|is)?\s*:?\s*(\d{3})/i);
            if (creditMatch) params.creditScore = parseInt(creditMatch[1]);
            
            return params;
        },

        cmdUpdateSetting(transcript) {
            // Parse: "Set default origination fee to 995" or "Change tier to Obsidian"
            const settingMatch = transcript.match(/(?:set|change|update)\s+(\w+(?:\s+\w+)*)\s+(?:to|as)\s+(.+)/i);
            
            if (settingMatch) {
                const [, setting, value] = settingMatch;
                
                if (Ezra.Settings) {
                    Ezra.Settings.update(setting.trim(), value.trim());
                }
                
                this.showFeedback(`Updating ${setting}...`, 'success');
            }
        },

        cmdSendQuote(transcript) {
            const method = transcript.includes('text') ? 'sms' : 'email';
            
            Ezra.VisualOverlay.showNotification({
                title: 'Send Quote',
                message: `Send via ${method}?`,
                type: 'info',
                actions: [
                    { label: 'Send', action: () => console.log('Sending...') },
                    { label: 'Cancel', action: () => {} }
                ]
            });
        },

        cmdCalculate(transcript) {
            // Parse calculation request
            const params = this.parseQuoteParams(transcript);
            
            if (Ezra.Calculator) {
                const result = Ezra.Calculator.calculate(params);
                this.showFeedback(`Payment: $${result.payment}/month`, 'success');
            }
        },

        cmdFindBorrower(transcript) {
            const nameMatch = transcript.match(/(?:find|search|lookup)\s+(?:for\s+)?(.+)/i);
            if (nameMatch) {
                const searchTerm = nameMatch[1].trim();
                
                if (Ezra.BorrowerSearch) {
                    Ezra.BorrowerSearch.search(searchTerm);
                }
                
                this.showFeedback(`Searching for "${searchTerm}"...`, 'info');
            }
        },

        cmdAnalyze(transcript) {
            this.showFeedback('Analyzing deal...', 'info');
            
            if (Ezra.QuoteGuardian.lastAnalysis) {
                const analysis = Ezra.QuoteGuardian.lastAnalysis.analysis;
                Ezra.VisualOverlay.showNotification({
                    title: 'Deal Analysis',
                    message: `Confidence: ${analysis.score}%. ${analysis.recommendation}`,
                    type: analysis.score >= 80 ? 'success' : 'warning'
                });
            }
        },

        cmdSave() {
            if (typeof autoSave === 'function') {
                autoSave();
                this.showFeedback('Quote saved!', 'success');
            }
        },

        cmdClear() {
            Ezra.VisualOverlay.showNotification({
                title: 'Clear Form?',
                message: 'This will reset all fields.',
                type: 'warning',
                actions: [
                    { 
                        label: 'Clear', 
                        action: () => {
                            document.querySelectorAll('input').forEach(i => i.value = '');
                            this.showFeedback('Form cleared', 'success');
                        }
                    },
                    { label: 'Cancel', action: () => {} }
                ]
            });
        },

        showFeedback(message, type) {
            Ezra.VisualOverlay.showToast(message, type);
        }
    };

    // ============================================
    // 3. VISUAL OVERLAY SYSTEM
    // ============================================
    Ezra.VisualOverlay = {
        init() {
            this.createToastContainer();
            this.createNotificationPanel();
        },

        createToastContainer() {
            const container = document.createElement('div');
            container.id = 'ezra-toast-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 10px;
            `;
            document.body.appendChild(container);
        },

        createNotificationPanel() {
            const panel = document.createElement('div');
            panel.id = 'ezra-notification-panel';
            panel.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(15,23,42,0.98);
                border: 1px solid rgba(212,175,55,0.5);
                border-radius: 16px;
                padding: 24px;
                max-width: 400px;
                z-index: 10001;
                display: none;
                box-shadow: 0 25px 50px rgba(0,0,0,0.5);
            `;
            document.body.appendChild(panel);
        },

        showToast(message, type = 'info', duration = 3000) {
            const container = document.getElementById('ezra-toast-container');
            
            const toast = document.createElement('div');
            toast.style.cssText = `
                background: ${this.getTypeColor(type)};
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 500;
                animation: slideIn 0.3s ease;
                max-width: 300px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            `;
            toast.textContent = message;
            
            container.appendChild(toast);
            
            setTimeout(() => {
                toast.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        },

        showNotification({ title, message, type, actions, duration = 0 }) {
            const panel = document.getElementById('ezra-notification-panel');
            
            panel.innerHTML = `
                <div style="text-align: center;">
                    <div style="font-size: 32px; margin-bottom: 12px;">${this.getTypeIcon(type)}</div>
                    <div style="color: #d4af37; font-weight: 600; font-size: 16px; margin-bottom: 8px;">${title}</div>
                    <div style="color: rgba(255,255,255,0.9); font-size: 14px; margin-bottom: 20px; line-height: 1.5;">${message}</div>
                    ${actions ? `
                        <div style="display: flex; gap: 10px; justify-content: center;">
                            ${actions.map(a => `
                                <button onclick="this.closest('#ezra-notification-panel').style.display='none'; (${a.action.toString()})();" 
                                    style="background: ${a.label === 'Cancel' ? 'rgba(255,255,255,0.1)' : '#d4af37'}; 
                                           color: ${a.label === 'Cancel' ? 'white' : '#0f172a'}; 
                                           border: none; padding: 10px 20px; border-radius: 6px; 
                                           font-weight: 600; cursor: pointer; font-size: 13px;">
                                    ${a.label}
                                </button>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
            
            panel.style.display = 'block';
            
            if (duration > 0) {
                setTimeout(() => panel.style.display = 'none', duration);
            }
        },

        getTypeColor(type) {
            const colors = {
                success: 'linear-gradient(135deg, #22c55e, #16a34a)',
                error: 'linear-gradient(135deg, #ef4444, #dc2626)',
                warning: 'linear-gradient(135deg, #eab308, #ca8a04)',
                info: 'linear-gradient(135deg, #3b82f6, #2563eb)'
            };
            return colors[type] || colors.info;
        },

        getTypeIcon(type) {
            const icons = {
                success: '✅',
                error: '❌',
                warning: '⚠️',
                info: 'ℹ️'
            };
            return icons[type] || icons.info;
        }
    };

    // ============================================
    // 4. FOLLOW-UP ENGINE
    // ============================================
    Ezra.FollowUpEngine = {
        init() {
            this.checkPendingFollowUps();
            setInterval(() => this.checkPendingFollowUps(), 60000); // Check every minute
        },

        async checkPendingFollowUps() {
            if (!Ezra.user) return;
            
            const { data: quotes } = await Ezra.supabase
                .from('quotes')
                .select('*, leads(*)')
                .eq('user_id', Ezra.user.id)
                .eq('status', 'sent')
                .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Sent more than 24 hours ago
            
            if (!quotes || quotes.length === 0) return;
            
            for (const quote of quotes) {
                const analysis = await this.analyzeEngagement(quote);
                
                if (analysis.needsFollowUp) {
                    this.suggestFollowUp(quote, analysis);
                }
            }
        },

        async analyzeEngagement(quote) {
            // Get quote views from analytics
            const { data: views } = await Ezra.supabase
                .from('lead_analytics')
                .select('*')
                .eq('lead_id', quote.lead_id)
                .eq('event_type', 'quote_opened')
                .order('created_at', { ascending: false });
            
            const viewCount = views?.length || 0;
            const lastView = views?.[0];
            const hoursSinceSent = (Date.now() - new Date(quote.created_at)) / (1000 * 60 * 60);
            
            return {
                viewCount,
                lastView,
                hoursSinceSent,
                needsFollowUp: this.determineIfFollowUpNeeded(viewCount, hoursSinceSent),
                urgency: this.calculateUrgency(viewCount, hoursSinceSent),
                recommendedAction: this.recommendAction(viewCount, hoursSinceSent)
            };
        },

        determineIfFollowUpNeeded(views, hours) {
            if (views === 0 && hours > 48) return true; // Never opened after 48 hours
            if (views > 3 && hours > 24) return true; // Multiple views, no response
            if (views > 0 && hours > 72) return true; // Viewed but stale
            return false;
        },

        calculateUrgency(views, hours) {
            if (views > 5) return 'high';
            if (views > 2) return 'medium';
            return 'low';
        },

        recommendAction(views, hours) {
            if (views === 0) return 'send_email';
            if (views > 3) return 'call';
            return 'send_email';
        },

        suggestFollowUp(quote, analysis) {
            const lead = quote.leads;
            
            Ezra.VisualOverlay.showNotification({
                title: '🔥 Follow-Up Needed',
                message: `${lead.name} has${analysis.viewCount > 0 ? ` viewed the quote ${analysis.viewCount} times` : "n't opened the quote"} in ${Math.round(analysis.hoursSinceSent)} hours.`,
                type: analysis.urgency === 'high' ? 'warning' : 'info',
                actions: [
                    {
                        label: 'Draft Email',
                        action: () => this.draftFollowUpEmail(quote, lead, analysis)
                    },
                    {
                        label: 'Call Script',
                        action: () => this.showCallScript(quote, lead, analysis)
                    },
                    {
                        label: 'Dismiss',
                        action: () => {}
                    }
                ]
            });
        },

        draftFollowUpEmail(quote, lead, analysis) {
            const templates = {
                noOpen: {
                    subject: `Your HELOC quote from ${quote.lo_name || 'me'}`,
                    body: `Hi ${lead.name.split(' ')[0]},\n\nI prepared your HELOC quote and wanted to make sure you received it.\n\nBased on your property value, you could access up to $${(quote.quote_data?.helocAmount || 0).toLocaleString()} at competitive rates.\n\nThe application takes just 5 minutes, and you'll have a decision within 24 hours.\n\nAny questions? Just reply to this email or call me directly at ${quote.lo_phone || '[your phone]'}.\n\nBest,\n${quote.lo_name || 'Your Loan Officer'}`
                },
                multipleViews: {
                    subject: 'Questions about your HELOC quote?',
                    body: `Hi ${lead.name.split(' ')[0]},\n\nI noticed you've reviewed your HELOC quote a few times. I wanted to reach out personally to see if you have any questions or if there's anything I can clarify.\n\nThe ${(quote.quote_data?.helocAmount || 0).toLocaleString()} credit line at ${quote.quote_data?.rate || 'competitive'}% is a great opportunity to access your home equity.\n\nWould a quick 5-minute call work for you today or tomorrow?\n\nBest,\n${quote.lo_name || 'Your Loan Officer'}\n${quote.lo_phone || ''}`
                }
            };
            
            const template = analysis.viewCount > 0 ? templates.multipleViews : templates.noOpen;
            
            // Open email composer or copy to clipboard
            navigator.clipboard.writeText(`Subject: ${template.subject}\n\n${template.body}`);
            Ezra.VisualOverlay.showToast('Follow-up email copied to clipboard!', 'success');
        },

        showCallScript(quote, lead, analysis) {
            const script = `
CALL SCRIPT: ${lead.name}

OPENING:
"Hi ${lead.name.split(' ')[0]}, this is ${quote.lo_name || 'your loan officer'} following up on the HELOC quote I sent you. Do you have a quick minute?"

${analysis.viewCount > 0 ? 
`CONTEXT:
"I saw you've looked at the quote ${analysis.viewCount} times, so I figured you might have questions."` : 
`CONTEXT:
"I wanted to make sure you received the quote and see if you have any questions."`}

KEY POINTS:
• $${(quote.quote_data?.helocAmount || 0).toLocaleString()} available
• ${quote.quote_data?.rate || 'Competitive'}% rate
• ${quote.quote_data?.payment || 'Low'} monthly payment
• No application fee

CLOSE:
"Does this make sense for what you're trying to accomplish? I'd love to get you started - the application takes 5 minutes."

OBJECTION HANDLING:
If "need to think about it": "Of course. What specific questions can I answer to help you decide?"
If "rate too high": "I understand. Let me see if we can structure this differently to get you a better rate."
If "not ready": "No problem. When would be a better time to revisit this?"
            `;
            
            navigator.clipboard.writeText(script);
            Ezra.VisualOverlay.showToast('Call script copied to clipboard!', 'success');
        }
    };

    // ============================================
    // 5. WORKFLOW AUTOMATION
    // ============================================
    Ezra.WorkflowAutomation = {
        triggers: {},
        
        init() {
            this.registerTriggers();
            this.setupEventListeners();
        },

        registerTriggers() {
            this.triggers = {
                'quote_sent': this.onQuoteSent.bind(this),
                'quote_viewed': this.onQuoteViewed.bind(this),
                'new_lead': this.onNewLead.bind(this),
                'rate_change': this.onRateChange.bind(this)
            };
        },

        setupEventListeners() {
            // Listen for quote sent events
            document.addEventListener('quoteSent', (e) => {
                this.triggers['quote_sent'](e.detail);
            });
            
            // Listen for lead creation
            document.addEventListener('leadCreated', (e) => {
                this.triggers['new_lead'](e.detail);
            });
        },

        async onQuoteSent(data) {
            // Auto-schedule follow-up
            await this.scheduleFollowUp(data.quoteId, 48); // 48 hours
            
            // Log activity
            console.log('Quote sent automation triggered:', data);
        },

        async onQuoteViewed(data) {
            const { quoteId, viewCount } = data;
            
            if (viewCount === 3) {
                // Hot lead alert
                Ezra.VisualOverlay.showNotification({
                    title: '🔥 Hot Lead Alert!',
                    message: 'This lead has viewed the quote 3 times. Time to call!',
                    type: 'warning',
                    actions: [
                        { label: 'Call Now', action: () => window.open(`tel:${data.leadPhone}`) },
                        { label: 'View Quote', action: () => {} }
                    ]
                });
            }
        },

        async onNewLead(data) {
            // Auto-create quote template
            const lead = data.lead;
            
            Ezra.VisualOverlay.showNotification({
                title: 'New Lead: ' + lead.name,
                message: `Source: ${lead.source || 'Unknown'}. Create quote template?`,
                type: 'info',
                actions: [
                    { 
                        label: 'Create Quote', 
                        action: () => {
                            document.getElementById('in-client-name').value = lead.name;
                            document.getElementById('client-email').value = lead.email || '';
                            document.getElementById('client-phone').value = lead.phone || '';
                            Ezra.VisualOverlay.showToast('Quote template created!', 'success');
                        }
                    },
                    { label: 'Dismiss', action: () => {} }
                ]
            });
        },

        async onRateChange(data) {
            // Notify about rate changes affecting open quotes
            console.log('Rate change detected:', data);
        },

        async scheduleFollowUp(quoteId, hours) {
            const scheduledTime = new Date(Date.now() + hours * 60 * 60 * 1000);
            
            await Ezra.supabase.from('ezra_scheduled_actions').insert({
                loan_officer_id: Ezra.user.id,
                quote_id: quoteId,
                action_type: 'follow_up',
                scheduled_at: scheduledTime.toISOString(),
                status: 'pending'
            });
        }
    };

    // ============================================
    // INITIALIZE
    // ============================================
    
    // Add CSS animations
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes slideOut {
            from { transform: translateX(0); opacity: 1; }
            to { transform: translateX(100%); opacity: 0; }
        }
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }
    `;
    document.head.appendChild(style);
    
    // Start Ezra
    Ezra.init();
    
    // Expose globally
    window.EzraAI = Ezra;

})();
