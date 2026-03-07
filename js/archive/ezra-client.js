/**
 * Ezra Client AI Assistant
 * Client-facing interactive guide for HELOC quotes
 * 
 * Features:
 * - Modern glassmorphism UI
 * - Conversational quote walkthrough
 * - Educational content delivery
 * - Smart handoff to loan officers
 * - Context-aware responses
 */

(function() {
    'use strict';

    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        name: 'Ezra',
        avatar: '🤖',
        primaryColor: '#c5a059',
        secondaryColor: '#8b5cf6',
        position: 'bottom-right',
        welcomeDelay: 2000,
        typingSpeed: 30,
        maxMessages: 50
    };

    // ============================================
    // CONVERSATION STATE
    // ============================================
    let conversationState = {
        stage: 'welcome', // welcome, discovery, walkthrough, insights, handoff
        messages: [],
        userGoals: [],
        exploredSections: [],
        quoteData: null,
        loInfo: null,
        sessionId: generateSessionId(),
        startTime: Date.now()
    };

    // ============================================
    // ANALYTICS TRACKING
    // ============================================
    const Analytics = {
        events: [],
        
        track(eventType, data = {}) {
            const event = {
                type: eventType,
                timestamp: Date.now(),
                sessionId: conversationState.sessionId,
                data: data
            };
            this.events.push(event);
            
            // Store in localStorage for persistence
            this.saveEvents();
            
            // Log for debugging (remove in production)
            console.log('[Ezra Analytics]', eventType, data);
            
            // Send to parent window if embedded
            this.notifyParent(event);
        },
        
        saveEvents() {
            try {
                const key = 'ezra_analytics_' + conversationState.sessionId;
                localStorage.setItem(key, JSON.stringify(this.events));
            } catch (e) {
                console.warn('Failed to save analytics:', e);
            }
        },
        
        notifyParent(event) {
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: 'ezra_analytics',
                    event: event
                }, '*');
            }
        },
        
        getSummary() {
            const summary = {
                sessionId: conversationState.sessionId,
                duration: Date.now() - conversationState.startTime,
                totalEvents: this.events.length,
                messagesExchanged: conversationState.messages.length,
                userGoals: conversationState.userGoals,
                exploredSections: conversationState.exploredSections,
                conversationFlow: this.events.filter(e => e.type === 'message_sent').map(e => ({
                    stage: e.data.stage,
                    hasChips: e.data.hasChips
                })),
                chipClicks: this.events.filter(e => e.type === 'chip_clicked').map(e => ({
                    label: e.data.label,
                    value: e.data.value,
                    timestamp: e.timestamp
                })),
                dropOffPoint: this.getDropOffPoint()
            };
            return summary;
        },
        
        getDropOffPoint() {
            const messages = this.events.filter(e => e.type === 'message_sent');
            if (messages.length === 0) return null;
            
            const lastMessage = messages[messages.length - 1];
            const timeSinceLastMessage = Date.now() - lastMessage.timestamp;
            
            // If no activity for 5 minutes, consider dropped off
            if (timeSinceLastMessage > 300000) {
                return {
                    stage: lastMessage.data.stage,
                    timeSinceLastMessage: timeSinceLastMessage
                };
            }
            return null;
        },
        
        export() {
            return {
                sessionId: conversationState.sessionId,
                startTime: conversationState.startTime,
                endTime: Date.now(),
                quoteData: conversationState.quoteData,
                events: this.events,
                summary: this.getSummary()
            };
        }
    };

    function generateSessionId() {
        return 'ezra_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // ============================================
    // CONVERSATION SCRIPTS
    // ============================================
    const SCRIPTS = {
        welcome: {
            initial: (data, lo) => `Hi${data.clientName ? ' ' + data.clientName.split(' ')[0] : ''}! I'm **Ezra**, your AI guide to understanding this HELOC quote.

I'm here to help you explore your options and answer questions—though I'll always recommend speaking with **${lo.name || 'your loan officer'}** for final decisions.

What would you like to explore?`,
            chips: [
                { label: "What's a HELOC?", value: 'explain_heloc' },
                { label: 'Walk me through my quote', value: 'walkthrough' },
                { label: 'Compare my options', value: 'compare' },
                { label: 'I have a specific goal', value: 'goal_discovery' }
            ]
        },

        explain_heloc: {
            response: (data) => `A **HELOC** (Home Equity Line of Credit) lets you borrow against the equity you've built in your home.

**Think of it like this:**
• Your home is worth **${data.homeValue || '$XXX,XXX'}**
• You owe **${data.mortgageBalance || '$XXX,XXX'}** on your mortgage
• That difference is your **equity**—money you could potentially access

This quote is exploring how much of that equity you could tap into, and what it might cost you.

**Key difference from a credit card:** A HELOC is secured by your home, which typically means much better rates than the 20%+ you'd pay on cards.

Want to see what your specific numbers look like?`,
            chips: [
                { label: 'Show me my numbers', value: 'walkthrough' },
                { label: 'How does repayment work?', value: 'explain_repayment' },
                { label: 'What are the risks?', value: 'explain_risks' }
            ]
        },

        goal_discovery: {
            response: () => `I'd love to understand what you're hoping to achieve. This helps me explain the parts of your quote that matter most to **you**.

Are you looking to:`,
            chips: [
                { label: '💳 Consolidate debt', value: 'goal_debt' },
                { label: '🏠 Access cash for projects', value: 'goal_projects' },
                { label: '💰 Lower my payments', value: 'goal_lower_payment' },
                { label: '🛡️ Have emergency funds', value: 'goal_emergency' },
                { label: '📊 Something else', value: 'goal_other' }
            ]
        },

        goal_debt: {
            response: (data) => `Debt consolidation is one of the most popular uses for a HELOC—and often one of the smartest financially.

**Here's why:** Credit cards often charge 20%+ interest. This HELOC quote shows rates around **${data.rate || 'X.XX'}%**. On a ${data.helocAmount ? '$' + data.helocAmount.toLocaleString() : 'typical'} balance, that difference could save thousands in interest.

**What I'd want to understand:** Are you looking to:
• **Pay off debt faster** (same payment, less interest)
• **Lower your monthly payments** (more cash flow now)
• **Both** if possible`,
            chips: [
                { label: 'Pay off faster', value: 'strategy_faster' },
                { label: 'Lower payments', value: 'strategy_lower' },
                { label: 'Both', value: 'strategy_both' }
            ]
        },

        walkthrough: {
            sections: ['valuation', 'recommendation', 'options', 'next_steps'],
            currentSection: 0
        },

        compare: {
            response: (data) => `Great question! Let me break down what you're looking at:

**Fixed Rate (${data.rate || 'X.XX'}%)**
• Your payment stays exactly the same
• No surprises, ever
• Good if you value predictability

**Variable Rate (starts lower)**
• Payment can change over time
• Usually starts lower than fixed
• Good if you plan to pay off quickly

**Which sounds more like your style?**`,
            chips: [
                { label: 'I prefer predictable', value: 'prefer_fixed' },
                { label: 'I can handle some change', value: 'prefer_variable' },
                { label: 'Show me the numbers', value: 'show_numbers' }
            ]
        },

        // NEW SCENARIO A: Shopping Around
        shopping_around: {
            response: (data, lo) => `Smart approach—comparing options is always wise. Here's what makes this program different from traditional HELOCs you might see elsewhere:

**What stands out:**
• **Soft credit check first** — See your actual offers with no impact to your credit score
• **Multiple structures** — You choose between fixed and variable, not just what's offered
• **AI-assisted underwriting** — Faster decisions, often as quick as 5 days
• **Transparent pricing** — No hidden fees or surprise rate adjustments

**The key difference:** Most lenders do a hard pull just to show you rates. Here, you see real offers first, then decide if you want to move forward.

What matters most to you in a lender—**rate, speed, flexibility, or something else?**`,
            chips: [
                { label: 'Lowest rate', value: 'priority_rate' },
                { label: 'Fastest closing', value: 'priority_speed' },
                { label: 'Flexibility', value: 'priority_flexibility' },
                { label: 'Trust/reputation', value: 'priority_trust' }
            ]
        },

        priority_rate: {
            response: () => `Fair priority—rate definitely matters. A few things to consider:

**This quote shows:**
• Fixed rates starting around the mid-7% range
• Variable rates starting lower, but can adjust
• No points or origination fees hidden in the fine print

**But here's what I'd ask:** Is the lowest rate today more important, or would you prefer a rate that stays predictable? A variable rate might start 0.5% lower, but a fixed rate gives you certainty for 15-30 years.

Also, some lenders advertise teaser rates that jump after 6 months. These are fully disclosed fixed rates for the full term.

What's your preference—**lowest possible start, or most predictable long-term?**`,
            chips: [
                { label: 'Lowest start (variable)', value: 'prefer_variable' },
                { label: 'Predictable (fixed)', value: 'prefer_fixed' },
                { label: 'Show me both', value: 'compare' }
            ]
        },

        priority_speed: {
            response: () => `Got it—timing is critical. Here's the realistic timeline:

**Fast-track path (as quick as 5 days):**
• Day 1: Submit application + soft credit check
• Day 2-3: AI underwriting + income verification
• Day 4: Final approval + doc prep
• Day 5: Close and fund

**What makes it fast:**
• Digital income verification (no hunting for pay stubs)
• AI-assisted underwriting (not sitting in a queue)
• E-signing (no scheduling conflicts)

**What could slow it down:**
• Complex income (self-employed, multiple sources)
• Property issues (title complications, appraisals)
• Documentation delays

Is your timeline driven by a specific deadline—**paying off high-interest debt, a project start date, or something else?**`,
            chips: [
                { label: 'Paying off debt', value: 'goal_debt' },
                { label: 'Project deadline', value: 'goal_projects' },
                { label: 'Investment opportunity', value: 'goal_investment' },
                { label: 'Just exploring', value: 'goal_other' }
            ]
        },

        // NEW SCENARIO B: Need Money Fast
        need_money_fast: {
            response: () => `I understand—sometimes you need access to funds quickly. Let me give you the straight answer on timing:

**Best-case scenario: 5 days**
This happens when:
• Your credit is strong (720+)
• Income is straightforward (W-2, steady job)
• Property is your primary residence
• You respond quickly to any requests

**More typical: 7-10 days**
Most clients fall here. Still much faster than traditional HELOCs (which often take 30-45 days).

**What could add time:**
• Self-employment income (needs more verification)
• Investment property (different guidelines)
• Credit challenges (may need additional review)
• Appraisal required (depends on property/value)

**The good news:** The soft credit check happens instantly, so you'll know if you're pre-qualified within minutes, not days.

What's driving your timeline?`,
            chips: [
                { label: 'Paying off high-interest debt', value: 'goal_debt' },
                { label: 'Home renovation starting', value: 'goal_projects' },
                { label: 'Investment opportunity', value: 'goal_investment' },
                { label: 'Emergency expense', value: 'goal_emergency' }
            ]
        },

        goal_investment: {
            response: () => `Investment opportunities often have windows, so speed makes sense. A couple of considerations:

**HELOC for investments can work well when:**
• The returns exceed your borrowing cost (rates in the 7-8% range)
• You have a clear exit strategy
• You're comfortable with the risk

**Important to know:** This HELOC is secured by your primary residence, not the investment property. So you're using home equity to fund investments—a strategy that can work, but carries risk.

**Questions to consider:**
• What's the expected return on the investment?
• How liquid is it if you need to exit?
• Can you handle the payments if the investment underperforms?

This is definitely a conversation for you and ${lo.name || 'your loan officer'} to dig into the specifics. They can help you model different scenarios.

Would you like to **schedule a call** to discuss the numbers?`,
            chips: [
                { label: '📅 Schedule a call', value: 'action_schedule' },
                { label: 'Tell me more about risks', value: 'explain_risks' },
                { label: 'What are my other options?', value: 'compare' }
            ]
        },

        // NEW SCENARIO C: Not Sure If Qualify
        not_sure_qualify: {
            response: (data) => `Totally normal—qualification can feel mysterious, but it's actually pretty straightforward. Let me break down where you stand:

**Your numbers:**
• Home value: **${data.homeValue || '$XXX,XXX'}**
• Current mortgage: **${data.mortgageBalance || '$XXX,XXX'}**
• Requested HELOC: **${data.helocAmount || '$XXX,XXX'}**
• Combined loan-to-value: **${data.cltv || 'XX'}%**

**The 85% rule:** Most programs allow you to borrow up to 85% of your home's value across all loans. You're at ${data.cltv || 'XX'}%, which ${parseFloat(data.cltv) <= 85 ? '**puts you in the qualifying range**' : 'may need a different structure'}.

**Credit score tiers:**
• 740+: Best rates (Tier 1)
• 700-739: Good rates (Tier 2) 
• 660-699: Standard rates (Tier 3)
• Below 660: May need review

**The beauty of this process:** You can see your actual offers with just a **soft credit check**—no impact to your score, no commitment.

What's your biggest concern about qualifying?`,
            chips: [
                { label: 'My credit score', value: 'concern_credit' },
                { label: 'My income/employment', value: 'concern_income' },
                { label: 'Too much debt already', value: 'concern_dti' },
                { label: 'Property type', value: 'concern_property' }
            ]
        },

        concern_credit: {
            response: () => `Credit score worries are common, and here's the good news: this program works with a range of scores.

**What you need to know:**
• **720+**: Best available rates (Tier 1)
• **700-739**: Still very competitive (Tier 2)
• **660-699**: Standard pricing (Tier 3)
• **620-659**: May still qualify with review
• **Below 620**: Let's talk—other options may exist

**The soft credit check is your friend:** You can see your actual offers without any hard inquiry. If you don't like what you see, no harm done—your score stays untouched.

**Quick tip:** If you're close to a tier boundary (like 698 or 738), even a small score improvement could save you thousands. ${lo.name || 'Your loan officer'} can advise if it's worth waiting.

Want to **see your actual offers** with no obligation?`,
            chips: [
                { label: 'Yes, show me my offers', value: 'action_apply' },
                { label: 'How can I improve my score?', value: 'explain_credit_improvement' },
                { label: 'Talk to loan officer first', value: 'action_schedule' }
            ]
        },

        concern_income: {
            response: () => `Income verification has gotten much more sophisticated—and that's actually good news for borrowers.

**How it works now:**
• **W-2 employees:** Connect your bank account securely, income is verified digitally. No hunting for pay stubs.
• **Self-employed:** The system analyzes deposits and patterns. Still straightforward, just takes a bit longer.
• **Variable income (commission, bonuses):** Averages over time, looks at consistency.

**What they're looking for:**
• Stability (consistent income)
• Sufficiency (enough to cover the new payment)
• Documentation (digital verification is usually enough)

**Self-employed?** You'll likely need 2 years of history, but the verification is mostly automated now—not the paper chase it used to be.

What's your employment situation?`,
            chips: [
                { label: 'W-2 employee', value: 'income_w2' },
                { label: 'Self-employed', value: 'income_self' },
                { label: 'Part-time/multiple jobs', value: 'income_variable' },
                { label: 'Retired', value: 'income_retired' }
            ]
        },

        income_w2: {
            response: () => `Perfect—W-2 income is the simplest to verify. Here's what to expect:

**Verification process:**
• Connect your bank account through a secure portal (bank-grade encryption)
• System identifies your direct deposits automatically
• Usually takes just a few minutes

**What you'll need:**
• Last 30 days of pay stubs (as backup, may not be needed)
• W-2 from last year
• Bank statements if requested

**Timeline advantage:** W-2 verification is fastest, which helps with that 5-day funding possibility.

Since you're W-2, the main factors are:
• How long at your current job?
• Any recent job changes?

This is looking straightforward. Want to **see your actual offers**?`,
            chips: [
                { label: 'Yes, let me apply', value: 'action_apply' },
                { label: 'I have more questions', value: 'action_question' },
                { label: 'Schedule a call first', value: 'action_schedule' }
            ]
        },

        income_self: {
            response: () => `Self-employed? You're in good company—this program handles self-employed borrowers regularly.

**What to expect:**
• **2 years of tax returns** typically required
• **Bank statement analysis** to verify income consistency
• **Slightly longer timeline** (7-10 days vs 5 days)
• **More documentation** but mostly automated now

**The good news:** The AI underwriting system is designed to look at cash flow patterns, not just tax return line items. This often works in your favor.

**Pro tip:** If you've been self-employed less than 2 years but have strong bank deposits, it's worth a conversation. ${lo.name || 'Your loan officer'} can review your specific situation.

Want to **schedule a quick call** to review your income documentation before applying?`,
            chips: [
                { label: '📅 Schedule a call', value: 'action_schedule' },
                { label: 'What docs will I need?', value: 'explain_docs_self' },
                { label: 'Start application anyway', value: 'action_apply' }
            ]
        },

        handoff: {
            response: (lo) => `I hope this helped you understand your options! 

The next step would be to discuss this with **${lo.name || 'your loan officer'}**, who can:
• Answer specific questions about your situation
• Confirm these numbers based on your full profile
• Help you decide on the best path forward
• Walk you through the application if you're ready`,
            chips: [
                { label: '📅 Schedule a call', value: 'action_schedule' },
                { label: '💬 Ask a question', value: 'action_question' },
                { label: '📄 Download my quote', value: 'action_download' },
                { label: '🚀 Start application', value: 'action_apply' }
            ]
        }
    };

    // ============================================
    // UI COMPONENTS
    // ============================================
    function createWidget() {
        const widget = document.createElement('div');
        widget.id = 'ezra-client-widget';
        widget.innerHTML = `
            <style>
                #ezra-client-widget {
                    position: fixed;
                    bottom: 100px;
                    right: 20px;
                    z-index: 10000;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                }
                
                .ezra-fab {
                    width: 60px;
                    height: 60px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, ${CONFIG.primaryColor}, #a68543);
                    border: none;
                    cursor: pointer;
                    box-shadow: 0 4px 20px rgba(197, 160, 89, 0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 28px;
                    transition: all 0.3s ease;
                    position: relative;
                }
                
                .ezra-fab:hover {
                    transform: scale(1.05);
                    box-shadow: 0 6px 30px rgba(197, 160, 89, 0.5);
                }
                
                .ezra-fab.pulse {
                    animation: ezraPulse 2s infinite;
                }
                
                @keyframes ezraPulse {
                    0%, 100% { box-shadow: 0 4px 20px rgba(197, 160, 89, 0.4); }
                    50% { box-shadow: 0 4px 30px rgba(197, 160, 89, 0.7); }
                }
                
                .ezra-chat {
                    position: absolute;
                    bottom: 75px;
                    right: 0;
                    width: 380px;
                    max-width: calc(100vw - 40px);
                    height: 600px;
                    max-height: calc(100vh - 200px);
                    background: rgba(30, 41, 59, 0.98);
                    backdrop-filter: blur(20px);
                    border-radius: 20px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    box-shadow: 0 25px 50px rgba(0, 0, 0, 0.5);
                    display: none;
                    flex-direction: column;
                    overflow: hidden;
                }
                
                .ezra-chat.open {
                    display: flex;
                    animation: ezraSlideIn 0.3s ease;
                }
                
                @keyframes ezraSlideIn {
                    from { opacity: 0; transform: translateY(20px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                
                .ezra-header {
                    padding: 20px;
                    background: linear-gradient(135deg, rgba(197, 160, 89, 0.2), rgba(139, 92, 246, 0.1));
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                    display: flex;
                    align-items: center;
                    gap: 12px;
                }
                
                .ezra-avatar {
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, ${CONFIG.primaryColor}, ${CONFIG.secondaryColor});
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 22px;
                    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
                }
                
                .ezra-avatar.thinking {
                    animation: ezraThink 1.5s ease-in-out infinite;
                }
                
                @keyframes ezraThink {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                }
                
                .ezra-title {
                    flex: 1;
                }
                
                .ezra-title h3 {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 700;
                    color: white;
                    font-family: 'DM Sans', sans-serif;
                }
                
                .ezra-title span {
                    font-size: 12px;
                    color: rgba(255, 255, 255, 0.6);
                }
                
                .ezra-close {
                    background: none;
                    border: none;
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 24px;
                    cursor: pointer;
                    padding: 4px;
                    transition: color 0.2s;
                }
                
                .ezra-close:hover {
                    color: white;
                }
                
                .ezra-messages {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 16px;
                }
                
                .ezra-message {
                    max-width: 85%;
                    padding: 14px 18px;
                    border-radius: 18px;
                    font-size: 14px;
                    line-height: 1.6;
                    animation: ezraMessageIn 0.3s ease;
                }
                
                @keyframes ezraMessageIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                
                .ezra-message.bot {
                    align-self: flex-start;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    color: rgba(255, 255, 255, 0.95);
                    border-bottom-left-radius: 4px;
                }
                
                .ezra-message.user {
                    align-self: flex-end;
                    background: linear-gradient(135deg, ${CONFIG.primaryColor}, #a68543);
                    color: #0f172a;
                    font-weight: 500;
                    border-bottom-right-radius: 4px;
                }
                
                .ezra-message strong {
                    color: ${CONFIG.primaryColor};
                    font-weight: 600;
                }
                
                .ezra-chips {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 8px;
                    margin-top: 12px;
                }
                
                .ezra-chip {
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    color: white;
                    padding: 8px 16px;
                    border-radius: 20px;
                    font-size: 13px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    font-family: 'DM Sans', sans-serif;
                    font-weight: 500;
                }
                
                .ezra-chip:hover {
                    background: rgba(197, 160, 89, 0.2);
                    border-color: ${CONFIG.primaryColor};
                    transform: translateY(-1px);
                }
                
                .ezra-typing {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 12px 16px;
                }
                
                .ezra-typing span {
                    width: 8px;
                    height: 8px;
                    background: ${CONFIG.primaryColor};
                    border-radius: 50%;
                    animation: ezraTyping 1.4s ease-in-out infinite;
                }
                
                .ezra-typing span:nth-child(2) { animation-delay: 0.2s; }
                .ezra-typing span:nth-child(3) { animation-delay: 0.4s; }
                
                @keyframes ezraTyping {
                    0%, 60%, 100% { transform: translateY(0); }
                    30% { transform: translateY(-10px); }
                }
                
                .ezra-input-area {
                    padding: 16px 20px;
                    border-top: 1px solid rgba(255, 255, 255, 0.05);
                    display: flex;
                    gap: 10px;
                }
                
                .ezra-input {
                    flex: 1;
                    background: rgba(0, 0, 0, 0.2);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 24px;
                    padding: 12px 18px;
                    color: white;
                    font-size: 14px;
                    outline: none;
                    transition: border-color 0.2s;
                }
                
                .ezra-input:focus {
                    border-color: ${CONFIG.primaryColor};
                }
                
                .ezra-input::placeholder {
                    color: rgba(255, 255, 255, 0.4);
                }
                
                .ezra-send {
                    width: 44px;
                    height: 44px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, ${CONFIG.primaryColor}, #a68543);
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 18px;
                    transition: transform 0.2s;
                }
                
                .ezra-send:hover {
                    transform: scale(1.05);
                }
                
                @media (max-width: 480px) {
                    #ezra-client-widget {
                        bottom: 80px;
                        right: 10px;
                    }
                    .ezra-chat {
                        width: calc(100vw - 20px);
                        right: -10px;
                        height: 70vh;
                    }
                }
            </style>
            
            <button class="ezra-fab pulse" id="ezra-toggle" title="Chat with Ezra">
                ${CONFIG.avatar}
            </button>
            
            <div class="ezra-chat" id="ezra-chat">
                <div class="ezra-header">
                    <div class="ezra-avatar" id="ezra-avatar">${CONFIG.avatar}</div>
                    <div class="ezra-title">
                        <h3>${CONFIG.name}</h3>
                        <span>Your HELOC Guide</span>
                    </div>
                    <button class="ezra-close" id="ezra-close">×</button>
                </div>
                
                <div class="ezra-messages" id="ezra-messages"></div>
                
                <div class="ezra-input-area">
                    <input type="text" class="ezra-input" id="ezra-input" placeholder="Ask me anything about your quote...">
                    <button class="ezra-send" id="ezra-send">➤</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(widget);
        return widget;
    }

    // ============================================
    // MESSAGE HANDLING
    // ============================================
    function addMessage(text, sender = 'bot', chips = []) {
        const container = document.getElementById('ezra-messages');
        if (!container) return;
        
        const message = document.createElement('div');
        message.className = `ezra-message ${sender}`;
        
        // Parse markdown-style formatting
        let formattedText = text
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
        
        message.innerHTML = formattedText;
        
        // Add chips if provided
        if (chips && chips.length > 0) {
            const chipsContainer = document.createElement('div');
            chipsContainer.className = 'ezra-chips';
            chips.forEach(chip => {
                const btn = document.createElement('button');
                btn.className = 'ezra-chip';
                btn.textContent = chip.label;
                btn.onclick = () => handleChipClick(chip);
                chipsContainer.appendChild(btn);
            });
            message.appendChild(chipsContainer);
        }
        
        container.appendChild(message);
        container.scrollTop = container.scrollHeight;
        
        // Store in conversation state
        conversationState.messages.push({ sender, text, chips });
        
        // Track analytics
        Analytics.track('message_sent', {
            sender: sender,
            stage: conversationState.stage,
            hasChips: chips.length > 0,
            messageLength: text.length
        });
    }

    function showTyping() {
        const container = document.getElementById('ezra-messages');
        if (!container) return;
        
        const typing = document.createElement('div');
        typing.className = 'ezra-message bot ezra-typing';
        typing.id = 'ezra-typing';
        typing.innerHTML = '<span></span><span></span><span></span>';
        container.appendChild(typing);
        container.scrollTop = container.scrollHeight;
        
        // Animate avatar
        const avatar = document.getElementById('ezra-avatar');
        if (avatar) avatar.classList.add('thinking');
    }

    function hideTyping() {
        const typing = document.getElementById('ezra-typing');
        if (typing) typing.remove();
        
        const avatar = document.getElementById('ezra-avatar');
        if (avatar) avatar.classList.remove('thinking');
    }

    // ============================================
    // CONVERSATION LOGIC
    // ============================================
    async function sendBotResponse(responseKey, data = {}) {
        showTyping();
        
        // Simulate thinking time
        await new Promise(r => setTimeout(r, 800 + Math.random() * 1000));
        
        hideTyping();
        
        const script = SCRIPTS[responseKey];
        if (!script) return;
        
        let text, chips;
        
        if (typeof script.response === 'function') {
            text = script.response(data);
        } else {
            text = script.response || script.initial(data, conversationState.loInfo);
        }
        
        chips = script.chips || [];
        
        addMessage(text, 'bot', chips);
    }

    function handleChipClick(chip) {
        addMessage(chip.label, 'user');
        
        // Track chip click analytics
        Analytics.track('chip_clicked', {
            label: chip.label,
            value: chip.value,
            stage: conversationState.stage
        });
        
        // Track user goals
        if (chip.value.startsWith('goal_')) {
            conversationState.userGoals.push(chip.value);
        }
        
        // Route to appropriate response
        const route = chip.value;
        if (SCRIPTS[route]) {
            sendBotResponse(route, conversationState.quoteData);
        } else {
            handleCustomIntent(route);
        }
    }

    function handleCustomIntent(intent) {
        // Handle specific intents
        switch(intent) {
            case 'strategy_faster':
                addMessage('Based on wanting to pay off debt faster, the **15-year fixed** program in your quote could be a strong fit. It has a higher monthly payment than the 30-year, but you\'d be debt-free in half the time and pay far less interest overall.', 'bot', [
                    { label: 'Show me the 15-year numbers', value: 'show_15yr' },
                    { label: 'How does it compare to 30-year?', value: 'compare_15_30' },
                    { label: 'Talk to ' + (conversationState.loInfo?.name || 'my LO'), value: 'handoff' }
                ]);
                break;
            case 'strategy_lower':
                addMessage('For lower monthly payments, the **30-year fixed** in your quote would give you the most breathing room. You\'d pay more interest over time, but your monthly payment would be significantly lower than the shorter terms.', 'bot', [
                    { label: 'Show me the 30-year numbers', value: 'show_30yr' },
                    { label: 'What\'s the payment difference?', value: 'payment_comparison' },
                    { label: 'Talk to ' + (conversationState.loInfo?.name || 'my LO'), value: 'handoff' }
                ]);
                break;
            case 'handoff':
            case 'action_schedule':
            case 'action_question':
                sendBotResponse('handoff', conversationState.quoteData);
                break;
            default:
                addMessage('That\'s a great question. Let me connect you with ' + (conversationState.loInfo?.name || 'your loan officer') + ' who can give you specific guidance on that.', 'bot', [
                    { label: 'Schedule a call', value: 'action_schedule' },
                    { label: 'Send a message', value: 'action_question' }
                ]);
        }
    }

    function handleUserInput(text) {
        if (!text.trim()) return;
        
        addMessage(text, 'user');
        
        // Track user input analytics
        Analytics.track('user_input', {
            text: text.substring(0, 100), // Truncate for privacy
            length: text.length,
            stage: conversationState.stage
        });
        
        // Simple intent detection
        const lower = text.toLowerCase();
        
        if (lower.includes('hello') || lower.includes('hi')) {
            sendBotResponse('welcome', conversationState.quoteData);
        } else if (lower.includes('what is') && lower.includes('heloc')) {
            sendBotResponse('explain_heloc', conversationState.quoteData);
        } else if (lower.includes('compare') || lower.includes('difference')) {
            sendBotResponse('compare', conversationState.quoteData);
        } else if (lower.includes('goal') || lower.includes('want') || lower.includes('looking')) {
            sendBotResponse('goal_discovery', conversationState.quoteData);
        } else if (lower.includes('debt') || lower.includes('consolidat')) {
            sendBotResponse('goal_debt', conversationState.quoteData);
        } else {
            // Generic response with handoff
            setTimeout(() => {
                addMessage('I want to make sure I give you accurate information. Let me connect you with ' + (conversationState.loInfo?.name || 'your loan officer') + ' who can address that specific question.', 'bot', [
                    { label: 'Schedule a call', value: 'action_schedule' },
                    { label: 'Ask a question', value: 'action_question' },
                    { label: 'Keep exploring', value: 'goal_discovery' }
                ]);
            }, 500);
        }
    }

    // ============================================
    // INITIALIZATION
    // ============================================
    function init(quoteData, loInfo) {
        conversationState.quoteData = quoteData;
        conversationState.loInfo = loInfo;
        
        const widget = createWidget();
        
        // Event listeners
        document.getElementById('ezra-toggle').onclick = () => {
            const chat = document.getElementById('ezra-chat');
            const isOpening = !chat.classList.contains('open');
            chat.classList.toggle('open');
            document.getElementById('ezra-toggle').classList.remove('pulse');
            
            // Track open/close
            Analytics.track(isOpening ? 'widget_opened' : 'widget_closed', {
                messageCount: conversationState.messages.length,
                stage: conversationState.stage
            });
            
            // Start conversation if first open
            if (isOpening && conversationState.messages.length === 0) {
                Analytics.track('conversation_started', {
                    quoteData: quoteData
                });
                setTimeout(() => {
                    sendBotResponse('welcome', quoteData);
                }, 500);
            }
        };
        
        document.getElementById('ezra-close').onclick = () => {
            document.getElementById('ezra-chat').classList.remove('open');
            Analytics.track('widget_closed', {
                messageCount: conversationState.messages.length,
                stage: conversationState.stage
            });
        };
        
        document.getElementById('ezra-send').onclick = () => {
            const input = document.getElementById('ezra-input');
            handleUserInput(input.value);
            input.value = '';
        };
        
        document.getElementById('ezra-input').onkeypress = (e) => {
            if (e.key === 'Enter') {
                document.getElementById('ezra-send').click();
            }
        };
        
        // Auto-open after delay (optional)
        // setTimeout(() => {
        //     document.getElementById('ezra-toggle').click();
        // }, CONFIG.welcomeDelay);
    }

    // Expose to global scope
    window.EzraClient = { 
        init,
        analytics: Analytics,
        getState: () => conversationState,
        getSummary: () => Analytics.getSummary(),
        export: () => Analytics.export()
    };

})();
