/**
 * Quote Builder Objection Prep System
 * Phase 2: Pre-call briefing with common objections and responses
 */

(function() {
    'use strict';

    // Common HELOC objections database
    const OBJECTIONS_DATABASE = {
        'rate_too_high': {
            category: 'Rate Concerns',
            objection: 'Your rate is higher than what I saw at [bank]',
            responses: [
                'I understand - rates are important. The rate you saw was likely a teaser rate that adjusts after 6-12 months. Our rate is fixed for the full draw period.',
                'Let me show you the total cost comparison over 5 years, not just the starting rate.',
                'What was the APR on that offer? Many banks advertise low rates but add fees that increase the effective rate.',
                'We can also look at our Tier 1 option which has a lower rate if you qualify.'
            ],
            followUp: 'Would you like me to run a side-by-side comparison showing the true cost over time?'
        },
        'need_to_think': {
            category: 'Stalling',
            objection: 'I need to think about it / talk to my spouse',
            responses: [
                'Absolutely - this is a big decision. What specific questions do you have that I can help clarify?',
                'I respect that. When would be a good time for me to follow up? I want to make sure you have all the information you need.',
                'Is there anything about the terms or process that concerns you? I\'m here to help.',
                'Would it help if I sent a summary email you can review together?'
            ],
            followUp: 'What information would be most helpful for that conversation?'
        },
        'not_ready': {
            category: 'Timing',
            objection: 'I\'m not ready to move forward right now',
            responses: [
                'I understand timing is important. Is there a specific event or milestone you\'re waiting for?',
                'No pressure at all. Would it be okay if I checked back in a few weeks to see where you\'re at?',
                'Just so you know, rates can change. Would you like me to lock this rate for 30 days while you decide?',
                'What would need to happen for you to feel ready to move forward?'
            ],
            followUp: 'When would be a better time to revisit this?'
        },
        'shopping_around': {
            category: 'Competition',
            objection: 'I\'m shopping around with a few lenders',
            responses: [
                'That\'s smart - you should compare. What are the most important factors you\'re comparing besides rate?',
                'Great - here\'s what sets us apart: no appraisal fees, no annual fees, and local servicing. Make sure to ask about those at other lenders.',
                'I encourage you to shop. Just keep in mind that multiple credit pulls can affect your score. We can do a soft pull first.',
                'What have you found so far? Maybe I can help you compare apples to apples.'
            ],
            followUp: 'What would make Above All stand out from the other options?'
        },
        'payment_too_high': {
            category: 'Payment Concerns',
            objection: 'The monthly payment is more than I expected',
            responses: [
                'Let\'s look at adjusting the loan amount or term to get to a comfortable payment.',
                'Remember, with a HELOC you only pay interest on what you use, not the full line amount.',
                'We could structure this as interest-only payments during the draw period to lower the monthly.',
                'What monthly payment would work better for your budget?'
            ],
            followUp: 'Would you like to see some alternative payment options?'
        },
        'fees_too_high': {
            category: 'Cost Concerns',
            objection: 'There are too many fees',
            responses: [
                'I hear you. Let me break down which fees are standard and which we might be able to reduce or waive.',
                'Compared to a cash-out refinance, our fees are actually quite low. Let me show you the comparison.',
                'For loans over $100k, we often waive the origination fee. Let me see what I can do.',
                'The appraisal protects both of us - it ensures you\'re not borrowing more than the home is worth.'
            ],
            followUp: 'Which specific fee concerns you most?'
        },
        'credit_concerns': {
            category: 'Credit Issues',
            objection: 'My credit isn\'t great / I\'m worried about qualifying',
            responses: [
                'Let\'s do a soft pull first - it won\'t affect your credit score and we\'ll know exactly where you stand.',
                'We work with a range of credit profiles. Even if you don\'t qualify for Tier 1, we have options.',
                'There might be quick fixes to improve your score before we submit. I can help with that.',
                'The equity in your home is a strong compensating factor that can offset credit concerns.'
            ],
            followUp: 'Would you be comfortable letting me run a soft credit check to see your options?'
        },
        'home_value': {
            category: 'Property Concerns',
            objection: 'I\'m not sure what my home is worth',
            responses: [
                'I can run a quick automated valuation based on recent sales in your area.',
                'The appraisal will give us the official value, but I can give you a ballpark now.',
                'What did you pay for the home and when? I can estimate appreciation from there.',
                'Even conservative estimates show you have significant equity based on your area.'
            ],
            followUp: 'What\'s your best guess at current value?'
        },
        'using_savings': {
            category: 'Alternative Funding',
            objection: 'I might just use savings instead',
            responses: [
                'That\'s an option. How long would it take to save that amount?',
                'Using savings depletes your emergency fund. A HELOC keeps your cash available.',
                'You could do both - use some savings and the HELOC for the rest.',
                'What if you kept the savings and used the HELOC? You\'d still have the cash as a safety net.'
            ],
            followUp: 'What\'s your main concern about using a HELOC versus savings?'
        },
        'process_complex': {
            category: 'Process Concerns',
            objection: 'This seems complicated / too much paperwork',
            responses: [
                'I\'ll walk you through every step. Most of our clients are surprised how simple it is.',
                'We handle most of the paperwork. You just need to provide a few documents.',
                'Here\'s a simple checklist of what we\'ll need. I can help you gather everything.',
                'The whole process typically takes 2-3 weeks, and I\'ll be with you the whole time.'
            ],
            followUp: 'What part of the process worries you most?'
        }
    };

    // Generate pre-call briefing
    function generatePreCallBriefing(quoteData) {
        const briefing = {
            clientSummary: generateClientSummary(quoteData),
            likelyObjections: predictObjections(quoteData),
            recommendedApproach: generateApproach(quoteData),
            keyTalkingPoints: generateTalkingPoints(quoteData),
            questionsToAsk: generateQuestions(quoteData)
        };
        
        return briefing;
    }

    // Generate client summary
    function generateClientSummary(quoteData) {
        const summaries = [];
        
        // Credit-based summary
        if (quoteData.creditScore) {
            if (quoteData.creditScore >= 740) {
                summaries.push('Strong credit profile - qualifies for best rates');
            } else if (quoteData.creditScore >= 680) {
                summaries.push('Good credit - Tier 2 rates available');
            } else {
                summaries.push('Credit challenges - focus on equity and compensating factors');
            }
        }
        
        // LTV-based summary
        if (quoteData.ltv) {
            if (quoteData.ltv <= 80) {
                summaries.push('Low LTV - strong equity position');
            } else if (quoteData.ltv <= 90) {
                summaries.push('Moderate LTV - still good equity cushion');
            }
        }
        
        // Purpose-based summary
        if (quoteData.purpose) {
            const purposeLower = quoteData.purpose.toLowerCase();
            let purposeText = 'Purpose: ' + quoteData.purpose;
            
            if (purposeLower.includes('debt') || purposeLower.includes('consolidation')) {
                purposeText = 'Debt consolidation client - emphasize payment savings';
            } else if (purposeLower.includes('home') || purposeLower.includes('kitchen') || purposeLower.includes('remodel') || purposeLower.includes('improvement') || purposeLower.includes('addition') || purposeLower.includes('pool')) {
                purposeText = 'Home improvement - emphasize value-add to property';
            } else if (purposeLower.includes('investment')) {
                purposeText = 'Investment opportunity - emphasize speed and leverage';
            } else if (purposeLower.includes('emergency') || purposeLower.includes('medical')) {
                purposeText = 'Emergency need - emphasize fast funding';
            } else if (purposeLower.includes('education')) {
                purposeText = 'Education expense - emphasize tax benefits';
            }
            
            summaries.push(purposeText);
        } else {
            summaries.push('Purpose not specified');
        }
        
        return summaries;
    }

    // Predict likely objections based on quote data
    function predictObjections(quoteData) {
        const objections = [];
        
        // Rate concerns
        if (quoteData.tier && quoteData.tier > 1) {
            objections.push('rate_too_high');
        }
        
        // Payment concerns
        if (quoteData.monthlyPayment && quoteData.monthlyPayment > 1000) {
            objections.push('payment_too_high');
        }
        
        // Credit concerns
        if (quoteData.creditScore && quoteData.creditScore < 700) {
            objections.push('credit_concerns');
        }
        
        // Always include common ones
        objections.push('need_to_think', 'shopping_around', 'not_ready');
        
        // Return top 5 unique objections
        return [...new Set(objections)].slice(0, 5);
    }

    // Generate recommended approach
    function generateApproach(quoteData) {
        const approaches = [];
        
        if (quoteData.purpose === 'debt_consolidation') {
            approaches.push('Lead with monthly savings calculation');
            approaches.push('Show before/after debt payments');
        } else if (quoteData.purpose === 'home_improvement') {
            approaches.push('Emphasize ROI on improvements');
            approaches.push('Mention potential tax deductibility');
        } else if (quoteData.purpose === 'emergency') {
            approaches.push('Lead with speed - funds available in 2 weeks');
            approaches.push('Be empathetic but professional');
        }
        
        if (quoteData.creditScore >= 740) {
            approaches.push('Position as VIP client with best-rate guarantee');
        }
        
        approaches.push('Ask about timeline and urgency');
        approaches.push('Set follow-up before ending call');
        
        return approaches;
    }

    // Generate key talking points
    function generateTalkingPoints(quoteData) {
        const points = [];
        
        points.push({
            title: 'Opening',
            content: `Hi ${quoteData.clientName?.split(' ')[0] || 'there'}, this is [Your Name] from Above All. I have your HELOC quote ready - $${quoteData.amount?.toLocaleString() || 'amount pending'} at ${quoteData.rate || 'rate pending'}%. Do you have a few minutes to go over it?`
        });
        
        if (quoteData.monthlyPayment) {
            points.push({
                title: 'Payment',
                content: `Monthly payment would be approximately $${quoteData.monthlyPayment}/month during the draw period.`
            });
        }
        
        points.push({
            title: 'Speed',
            content: 'We can close in 2-3 weeks, and there\'s no appraisal fee for loans under $250k.'
        });
        
        points.push({
            title: 'Flexibility',
            content: 'You only pay interest on what you use, not the full line amount.'
        });
        
        points.push({
            title: 'Closing',
            content: 'Based on what you\'ve told me, this looks like a great fit. Should we get the application started?'
        });
        
        return points;
    }

    // Generate questions to ask
    function generateQuestions(quoteData) {
        return [
            'What\'s your timeline for needing these funds?',
            'Have you looked at other options? What\'s most important to you - rate, speed, or payment?',
            'Is this for a specific project or general flexibility?',
            'What would make this a no-brainer for you?',
            'When would be a good time to follow up if you need to think about it?'
        ];
    }

    // Show objection prep modal
    function showObjectionPrep(quoteData) {
        const briefing = generatePreCallBriefing(quoteData);
        
        const modal = document.createElement('div');
        modal.className = 'quote-builder-overlay';
        modal.id = 'qb-objection-prep';
        modal.innerHTML = `
            <div class="quote-builder-modal qb-prep-modal">
                <div class="qb-header">
                    <div class="qb-title">
                        <span class="qb-icon">🎯</span>
                        <div>
                            <h3>Pre-Call Briefing</h3>
                            <span class="qb-subtitle">${quoteData.clientName || 'Client'} - ${quoteData.amount ? '$' + quoteData.amount.toLocaleString() : 'Quote'}</span>
                        </div>
                    </div>
                    <button class="qb-close" onclick="this.closest('.quote-builder-overlay').remove()">×</button>
                </div>
                
                <div class="qb-prep-content">
                    <!-- Client Summary -->
                    <div class="qb-prep-section">
                        <h4>📊 Client Summary</h4>
                        <ul class="qb-prep-list">
                            ${briefing.clientSummary.map(s => `<li>${s}</li>`).join('')}
                        </ul>
                    </div>
                    
                    <!-- Likely Objections -->
                    <div class="qb-prep-section">
                        <h4>⚠️ Likely Objections</h4>
                        <div class="qb-objections-list">
                            ${briefing.likelyObjections.map(key => {
                                const obj = OBJECTIONS_DATABASE[key];
                                return `
                                    <div class="qb-objection-card" data-objection="${key}">
                                        <div class="qb-objection-header">
                                            <span class="qb-objection-category">${obj.category}</span>
                                            <span class="qb-objection-text">"${obj.objection}"</span>
                                        </div>
                                        <div class="qb-objection-responses" style="display: none;">
                                            <ul>
                                                ${obj.responses.map(r => `<li>${r}</li>`).join('')}
                                            </ul>
                                            <p class="qb-objection-followup"><strong>Follow-up:</strong> ${obj.followUp}</p>
                                        </div>
                                        <button class="qb-objection-toggle" onclick="this.previousElementSibling.style.display = this.previousElementSibling.style.display === 'none' ? 'block' : 'none'; this.textContent = this.previousElementSibling.style.display === 'none' ? 'Show Responses' : 'Hide Responses'">
                                            Show Responses
                                        </button>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                    
                    <!-- Recommended Approach -->
                    <div class="qb-prep-section">
                        <h4>💡 Recommended Approach</h4>
                        <ul class="qb-prep-list qb-approach-list">
                            ${briefing.recommendedApproach.map(a => `<li>${a}</li>`).join('')}
                        </ul>
                    </div>
                    
                    <!-- Talking Points -->
                    <div class="qb-prep-section">
                        <h4>📝 Key Talking Points</h4>
                        <div class="qb-talking-points">
                            ${briefing.keyTalkingPoints.map((point, i) => `
                                <div class="qb-talking-point">
                                    <span class="qb-point-number">${i + 1}</span>
                                    <div class="qb-point-content">
                                        <strong>${point.title}</strong>
                                        <p>${point.content}</p>
                                    </div>
                                    <button class="qb-copy-point" onclick="navigator.clipboard.writeText('${point.content.replace(/'/g, "\\'")}'); this.textContent = '✓'; setTimeout(() => this.textContent = '📋', 1000)">📋</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    
                    <!-- Questions -->
                    <div class="qb-prep-section">
                        <h4>❓ Questions to Ask</h4>
                        <ul class="qb-prep-list qb-questions-list">
                            ${briefing.questionsToAsk.map(q => `<li>${q}</li>`).join('')}
                        </ul>
                    </div>
                </div>
                
                <div class="qb-prep-footer">
                    <button class="qb-btn-secondary" onclick="this.closest('.quote-builder-overlay').remove()">Close</button>
                    <button class="qb-btn-primary" onclick="window.QuoteBuilderObjections.startCall('${quoteData.clientName || ''}')">
                        📞 Start Call
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    // Start call - copy talking points to clipboard
    function startCall(clientName) {
        const script = `Opening: Hi ${clientName ? clientName.split(' ')[0] : 'there'}, this is [Your Name] from Above All. I have your HELOC quote ready. Do you have a few minutes?`;
        navigator.clipboard.writeText(script);
        
        const modal = document.getElementById('qb-objection-prep');
        if (modal) {
            modal.querySelector('.qb-prep-footer').innerHTML = `
                <span class="qb-call-ready">📋 Opening copied to clipboard!</span>
                <button class="qb-btn-primary" onclick="this.closest('.quote-builder-overlay').remove()">Done</button>
            `;
        }
    }

    // Quick objection lookup
    function showObjectionFinder() {
        const modal = document.createElement('div');
        modal.className = 'quote-builder-overlay';
        modal.innerHTML = `
            <div class="quote-builder-modal qb-finder-modal">
                <div class="qb-header">
                    <div class="qb-title">
                        <span class="qb-icon">🔍</span>
                        <h3>Objection Finder</h3>
                    </div>
                    <button class="qb-close" onclick="this.closest('.quote-builder-overlay').remove()">×</button>
                </div>
                
                <div class="qb-finder-search">
                    <input type="text" id="qb-objection-search" placeholder="Type what the client said..." onkeyup="window.QuoteBuilderObjections.searchObjections(this.value)">
                </div>
                
                <div class="qb-finder-results" id="qb-finder-results">
                    ${renderAllObjections()}
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        document.getElementById('qb-objection-search')?.focus();
    }

    // Render all objections
    function renderAllObjections() {
        return Object.entries(OBJECTIONS_DATABASE).map(([key, obj]) => `
            <div class="qb-objection-result" data-keywords="${obj.objection.toLowerCase()} ${obj.category.toLowerCase()}">
                <span class="qb-result-category">${obj.category}</span>
                <p class="qb-result-text">"${obj.objection}"</p>
                <ul class="qb-result-responses">
                    ${obj.responses.slice(0, 2).map(r => `<li>${r}</li>`).join('')}
                </ul>
                <button class="qb-result-more" onclick="this.previousElementSibling.innerHTML = '${obj.responses.map(r => `<li>${r.replace(/'/g, "\\'")}</li>`).join('')}'; this.style.display = 'none'">Show all responses</button>
            </div>
        `).join('');
    }

    // Search objections
    function searchObjections(query) {
        const results = document.querySelectorAll('.qb-objection-result');
        const lowerQuery = query.toLowerCase();
        
        results.forEach(result => {
            const keywords = result.getAttribute('data-keywords');
            result.style.display = keywords.includes(lowerQuery) ? 'block' : 'none';
        });
    }

    // Expose globally
    window.QuoteBuilderObjections = {
        showObjectionPrep,
        startCall,
        showObjectionFinder,
        searchObjections,
        generatePreCallBriefing,
        OBJECTIONS_DATABASE
    };
})();
