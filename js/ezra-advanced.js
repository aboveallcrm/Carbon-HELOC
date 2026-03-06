/**
 * EZRA AI - Advanced Features
 * 
 * - Deal Scoring & Predictions
 * - Competitive Intelligence
 * - Emotional Intelligence
 * - Vision/Screenshot Analysis
 * - Learning Engine
 */

(function() {
    'use strict';

    const EzraAdvanced = {
        
        // ============================================
        // DEAL SCORING & PREDICTIONS
        // ============================================
        DealScoring: {
            async scoreDeal(quoteData) {
                const scores = {
                    credit: this.scoreCredit(quoteData.creditScore),
                    equity: this.scoreEquity(quoteData.cltv),
                    income: this.scoreIncome(quoteData.annualIncome, quoteData.totalDebt),
                    stability: this.scoreStability(quoteData),
                    market: await this.scoreMarketConditions(quoteData.state)
                };
                
                const overallScore = this.calculateOverallScore(scores);
                const prediction = this.predictOutcome(quoteData, scores);
                
                return {
                    overall: overallScore,
                    breakdown: scores,
                    prediction: prediction,
                    recommendations: this.generateRecommendations(scores, quoteData)
                };
            },

            scoreCredit(score) {
                if (score >= 760) return { score: 100, tier: 'exceptional', factors: ['Best rates', 'Fast approval'] };
                if (score >= 740) return { score: 90, tier: 'excellent', factors: ['Great rates', 'Easy approval'] };
                if (score >= 720) return { score: 80, tier: 'very_good', factors: ['Good rates', 'Standard approval'] };
                if (score >= 680) return { score: 65, tier: 'good', factors: ['Fair rates', 'May need review'] };
                if (score >= 640) return { score: 45, tier: 'fair', factors: ['Higher rates', 'Manual review likely'] };
                return { score: 25, tier: 'poor', factors: ['High rates', 'Approval uncertain'] };
            },

            scoreEquity(cltv) {
                if (cltv <= 60) return { score: 100, risk: 'minimal', ltvBuffer: '40%' };
                if (cltv <= 70) return { score: 85, risk: 'low', ltvBuffer: '30%' };
                if (cltv <= 80) return { score: 70, risk: 'moderate', ltvBuffer: '20%' };
                if (cltv <= 85) return { score: 50, risk: 'elevated', ltvBuffer: '15%' };
                return { score: 30, risk: 'high', ltvBuffer: 'Under 15%' };
            },

            scoreIncome(annualIncome, totalDebt) {
                if (!annualIncome) return { score: 50, note: 'Income not verified' };
                
                const dti = (totalDebt * 12) / annualIncome * 100;
                
                if (dti <= 36) return { score: 100, dti: dti.toFixed(1), assessment: 'Excellent' };
                if (dti <= 43) return { score: 80, dti: dti.toFixed(1), assessment: 'Good' };
                if (dti <= 50) return { score: 60, dti: dti.toFixed(1), assessment: 'Acceptable' };
                return { score: 40, dti: dti.toFixed(1), assessment: 'High - may need compensating factors' };
            },

            scoreStability(quoteData) {
                let score = 70; // Base score
                const factors = [];
                
                // Employment stability
                if (quoteData.employmentYears >= 2) {
                    score += 15;
                    factors.push('Stable employment');
                }
                
                // Property stability
                if (quoteData.occupancy === 'primary') {
                    score += 10;
                    factors.push('Primary residence');
                }
                
                // Previous relationship
                if (quoteData.existingCustomer) {
                    score += 15;
                    factors.push('Existing customer');
                }
                
                return { score: Math.min(100, score), factors };
            },

            async scoreMarketConditions(state) {
                // This would fetch real market data
                const marketData = await this.fetchMarketData(state);
                
                return {
                    score: marketData.score,
                    trends: marketData.trends,
                    competition: marketData.competitionLevel,
                    recommendation: marketData.recommendation
                };
            },

            calculateOverallScore(scores) {
                const weights = {
                    credit: 0.30,
                    equity: 0.25,
                    income: 0.20,
                    stability: 0.15,
                    market: 0.10
                };
                
                let total = 0;
                for (const [key, weight] of Object.entries(weights)) {
                    total += scores[key].score * weight;
                }
                
                return Math.round(total);
            },

            predictOutcome(quoteData, scores) {
                const overall = this.calculateOverallScore(scores);
                
                if (overall >= 85) {
                    return {
                        probability: '92%',
                        timeline: '3-5 days',
                        confidence: 'high',
                        notes: 'Strong applicant - expedite processing'
                    };
                } else if (overall >= 70) {
                    return {
                        probability: '78%',
                        timeline: '5-7 days',
                        confidence: 'good',
                        notes: 'Standard processing expected'
                    };
                } else if (overall >= 55) {
                    return {
                        probability: '60%',
                        timeline: '7-10 days',
                        confidence: 'moderate',
                        notes: 'May require additional documentation'
                    };
                } else {
                    return {
                        probability: '40%',
                        timeline: '10+ days',
                        confidence: 'low',
                        notes: 'Consider alternative programs'
                    };
                }
            },

            generateRecommendations(scores, quoteData) {
                const recs = [];
                
                if (scores.equity.score < 70) {
                    recs.push({
                        priority: 'high',
                        action: 'Reduce HELOC amount',
                        impact: `Increase from ${scores.equity.score} to ${scores.equity.score + 20} equity score`,
                        details: `Lower CLTV from ${quoteData.cltv}% to improve approval odds`
                    });
                }
                
                if (scores.credit.score < 70) {
                    recs.push({
                        priority: 'medium',
                        action: 'Credit improvement plan',
                        impact: 'Potential 0.5% rate reduction',
                        details: 'Pay down credit cards to improve utilization'
                    });
                }
                
                if (scores.income.score < 60) {
                    recs.push({
                        priority: 'high',
                        action: 'Add co-borrower',
                        impact: 'Improve DTI ratio',
                        details: 'Consider adding spouse or family member'
                    });
                }
                
                return recs;
            },

            renderScoreCard(scores) {
                return `
                    <div class="ezra-score-card">
                        <div class="ezra-score-header">
                            <div class="ezra-score-circle" style="--score: ${scores.overall}">
                                <span>${scores.overall}</span>
                                <small>Deal Score</small>
                            </div>
                            <div class="ezra-prediction">
                                <div class="ezra-prob">${scores.prediction.probability} close probability</div>
                                <div class="ezra-timeline">Est. ${scores.prediction.timeline} to close</div>
                            </div>
                        </div>
                        
                        <div class="ezra-score-breakdown">
                            ${Object.entries(scores.breakdown).map(([key, data]) => `
                                <div class="ezra-score-item">
                                    <span class="ezra-score-label">${key}</span>
                                    <div class="ezra-score-bar">
                                        <div class="ezra-score-fill" style="width: ${data.score}%"></div>
                                    </div>
                                    <span class="ezra-score-value">${data.score}</span>
                                </div>
                            `).join('')}
                        </div>
                        
                        ${scores.recommendations.length > 0 ? `
                            <div class="ezra-recommendations">
                                <h4>💡 Recommendations</h4>
                                ${scores.recommendations.map(r => `
                                    <div class="ezra-rec-item ${r.priority}">
                                        <strong>${r.action}</strong>
                                        <p>${r.details}</p>
                                        <span class="ezra-impact">Impact: ${r.impact}</span>
                                    </div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                `;
            }
        },

        // ============================================
        // COMPETITIVE INTELLIGENCE
        // ============================================
        CompetitiveIntel: {
            async analyzeCompetitorQuote(imageData) {
                // This would use OCR or AI vision to extract competitor quote data
                const extractedData = await this.extractQuoteData(imageData);
                
                const myQuote = this.getCurrentQuoteData();
                
                const comparison = this.compareQuotes(myQuote, extractedData);
                
                return {
                    competitor: extractedData,
                    comparison: comparison,
                    counterOffer: this.generateCounterOffer(myQuote, extractedData, comparison),
                    talkingPoints: this.generateTalkingPoints(comparison)
                };
            },

            compareQuotes(mine, competitor) {
                const differences = [];
                
                if (competitor.rate && mine.rate) {
                    const diff = competitor.rate - mine.rate;
                    differences.push({
                        factor: 'Interest Rate',
                        mine: mine.rate + '%',
                        competitor: competitor.rate + '%',
                        diff: diff.toFixed(2) + '%',
                        advantage: diff > 0 ? 'me' : diff < 0 ? 'competitor' : 'tie',
                        monthlyImpact: this.calculateMonthlyImpact(mine.helocAmount, diff)
                    });
                }
                
                if (competitor.fees && mine.fees) {
                    const diff = competitor.fees - mine.fees;
                    differences.push({
                        factor: 'Fees',
                        mine: '$' + mine.fees.toLocaleString(),
                        competitor: '$' + competitor.fees.toLocaleString(),
                        diff: '$' + Math.abs(diff).toLocaleString(),
                        advantage: diff > 0 ? 'me' : diff < 0 ? 'competitor' : 'tie'
                    });
                }
                
                // Calculate total cost over 5 years
                const my5Year = this.calculate5YearCost(mine);
                const their5Year = this.calculate5YearCost(competitor);
                
                return {
                    differences,
                    totalCostComparison: {
                        mine: my5Year,
                        competitor: their5Year,
                        savings: my5Year - their5Year
                    },
                    winner: my5Year < their5Year ? 'me' : 'competitor'
                };
            },

            generateCounterOffer(myQuote, competitor, comparison) {
                if (comparison.winner === 'me') {
                    return {
                        strategy: 'emphasize_value',
                        message: 'You already have the better deal. Focus on service and speed.',
                        adjustments: []
                    };
                }
                
                const adjustments = [];
                
                // Can we match rate?
                if (comparison.differences.find(d => d.factor === 'Interest Rate' && d.advantage === 'competitor')) {
                    const rateDiff = parseFloat(comparison.differences.find(d => d.factor === 'Interest Rate').diff);
                    if (rateDiff <= 0.25) {
                        adjustments.push({
                            type: 'rate_match',
                            description: `Match competitor's rate`,
                            impact: `Reduce rate by ${rateDiff}%`,
                            cost: 'Minimal margin reduction'
                        });
                    }
                }
                
                // Can we reduce fees?
                if (comparison.differences.find(d => d.factor === 'Fees' && d.advantage === 'competitor')) {
                    adjustments.push({
                        type: 'fee_reduction',
                        description: 'Waive origination fee',
                        impact: 'Save borrower $' + comparison.differences.find(d => d.factor === 'Fees').diff.replace('$', ''),
                        cost: 'One-time revenue reduction'
                    });
                }
                
                return {
                    strategy: 'match_or_beat',
                    message: 'Consider these adjustments to win the deal:',
                    adjustments
                };
            },

            generateTalkingPoints(comparison) {
                const points = [];
                
                if (comparison.winner === 'me') {
                    const savings = Math.abs(comparison.totalCostComparison.savings);
                    points.push(`"Over 5 years, our quote saves you $${savings.toLocaleString()}"`);
                    points.push('"We offer local service and faster closings"');
                    points.push('"No hidden fees or surprise rate adjustments"');
                } else {
                    points.push('"Let me review if we can match that rate"');
                    points.push('"Our service includes ongoing support and annual reviews"');
                    points.push('"We can close in 10 days vs their 3 weeks"');
                }
                
                return points;
            },

            calculateMonthlyImpact(amount, rateDiff) {
                return Math.round(amount * (rateDiff / 100) / 12);
            },

            calculate5YearCost(quote) {
                const annualInterest = (quote.helocAmount || 0) * ((quote.rate || 0) / 100);
                const fiveYearInterest = annualInterest * 5;
                const fees = quote.fees || 0;
                return fiveYearInterest + fees;
            }
        },

        // ============================================
        // EMOTIONAL INTELLIGENCE
        // ============================================
        EmotionalIntel: {
            analyzeLeadSentiment(leadData, interactions) {
                const signals = {
                    urgency: this.detectUrgency(interactions),
                    hesitation: this.detectHesitation(interactions),
                    shopping: this.detectShoppingBehavior(interactions),
                    readiness: this.detectReadiness(interactions)
                };
                
                const personality = this.assessPersonality(leadData, interactions);
                
                return {
                    signals,
                    personality,
                    recommendedApproach: this.generateApproach(signals, personality),
                    warningFlags: this.identifyWarningFlags(signals)
                };
            },

            detectUrgency(interactions) {
                const urgencySignals = [
                    /urgent|asap|immediately|this week/i,
                    /need.*fast|quick.*close|rush/i,
                    /emergency|unexpected expense/i
                ];
                
                let score = 0;
                const evidence = [];
                
                interactions.forEach(interaction => {
                    urgencySignals.forEach(pattern => {
                        if (pattern.test(interaction.content)) {
                            score += 25;
                            evidence.push(interaction.content.match(pattern)[0]);
                        }
                    });
                });
                
                // Also check response speed
                const responseTimes = this.calculateResponseTimes(interactions);
                if (responseTimes.avg < 2) { // Responds within 2 hours
                    score += 20;
                    evidence.push('Fast response times');
                }
                
                return {
                    level: score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low',
                    score: Math.min(100, score),
                    evidence: [...new Set(evidence)]
                };
            },

            detectShoppingBehavior(interactions) {
                const shoppingSignals = [
                    /comparing|shopping around|other lenders/i,
                    /better rate|lower rate|beat this/i,
                    /multiple quotes|few other/i
                ];
                
                let score = 0;
                let quotesRequested = 0;
                
                interactions.forEach(interaction => {
                    shoppingSignals.forEach(pattern => {
                        if (pattern.test(interaction.content)) {
                            score += 30;
                        }
                    });
                    if (/quote|rate/i.test(interaction.content)) quotesRequested++;
                });
                
                // Check if viewing multiple times without committing
                const views = interactions.filter(i => i.type === 'view').length;
                if (views > 5) score += 20;
                
                return {
                    isShopping: score >= 40,
                    score: Math.min(100, score),
                    quotesRequested,
                    views,
                    strategy: score >= 60 ? 'aggressive_compete' : score >= 40 ? 'differentiate' : 'standard'
                };
            },

            detectReadiness(interactions) {
                const readinessSignals = [
                    /ready to move forward|let's do this|i'm in/i,
                    /what.*next steps|how do we start|application/i,
                    /send.*paperwork|ready to sign/i
                ];
                
                let score = 0;
                
                interactions.forEach(interaction => {
                    readinessSignals.forEach(pattern => {
                        if (pattern.test(interaction.content)) {
                            score += 35;
                        }
                    });
                });
                
                // Check if they've filled out application
                const applicationStarted = interactions.some(i => /application|started|submitted/i.test(i.content));
                if (applicationStarted) score += 30;
                
                return {
                    level: score >= 70 ? 'hot' : score >= 40 ? 'warm' : 'cold',
                    score: Math.min(100, score),
                    nextAction: score >= 70 ? 'close_now' : score >= 40 ? 'nurture' : 'educate'
                };
            },

            assessPersonality(leadData, interactions) {
                // Analyze communication style
                const allText = interactions.map(i => i.content).join(' ');
                
                const traits = {
                    analytical: /details|breakdown|numbers|specific/i.test(allText),
                    driver: /quick|fast|now|immediately/i.test(allText),
                    amiable: /feel|comfortable|trust|relationship/i.test(allText),
                    expressive: /excited|great|amazing|love/i.test(allText)
                };
                
                const dominant = Object.entries(traits)
                    .sort((a, b) => b[1] - a[1])[0][0];
                
                return {
                    dominantTrait: dominant,
                    traits,
                    communicationStyle: this.getCommunicationStyle(dominant)
                };
            },

            getCommunicationStyle(trait) {
                const styles = {
                    analytical: {
                        approach: 'Provide detailed breakdowns and data',
                        language: 'Use precise numbers and logical explanations',
                        avoid: 'Pushy sales tactics or vague promises'
                    },
                    driver: {
                        approach: 'Be direct and efficient',
                        language: 'Focus on speed and results',
                        avoid: 'Long explanations or small talk'
                    },
                    amiable: {
                        approach: 'Build trust and relationship first',
                        language: 'Use warm, supportive language',
                        avoid: 'Aggressive closing or pressure'
                    },
                    expressive: {
                        approach: 'Be enthusiastic and engaging',
                        language: 'Use stories and emotional benefits',
                        avoid: 'Dry facts or lengthy details'
                    }
                };
                return styles[trait] || styles.analytical;
            },

            generateApproach(signals, personality) {
                const approaches = [];
                
                if (signals.urgency.level === 'high') {
                    approaches.push('Fast-track this deal - prioritize immediate response');
                }
                
                if (signals.shopping.isShopping) {
                    approaches.push('Emphasize unique value propositions beyond rate');
                }
                
                if (signals.readiness.level === 'hot') {
                    approaches.push('Ready to close - schedule signing appointment');
                }
                
                approaches.push(`Communicate in ${personality.dominantTrait} style`);
                
                return approaches;
            },

            identifyWarningFlags(signals) {
                const flags = [];
                
                if (signals.shopping.quotesRequested > 3) {
                    flags.push({
                        level: 'medium',
                        message: 'Requesting multiple quotes - may be rate-shopping only',
                        action: 'Differentiate on service, not just rate'
                    });
                }
                
                if (signals.urgency.level === 'high' && signals.readiness.level === 'cold') {
                    flags.push({
                        level: 'high',
                        message: 'Says urgent but not taking action - possible tire-kicker',
                        action: 'Qualify timeline and commitment level'
                    });
                }
                
                return flags;
            }
        },

        // ============================================
        // VISION / SCREENSHOT ANALYSIS
        // ============================================
        Vision: {
            async analyzeImage(imageFile) {
                // This would integrate with OCR or AI vision API
                const formData = new FormData();
                formData.append('image', imageFile);
                
                try {
                    const response = await fetch('/api/vision/analyze', {
                        method: 'POST',
                        body: formData
                    });
                    
                    const result = await response.json();
                    
                    return {
                        type: result.documentType,
                        extractedData: result.data,
                        confidence: result.confidence,
                        actions: this.suggestActions(result)
                    };
                } catch (e) {
                    return { error: 'Failed to analyze image' };
                }
            },

            suggestActions(analysis) {
                const actions = [];
                
                if (analysis.type === 'competitor_quote') {
                    actions.push({
                        label: 'Compare Quotes',
                        action: () => EzraAdvanced.CompetitiveIntel.analyzeCompetitorQuote(analysis.extractedData)
                    });
                }
                
                if (analysis.type === 'pay_stub') {
                    actions.push({
                        label: 'Extract Income',
                        action: () => this.extractIncomeData(analysis.extractedData)
                    });
                }
                
                if (analysis.type === 'property_photo') {
                    actions.push({
                        label: 'Estimate Value',
                        action: () => this.estimatePropertyValue(analysis.extractedData)
                    });
                }
                
                return actions;
            }
        },

        // ============================================
        // LEARNING ENGINE
        // ============================================
        LearningEngine: {
            patterns: {},
            
            async learnFromDeals(deals) {
                this.patterns = {
                    successfulQuotes: this.analyzeSuccessfulQuotes(deals.filter(d => d.status === 'closed')),
                    failedQuotes: this.analyzeFailedQuotes(deals.filter(d => d.status === 'lost')),
                    timing: this.analyzeTimingPatterns(deals),
                    messaging: this.analyzeMessaging(deals),
                    objections: this.analyzeObjections(deals)
                };
                
                return this.patterns;
            },

            analyzeSuccessfulQuotes(closedDeals) {
                if (!closedDeals.length) return null;
                
                return {
                    avgTimeToClose: this.calculateAverage(closedDeals.map(d => d.daysToClose)),
                    commonScenarios: this.findCommonScenarios(closedDeals),
                    optimalFollowUpSequence: this.findOptimalSequence(closedDeals),
                    winningPhrases: this.extractWinningPhrases(closedDeals)
                };
            },

            findCommonScenarios(deals) {
                const scenarios = deals.map(d => ({
                    cltv: d.quote_data?.combined_ltv,
                    credit: d.quote_data?.credit_score,
                    amount: d.quote_data?.heloc_amount
                }));
                
                // Group by ranges
                const groups = {
                    highEquity: scenarios.filter(s => s.cltv < 70).length,
                    midEquity: scenarios.filter(s => s.cltv >= 70 && s.cltv < 80).length,
                    highCredit: scenarios.filter(s => s.credit >= 740).length
                };
                
                return groups;
            },

            findOptimalSequence(deals) {
                // Analyze which follow-up sequences led to closes
                const sequences = deals.map(d => ({
                    touches: d.follow_up_count,
                    timing: d.follow_up_timing,
                    channels: d.follow_up_channels
                }));
                
                // Find most common successful pattern
                const optimal = this.findMostCommon(sequences);
                
                return optimal;
            },

            extractWinningPhrases(deals) {
                // This would analyze email/communication content
                // For now, return common successful phrases
                return [
                    'Based on your specific situation',
                    'Let me show you exactly how this works',
                    'What questions can I answer for you?',
                    'Here\'s what other homeowners in your area are doing'
                ];
            },

            generatePersonalizedScript(loProfile, leadProfile) {
                const patterns = this.patterns;
                
                let script = {
                    opening: '',
                    valueProp: '',
                    questions: [],
                    close: ''
                };
                
                // Customize based on LO's successful patterns
                if (patterns.successfulQuotes?.winningPhrases) {
                    script.opening = patterns.successfulQuotes.winningPhrases[0];
                }
                
                // Customize based on lead profile
                if (leadProfile.creditScore >= 740) {
                    script.valueProp = 'Your excellent credit qualifies you for our best rates';
                }
                
                return script;
            },

            predictQuoteSuccess(quoteData) {
                const similarity = this.calculateSimilarity(quoteData, this.patterns.successfulQuotes);
                
                return {
                    probability: similarity,
                    factors: this.identifySuccessFactors(quoteData),
                    recommendations: this.generateImprovements(quoteData)
                };
            }
        }
    };

    // Expose to global
    window.EzraAdvanced = EzraAdvanced;

})();
