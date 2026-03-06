/**
 * Ezra AI Loan Structuring Assistant
 * Chat Widget Module
 * 
 * Features:
 * - Floating chat widget UI
 * - Supabase integration for conversation history
 * - AI model routing (Gemini, Claude, GPT)
 * - UI auto-fill for quote fields
 * - Quick command buttons
 */

(function () {
    'use strict';

    // ============================================
    // EZRA MASTER PROMPT — AI LOAN STRUCTURING ENGINE
    // Created by Eddie Barragan — Above All CRM
    // ============================================

    // Payment calculation functions (app-side math, not LLM)
    function calcAmortizedPayment(loanAmount, annualRatePct, years) {
        const r = annualRatePct / 100 / 12;
        const n = years * 12;
        if (r === 0) return +(loanAmount / n).toFixed(2);
        return +((loanAmount * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)).toFixed(2);
    }
    function calcInterestOnlyPayment(loanAmount, annualRatePct) {
        return +(loanAmount * (annualRatePct / 100) / 12).toFixed(2);
    }
    function calcCLTV(firstMortgage, helocAmount, propertyValue) {
        if (!propertyValue) return 0;
        return +(((firstMortgage + helocAmount) / propertyValue) * 100).toFixed(2);
    }

    // HELOC Product definitions — single source of truth
    const HELOC_PROGRAMS = {
        fixed: [
            { name: '5 Year Fixed HELOC', term: 5, draw: 2, type: 'principal_and_interest' },
            { name: '10 Year Fixed HELOC', term: 10, draw: 3, type: 'principal_and_interest' },
            { name: '15 Year Fixed HELOC', term: 15, draw: 4, type: 'principal_and_interest' },
            { name: '30 Year Fixed HELOC', term: 30, draw: 5, type: 'principal_and_interest' }
        ],
        variable: [
            { name: '10 Year Variable HELOC', drawPeriod: 10, repayment: 20, type: 'interest_only_draw' },
            { name: '5 Year Draw HELOC', drawPeriod: 5, repayment: 15, type: 'interest_only_draw' }
        ]
    };

    // ============================================
    // FORM CONTEXT — Read live data from the quote tool
    // ============================================
    function getFormContext() {
        const val = (id) => {
            const el = document.getElementById(id);
            if (!el) return '';
            return el.value || '';
        };
        const num = (id) => {
            const v = parseFloat(val(id));
            return isNaN(v) ? 0 : v;
        };

        const homeValue = num('in-home-value');
        const mortgageBalance = num('in-mortgage-balance');
        const helocAmount = num('in-net-cash');
        const clientName = val('in-client-name');
        const creditScore = val('in-client-credit');
        const occupancy = val('in-property-type');

        // Read best available rate from tier 2 (the recommended tier)
        const getRate = (id) => {
            const el = document.getElementById(id);
            if (!el) return 0;
            // Check manual override first
            const manual = document.getElementById(id + '-manual');
            if (manual && manual.style.display !== 'none' && manual.value) return parseFloat(manual.value) || 0;
            // Then select value
            return parseFloat(el.value) || 0;
        };

        const rates = {
            fixed30: getRate('t2-30-rate'),
            fixed20: getRate('t2-20-rate'),
            fixed15: getRate('t2-15-rate'),
            fixed10: getRate('t2-10-rate'),
            var30: getRate('t2-30-var'),
            var20: getRate('t2-20-var'),
            var15: getRate('t2-15-var'),
            var10: getRate('t2-10-var')
        };

        const origFee = num('t2-orig'); // percentage

        // Compute CLTV
        const cltv = homeValue > 0 ? (((mortgageBalance + helocAmount) / homeValue) * 100) : 0;

        // Available equity
        const maxEquity85 = homeValue > 0 ? (homeValue * 0.85) - mortgageBalance : 0;

        return {
            clientName: clientName || 'Borrower',
            creditScore: creditScore || 'Not provided',
            homeValue,
            mortgageBalance,
            helocAmount,
            occupancy: occupancy || 'Primary Residence',
            cltv: +cltv.toFixed(2),
            maxEquityAt85: Math.max(0, +maxEquity85.toFixed(0)),
            rates,
            origFee,
            hasFormData: homeValue > 0 || helocAmount > 0 || clientName.length > 0
        };
    }

    // Parse inline deal details from a chat message and merge with form context
    function parseMessageContext(message, formCtx) {
        const ctx = { ...formCtx };
        const lower = message.toLowerCase();

        // Parse dollar amounts like "$800K", "$400,000", "$100k"
        const dollarPattern = /\$([0-9,.]+)\s*(k|K|m|M)?\s*(property|home|house|value|prop)?/g;
        const amounts = [];
        let m;
        while ((m = dollarPattern.exec(message)) !== null) {
            let val = parseFloat(m[1].replace(/,/g, ''));
            if (m[2] && m[2].toLowerCase() === 'k') val *= 1000;
            if (m[2] && m[2].toLowerCase() === 'm') val *= 1000000;
            amounts.push({ val, label: (m[3] || '').toLowerCase() });
        }

        // Try to assign by label first
        for (const a of amounts) {
            if (/property|home|house|value/.test(a.label)) ctx.homeValue = a.val;
        }

        // Then by context keywords in the message
        const mortMatch = lower.match(/\$([0-9,.]+)\s*(k|m)?\s*(mortgage|loan|owe|balance|1st|first)/i);
        if (mortMatch) {
            let val = parseFloat(mortMatch[1].replace(/,/g, ''));
            if (mortMatch[2] && mortMatch[2].toLowerCase() === 'k') val *= 1000;
            if (mortMatch[2] && mortMatch[2].toLowerCase() === 'm') val *= 1000000;
            ctx.mortgageBalance = val;
        }

        const helocMatch = lower.match(/\$([0-9,.]+)\s*(k|m)?\s*(heloc|cash|equity|draw|need|want|access)/i);
        if (helocMatch) {
            let val = parseFloat(helocMatch[1].replace(/,/g, ''));
            if (helocMatch[2] && helocMatch[2].toLowerCase() === 'k') val *= 1000;
            if (helocMatch[2] && helocMatch[2].toLowerCase() === 'm') val *= 1000000;
            ctx.helocAmount = val;
        }

        // If we found inline numbers but form is empty, use them
        if (!ctx.hasFormData && amounts.length >= 2) {
            // Heuristic: largest = property, smallest = HELOC, middle = mortgage
            const sorted = amounts.map(a => a.val).sort((a, b) => b - a);
            if (!ctx.homeValue && sorted[0]) ctx.homeValue = sorted[0];
            if (!ctx.mortgageBalance && sorted[1]) ctx.mortgageBalance = sorted[1];
            if (!ctx.helocAmount && sorted[2]) ctx.helocAmount = sorted[2];
        }

        // Parse name from message
        const nameMatch = message.match(/(?:for|client|borrower)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
        if (nameMatch && ctx.clientName === 'Borrower') {
            ctx.clientName = nameMatch[1];
        }

        // Parse credit score
        const scoreMatch = message.match(/(\d{3})\s*(?:score|credit|fico)/i);
        if (scoreMatch) ctx.creditScore = scoreMatch[1];

        // Recalculate derived values
        if (ctx.homeValue > 0 && ctx.helocAmount > 0) {
            ctx.cltv = +(((ctx.mortgageBalance + ctx.helocAmount) / ctx.homeValue) * 100).toFixed(2);
            ctx.maxEquityAt85 = Math.max(0, +(ctx.homeValue * 0.85 - ctx.mortgageBalance).toFixed(0));
            ctx.hasFormData = true;
        }

        return ctx;
    }

    // ============================================
    // FORM SNAPSHOT — Save/Restore for Undo
    // ============================================
    let _formSnapshot = null;

    function snapshotForm() {
        const fields = [
            'in-client-name', 'in-client-credit', 'in-home-value', 'in-mortgage-balance',
            'in-net-cash', 'in-property-type',
            't1-orig', 't2-orig', 't3-orig'
        ];
        // All rate manual fields
        ['t1', 't2', 't3'].forEach(t => {
            [30, 20, 15, 10].forEach(term => {
                fields.push(t + '-' + term + '-rate-manual');
                fields.push(t + '-' + term + '-var-manual');
            });
        });

        const snap = {};
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) snap[id] = el.value;
        });
        // Also capture manual rates toggle state
        const toggle = document.getElementById('toggle-manual-rates');
        snap._manualRatesActive = toggle ? toggle.classList.contains('active') : false;
        _formSnapshot = snap;
    }

    function restoreForm() {
        if (!_formSnapshot) return false;
        const snap = _formSnapshot;

        // Restore manual rates toggle first
        const toggle = document.getElementById('toggle-manual-rates');
        if (toggle) {
            const isActive = toggle.classList.contains('active');
            if (snap._manualRatesActive && !isActive) toggle.click();
            else if (!snap._manualRatesActive && isActive) toggle.click();
        }

        Object.entries(snap).forEach(([id, value]) => {
            if (id.startsWith('_')) return; // skip internal keys
            const el = document.getElementById(id);
            if (el) {
                el.value = value;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }
        });

        if (typeof updateQuote === 'function') setTimeout(updateQuote, 50);
        if (typeof autoSave === 'function') setTimeout(autoSave, 200);
        _formSnapshot = null;
        if (typeof showToast === 'function') showToast('Quote fields restored to previous state', 'info');
        return true;
    }

    // ============================================
    // LENDER PORTAL PASTE PARSER (Figure, etc.)
    // ============================================
    // Detects Ctrl+A paste from Figure's Lead Portal and extracts structured data.
    //
    // Real paste format (newline-separated, with UI chrome mixed in):
    //   ...Cash amount\n157,156\n...\n$24,631\n\n$162,560\n\n
    //   Origination Fee\n...\n1.50%\n$2,358\n\n2.99%\n$4,699\n\n4.99%\n$7,843\n\n
    //   ...Fixed Rate\n\n\n\n$1,210/month\n\n8.35%\n\n30yr fixed\n\nSelect\n\n...
    //   Variable Rate\n\n...\n$1,210/month\n\nStarting at 8.35%\n\n30yr variable\n\nSelect\n\n...
    //   ...Initial Draw Amount\n$157,156\nCash required at closing\n$0\n...
    function parseLenderPortalData(message) {
        // Detect Figure portal paste: look for key signatures
        const hasFixedRate = /fixed\s*rate/i.test(message);
        const hasVariableRate = /variable\s*rate/i.test(message);
        const hasOriginationFee = /origination\s*fee/i.test(message);
        const hasCashAmount = /cash\s*amount/i.test(message);
        const hasMonthPayment = /\$[\d,]+\s*\/\s*month/i.test(message);
        const hasFigureSignature = /powered\s*by\s*figure|lead\s*portal|new\s*heloc\s*inquiry/i.test(message);

        // Need at least 2 signals to identify as portal paste
        const signals = [hasFixedRate || hasVariableRate, hasOriginationFee, hasMonthPayment, hasCashAmount, hasFigureSignature].filter(Boolean).length;
        if (signals < 2) return null;

        const result = {
            source: 'figure_portal',
            cashAmount: 0,
            initialDrawAmount: 0,
            totalLoanAmount: 0,
            tiers: [],
            hasVariableRates: false
        };

        // --- Extract cash/draw amounts ---
        // "Cash amount\n157,156" or "Cash amount\n157,156\nSelect the amount..."
        const cashMatch = message.match(/cash\s*amount[\s\S]*?([\d,]{4,})/i);
        if (cashMatch) result.cashAmount = parseFloat(cashMatch[1].replace(/,/g, ''));

        // "Initial Draw Amount\n$157,156"
        const drawMatch = message.match(/initial\s*draw\s*amount\s*\n?\s*\$?([\d,]+)/i);
        if (drawMatch) result.initialDrawAmount = parseFloat(drawMatch[1].replace(/,/g, ''));

        // Extract the two dollar amounts near cash amount: first mortgage payoff, total loan amount
        // Pattern: "$24,631\n\n$162,560" — these appear right after the cash amount display
        const cashSection = message.match(/cash\s*amount[\s\S]*?origination/i);
        if (cashSection) {
            const dollarAmounts = [];
            const dPattern = /\$([\d,]+)/g;
            let dm;
            while ((dm = dPattern.exec(cashSection[0])) !== null) {
                dollarAmounts.push(parseFloat(dm[1].replace(/,/g, '')));
            }
            // Figure shows: cash amount, then two summary numbers
            // The smaller is likely existing mortgage/payoff, the larger is total loan amount
            if (dollarAmounts.length >= 2) {
                const sorted = [...dollarAmounts].sort((a, b) => a - b);
                result.mortgagePayoff = sorted[0]; // Smaller: existing mortgage payoff or closing costs
                result.totalLoanAmount = sorted[sorted.length - 1]; // Larger: total loan amount
            }
        }

        // --- Extract origination fee tiers ---
        // Between "Origination Fee" and the first rate section, find "X.XX%\n$X,XXX" pairs
        const origSection = message.match(/origination\s*fee[\s\S]*?(?=fixed\s*rate|variable\s*rate|select\s*the\s*monthly)/i);
        const origFees = [];
        const origAmounts = [];
        if (origSection) {
            // Match "1.50%\n$2,358" patterns (pct followed by dollar amount)
            const origPairPattern = /(\d+\.\d+)\s*%\s*[\n\r\s]*\$?([\d,]+)/g;
            let om;
            while ((om = origPairPattern.exec(origSection[0])) !== null) {
                const pct = parseFloat(om[1]);
                const amt = parseFloat(om[2].replace(/,/g, ''));
                if (pct > 0 && pct < 10) {
                    origFees.push(pct);
                    origAmounts.push(amt);
                }
            }
        }

        // --- Parse rate blocks ---
        // Figure separates Fixed Rate and Variable Rate sections
        // Each entry looks like: "$1,210/month\n\n8.35%\n\n30yr fixed\n\nSelect"
        // or for variable: "$1,210/month\n\nStarting at 8.35%\n\n30yr variable\n\nSelect"

        // Flexible pattern: $amount/month ... rate% ... Nyr type
        // Allow any whitespace/newlines between parts
        const rateBlockPattern = /\$([\d,]+)\s*\/\s*month\s+(?:starting\s+at\s+)?(\d+\.?\d*)\s*%\s+(\d+)\s*yr\s*(fixed|variable)/gi;
        const rateEntries = [];
        let rm;
        while ((rm = rateBlockPattern.exec(message)) !== null) {
            rateEntries.push({
                payment: parseFloat(rm[1].replace(/,/g, '')),
                rate: parseFloat(rm[2]),
                term: parseInt(rm[3]),
                type: rm[4].toLowerCase()
            });
        }

        if (rateEntries.length === 0) return null;

        const fixedEntries = rateEntries.filter(r => r.type === 'fixed');
        const variableEntries = rateEntries.filter(r => r.type === 'variable');
        result.hasVariableRates = variableEntries.length > 0;

        // --- Map rates to tiers ---
        // Figure only shows ONE set of rates at a time (for the currently selected origination fee).
        // The user may paste with 1.50% selected, so we see rates for that tier only.
        // However, the origination fee section lists ALL available fee options.
        //
        // Strategy: assign the visible rates to the LOWEST origination fee tier (which is what
        // Figure defaults to), then create empty tiers for the others so origination fees still populate.
        // The LO can then tell Ezra the other tiers' rates conversationally.
        const sortedOrigs = [...origFees].sort((a, b) => b - a); // highest first = tier 1

        // Determine which origination fee the displayed rates belong to
        // The visible rates on Figure correspond to the lowest o-fee by default
        // But if the user selected a different one, we can't tell from paste alone.
        // Best guess: assign to the tier whose rate entries we see.
        // For now, create all tiers, assign rates to last (lowest o-fee = tier 3)
        if (sortedOrigs.length > 0) {
            for (let i = 0; i < sortedOrigs.length; i++) {
                const tier = {
                    origPct: sortedOrigs[i],
                    tierNum: i + 1,
                    fixed: {},
                    variable: {},
                    origAmount: origAmounts[origFees.indexOf(sortedOrigs[i])] || 0
                };
                // Assign rates to the last tier (lowest o-fee, which is Figure's default view)
                if (i === sortedOrigs.length - 1) {
                    fixedEntries.forEach(e => { tier.fixed[e.term] = e.rate; });
                    variableEntries.forEach(e => { tier.variable[e.term] = e.rate; });
                }
                result.tiers.push(tier);
            }
        } else {
            // No origination fees found — create single tier with rates
            const tier = { origPct: 0, tierNum: 1, fixed: {}, variable: {} };
            fixedEntries.forEach(e => { tier.fixed[e.term] = e.rate; });
            variableEntries.forEach(e => { tier.variable[e.term] = e.rate; });
            result.tiers.push(tier);
        }

        return result.tiers.length > 0 ? result : null;
    }

    // ============================================
    // CONVERSATIONAL RATE PARSER
    // ============================================
    // Handles natural language and voice-to-text rate input:
    //   "For the 4.99 origination fee category, the 30-year is 7.45%"
    //   "the 2.99 origination fee, 30 years is 7.85% for 20 years at 7.60"
    //   "For the 1.50 origination V, the 30-year rate is 8.35%" (voice artifact)
    function parseConversationalRates(message) {
        const result = { tiers: [], borrowerName: null, propertyValue: 0, mortgageBalance: 0, helocAmount: 0, creditScore: null, occupancy: null };

        // Extract borrower name — handles multiple patterns:
        //   "for Arturo Magallanes" / "borrower Arturo Magallanes"
        //   "for this borrower — Arturo Magallanes"
        //   "borrower — Arturo Magallanes" / "client: Arturo Magallanes"
        const nameMatch = message.match(/(?:for|client|borrower)\s+(?:(?:this\s+)?(?:borrower|client)\s*[—–\-:,]\s*)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/)
            || message.match(/[—–\-]\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s*[,.]/)
            || message.match(/(?:for|client|borrower)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/);
        if (nameMatch) result.borrowerName = nameMatch[1];

        // Extract dollar amounts with context keywords
        const propMatch = message.match(/\$?([\d,.]+)\s*(k|K|m|M)?\s*(?:property|home|house|value|prop)/);
        if (propMatch) {
            let v = parseFloat(propMatch[1].replace(/,/g, ''));
            if (propMatch[2] && propMatch[2].toLowerCase() === 'k') v *= 1000;
            if (propMatch[2] && propMatch[2].toLowerCase() === 'm') v *= 1000000;
            result.propertyValue = v;
        }
        const mortMatch = message.match(/\$?([\d,.]+)\s*(k|K|m|M)?\s*(?:mortgage|1st|first|owe|balance)/);
        if (mortMatch) {
            let v = parseFloat(mortMatch[1].replace(/,/g, ''));
            if (mortMatch[2] && mortMatch[2].toLowerCase() === 'k') v *= 1000;
            if (mortMatch[2] && mortMatch[2].toLowerCase() === 'm') v *= 1000000;
            result.mortgageBalance = v;
        }
        const helocMatch = message.match(/\$?([\d,.]+)\s*(k|K|m|M)?\s*(?:heloc|cash|equity|draw)/i);
        if (helocMatch) {
            let v = parseFloat(helocMatch[1].replace(/,/g, ''));
            if (helocMatch[2] && helocMatch[2].toLowerCase() === 'k') v *= 1000;
            if (helocMatch[2] && helocMatch[2].toLowerCase() === 'm') v *= 1000000;
            result.helocAmount = v;
        }
        const creditMatch = message.match(/(\d{3})\s*(?:score|credit|fico)/i);
        if (creditMatch) result.creditScore = creditMatch[1];

        // Detect occupancy
        if (/investment\s*(?:property)?/i.test(message)) result.occupancy = 'Investment Property';
        else if (/second\s*home|vacation/i.test(message)) result.occupancy = 'Second Home';

        // --- Split message into origination fee blocks ---
        // Match patterns like: "for the 4.99 origination fee category"
        //   "the 2.99 origination fee"
        //   "the 1.50 origination V" (voice artifact)
        //   "at 4.99% origination"
        //   "4.99 orig"
        // Split on these boundaries to get one text block per tier
        const splitPattern = /(?:for\s+(?:the\s+)?|at\s+(?:the\s+)?|the\s+)(\d+\.?\d*)\s*(?:%?\s*)?(?:origination|orig|o-?fee|fee\s*category|category|points?|pts)(?:\s*(?:fee|v|category|,|\.))?\s*/gi;

        // Collect all origination boundaries with their positions
        const origBoundaries = [];
        let splitMatch;
        while ((splitMatch = splitPattern.exec(message)) !== null) {
            const pct = parseFloat(splitMatch[1]);
            if (pct > 0 && pct < 10) {
                origBoundaries.push({ pct, endIndex: splitMatch.index + splitMatch[0].length });
            }
        }

        if (origBoundaries.length > 0) {
            for (let i = 0; i < origBoundaries.length; i++) {
                const start = origBoundaries[i].endIndex;
                const end = i + 1 < origBoundaries.length ? origBoundaries[i + 1].endIndex - origBoundaries[i + 1].pct.toString().length - 20 : message.length;
                const textBlock = message.substring(start, Math.max(start, end));
                const origPct = origBoundaries[i].pct;

                const tier = { origPct, fixed: {}, variable: {} };

                // --- Parse rates from this block ---
                // Patterns to match:
                //   "30-year is 7.45%" / "the 30-year is 7.45"
                //   "30yr 7.45" / "30 year rate is 7.45%"
                //   "for 20 years at 7.60" / "20 years 7.60"
                //   "30 years is 7.85%" / "for 30 years is 7.85"
                //   "the interest rate for the 30-year is 7.45%"
                //   "the 20-year, it's 7.20" / "the 15-year, it's 7.20"
                const ratePatterns = [
                    // "the 30-year is 7.45%" or "30-year is 7.45"
                    /(?:the\s+)?(\d+)\s*[-\s]?\s*(?:year|yr|y)(?:er|s)?\s*(?:rate\s*)?(?:is|=|:)\s*(\d+\.?\d*)%?/gi,
                    // "it's 7.20" after a term mention — handled via sequential parsing below
                    // "for 30 years is 7.85%" or "30 years at 7.60"
                    /(?:for\s+)?(\d+)\s*(?:year|yr|y)(?:er|s)?\s*(?:is|at|=|:)\s*(\d+\.?\d*)%?/gi,
                    // "for 20 years at 7.60"
                    /(?:for\s+)(\d+)\s*(?:year|yr|y)(?:er|s)?\s+(?:at\s+)?(\d+\.?\d*)%?/gi,
                    // "30yr fixed 7.45" or "30 year fixed at 7.45"
                    /(\d+)\s*[-\s]?\s*(?:year|yr|y)(?:er|s)?\s*(?:fixed|variable)?\s*(?:at\s+)?(\d+\.?\d*)%/gi
                ];

                const foundTerms = new Set();
                for (const pattern of ratePatterns) {
                    pattern.lastIndex = 0;
                    let pm;
                    while ((pm = pattern.exec(textBlock)) !== null) {
                        const term = parseInt(pm[1]);
                        const rate = parseFloat(pm[2]);
                        if ([5, 10, 15, 20, 30].includes(term) && rate > 0 && rate < 20 && !foundTerms.has(term)) {
                            tier.fixed[term] = rate;
                            foundTerms.add(term);
                        }
                    }
                }

                // Also try: "the 20-year, it's 7.20. For the 15-year, it's 7.20"
                const itIsPattern = /(\d+)\s*[-\s]?\s*(?:year|yr|y)(?:er|s)?\s*,?\s*it(?:'|')?s\s+(\d+\.?\d*)%?/gi;
                let itm;
                while ((itm = itIsPattern.exec(textBlock)) !== null) {
                    const term = parseInt(itm[1]);
                    const rate = parseFloat(itm[2]);
                    if ([5, 10, 15, 20, 30].includes(term) && rate > 0 && rate < 20 && !foundTerms.has(term)) {
                        tier.fixed[term] = rate;
                        foundTerms.add(term);
                    }
                }

                // Check for variable rates explicitly mentioned
                const varSection = textBlock.match(/variable[\s\S]*/i);
                if (varSection) {
                    const varPattern = /(\d+)\s*[-\s]?\s*(?:year|yr|y)(?:er|s)?\s*(?:variable\s*)?(?:rate\s*)?(?:is|at|=|:|\s)\s*(\d+\.?\d*)%?/gi;
                    let vm;
                    while ((vm = varPattern.exec(varSection[0])) !== null) {
                        const term = parseInt(vm[1]);
                        const rate = parseFloat(vm[2]);
                        if ([5, 10, 15, 20, 30].includes(term) && rate > 0 && rate < 20) {
                            tier.variable[term] = rate;
                        }
                    }
                }

                if (Object.keys(tier.fixed).length > 0 || Object.keys(tier.variable).length > 0) {
                    result.tiers.push(tier);
                }
            }
        }

        // --- Fallback: simpler inline patterns ---
        // "X.XX origination... 30-year is Y.YY"
        if (result.tiers.length === 0) {
            const simpleOrigPattern = /(\d+\.?\d*)\s*(?:%?\s*)?(?:origination|orig|o-?fee|fee\s*category|category|V)\s*[\s,.:]*(?:[\s\S]*?)(?:the\s+)?(\d+)\s*[-\s]?\s*(?:year|yr)\s*(?:[\s\S]*?)(\d+\.?\d*)%?/gi;
            let sm;
            while ((sm = simpleOrigPattern.exec(message)) !== null) {
                const origPct = parseFloat(sm[1]);
                const term = parseInt(sm[2]);
                const rate = parseFloat(sm[3]);
                if (origPct > 0 && origPct < 10 && [5, 10, 15, 20, 30].includes(term) && rate > 0 && rate < 20) {
                    let tier = result.tiers.find(t => t.origPct === origPct);
                    if (!tier) {
                        tier = { origPct, fixed: {}, variable: {} };
                        result.tiers.push(tier);
                    }
                    tier.fixed[term] = rate;
                }
            }
        }

        // Sort tiers: highest origination = tier 1
        result.tiers.sort((a, b) => b.origPct - a.origPct);
        result.tiers.forEach((t, i) => t.tierNum = i + 1);

        return result.tiers.length > 0 ? result : null;
    }

    // ============================================
    // APPLY MULTI-TIER DATA TO FORM
    // ============================================
    function applyMultiTierData(data) {
        // Snapshot current form state for undo
        snapshotForm();

        let appliedCount = 0;

        function setField(id, value) {
            const field = document.getElementById(id);
            if (!field) return false;
            field.value = value;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            appliedCount++;
            field.style.transition = 'background 0.3s';
            field.style.background = '#dcfce7';
            setTimeout(() => field.style.background = '', 1500);
            return true;
        }

        function setManualRate(baseId, rate) {
            const manualEl = document.getElementById(baseId + '-manual');
            const selectEl = document.getElementById(baseId);
            if (manualEl) {
                manualEl.value = rate.toFixed(2);
                manualEl.style.display = 'block';
                manualEl.dispatchEvent(new Event('input', { bubbles: true }));
                appliedCount++;
                manualEl.style.transition = 'background 0.3s';
                manualEl.style.background = '#dcfce7';
                setTimeout(() => manualEl.style.background = '', 1500);
            }
            if (selectEl) selectEl.style.display = 'none';
        }

        // Enable manual rates mode
        const toggle = document.getElementById('toggle-manual-rates');
        if (toggle && !toggle.classList.contains('active')) {
            toggle.click(); // Activate manual rates
        }

        // Set borrower fields
        if (data.borrowerName) setField('in-client-name', data.borrowerName);
        if (data.propertyValue) setField('in-home-value', data.propertyValue);
        if (data.mortgageBalance) setField('in-mortgage-balance', data.mortgageBalance);
        if (data.helocAmount || data.cashAmount) setField('in-net-cash', data.helocAmount || data.cashAmount);
        if (data.creditScore) setField('in-client-credit', data.creditScore);
        if (data.occupancy) {
            const occEl = document.getElementById('in-property-type');
            if (occEl) {
                for (const opt of occEl.options) {
                    if (opt.text.toLowerCase().includes(data.occupancy.toLowerCase())) {
                        occEl.value = opt.value;
                        occEl.dispatchEvent(new Event('change', { bubbles: true }));
                        break;
                    }
                }
            }
        }

        // Set per-tier origination fees and rates
        const tiers = data.tiers || [];
        tiers.forEach(tier => {
            const prefix = 't' + tier.tierNum; // t1, t2, t3

            // Set origination fee
            if (tier.origPct) setField(prefix + '-orig', tier.origPct);

            // Set fixed rates
            if (tier.fixed) {
                Object.entries(tier.fixed).forEach(([term, rate]) => {
                    setManualRate(prefix + '-' + term + '-rate', rate);
                });
            }

            // Set variable rates
            if (tier.variable) {
                Object.entries(tier.variable).forEach(([term, rate]) => {
                    setManualRate(prefix + '-' + term + '-var', rate);
                });
            }
        });

        // Trigger full recalculation
        if (typeof updateQuote === 'function') {
            setTimeout(() => {
                updateQuote();
                if (typeof showToast === 'function') {
                    showToast(`Ezra applied ${appliedCount} fields across ${tiers.length} tier(s) — quote updated`, 'success');
                }
            }, 100);
        }

        if (typeof autoSave === 'function') {
            setTimeout(autoSave, 300);
        }

        return appliedCount;
    }

    // Build a context summary string for AI prompts
    function buildContextSummary() {
        const ctx = getFormContext();
        if (!ctx.hasFormData) return '';

        let summary = '\n\n--- CURRENT QUOTE FORM DATA ---\n';
        if (ctx.clientName !== 'Borrower') summary += `Client Name: ${ctx.clientName}\n`;
        if (ctx.creditScore !== 'Not provided') summary += `Credit Score: ${ctx.creditScore}\n`;
        if (ctx.homeValue > 0) summary += `Property Value: $${ctx.homeValue.toLocaleString()}\n`;
        if (ctx.mortgageBalance > 0) summary += `First Mortgage Balance: $${ctx.mortgageBalance.toLocaleString()}\n`;
        if (ctx.helocAmount > 0) summary += `Requested HELOC Amount: $${ctx.helocAmount.toLocaleString()}\n`;
        summary += `Occupancy: ${ctx.occupancy}\n`;
        if (ctx.homeValue > 0) {
            summary += `CLTV: ${ctx.cltv}%\n`;
            summary += `Max Equity at 85% CLTV: $${ctx.maxEquityAt85.toLocaleString()}\n`;
        }

        // Include rates if available
        const rateEntries = Object.entries(ctx.rates).filter(([, v]) => v > 0);
        if (rateEntries.length > 0) {
            summary += 'Available Rates (Tier 2): ';
            summary += rateEntries.map(([k, v]) => `${k}: ${v}%`).join(', ');
            summary += '\n';
        }
        if (ctx.origFee > 0) summary += `Origination Fee: ${ctx.origFee}%\n`;
        summary += '--- END FORM DATA ---';
        return summary;
    }

    const EZRA_KNOWLEDGE = {
        // Fallback local knowledge base (extracted from SQL)
        localDocuments: [
            { category: 'product_structures', title: 'Fixed HELOC Programs Overview', content: 'Fixed HELOC programs are fully amortizing loans. Monthly payments include principal and interest from day one. Borrowers typically draw the full approved amount upfront (minus fees) at closing. Additional draws may be available as principal is repaid. Unlike traditional HELOCs, these products do NOT have long interest-only draw periods.' },
            { category: 'product_structures', title: 'Fixed HELOC Draw Windows', content: '5 Year Fixed HELOC: Draw period 2 years, Loan term 5 years. 10 Year Fixed HELOC: Draw period 3 years, Loan term 10 years. 15 Year Fixed HELOC: Draw period 4 years, Loan term 15 years. 30 Year Fixed HELOC: Draw period 5 years, Loan term 30 years. All fixed programs use fully amortized principal and interest payments. The draw window does not change the amortization schedule.' },
            { category: 'product_structures', title: 'Variable HELOC Programs', content: 'Variable HELOC products include interest-only draw periods. Two structures: 1) 10 Year Variable HELOC — Draw 10 years (interest-only payments), Repayment 20 years amortization after draw. 2) 5 Year Draw HELOC — Draw 5 years (interest-only), Repayment begins after draw period ends.' },
            { category: 'payment_rules', title: 'Fixed HELOC Payment Calculation', content: 'For fixed HELOC programs: Monthly payment = fully amortized principal and interest. Inputs: loan amount, interest rate, amortization period. Formula: P&I = Loan × [r(1+r)^n] / [(1+r)^n - 1] where r = monthly rate, n = total payments. Always clearly label as principal and interest payment.' },
            { category: 'payment_rules', title: 'Variable HELOC Payment Calculation', content: 'For variable HELOC during draw period: Monthly payment = loan amount × interest rate ÷ 12. This is interest-only. After draw period: Remaining balance amortizes over the repayment term using standard P&I formula. Always clearly label which payment type is being displayed.' },
            { category: 'approval_process', title: 'AI Underwriting Process', content: 'The HELOC platform uses AI-assisted underwriting. Process: 1) Borrower submits application. 2) Soft credit check determines eligibility — NO impact to credit score. 3) AI underwriting evaluates profile. 4) Income verified using secure bank-grade technology. 5) Borrower chooses preferred offer from multiple structures. 6) Final underwriting approval and closing. Borrowers remain in control. No hard credit pull required to view initial offers.' },
            { category: 'approval_process', title: 'Approval Speed & Timeline', content: 'Automated underwriting and digital verification enable fast approvals. Some loans may fund in as little as 5 days depending on documentation and underwriting review. CRITICAL RULE: Always present timelines as possibilities, NEVER as guarantees. Say "as fast as 5 days" not "guaranteed in 5 days".' },
            { category: 'approval_process', title: 'Income Verification', content: 'Income verification uses secure bank-grade technology. Borrowers connect accounts through a secure portal. Digital verification reduces paperwork and speeds up the process. All borrower financial data is protected with bank-level encryption and is never sold to third parties.' },
            { category: 'data_privacy', title: 'Data Privacy & Security', content: 'Borrower information is handled with bank-grade security. Information is NEVER sold to third parties. Borrowers maintain control of their information and loan choices. All loan options shown transparently so borrowers can decide which structure best fits their goals.' },
            { category: 'deal_architect', title: 'Deal Architect Mode', content: 'When a loan officer requests "structure this deal" or provides borrower info, Ezra performs: Step 1 — Identify borrower goal (consolidation, equity access, liquidity, payment reduction). Step 2 — Calculate CLTV: (first mortgage + HELOC amount) / property value. Step 3 — Evaluate program eligibility. Step 4 — Recommend best program with reasoning. Step 5 — Calculate payment (P&I for fixed, IO for variable draw). Step 6 — Return AUTO_FILL_FIELDS JSON for quote auto-population. Step 7 — Generate client explanation.' },
            { category: 'deal_architect', title: 'Structuring Intelligence', content: 'Program recommendations by borrower goal: Debt consolidation → 15yr or 30yr fixed (longer amortization). Short-term liquidity → 5yr or 10yr fixed (shorter programs). Payment flexibility → variable HELOC (interest-only draw). Rapid payoff → shorter amortization. Home improvement → 10yr fixed (moderate term). Maximum cash flow → 30yr fixed (lowest monthly payment).' },
            { category: 'sales_scripts', title: 'HELOC Client Introduction', content: 'Opening: "This program gives you access to your home equity with complete transparency. You can view your potential offers with just a soft credit check — no impact to your credit score. Our technology evaluates your eligibility quickly, verifies income securely, and presents you with multiple options. You pick the offer that works best for you. Some approvals can fund in as little as 5 days."' },
            { category: 'sales_scripts', title: 'Fixed HELOC Explanation Script', content: 'How to explain: "This program works more like a traditional loan. Instead of interest-only payments, the balance starts paying down right away with principal and interest. That helps build equity faster and keeps the loan structured on a predictable schedule." Example: 15 Year Fixed HELOC with 4-year draw, fully amortized P&I.' },
            { category: 'sales_scripts', title: 'Sales Coach Three-Section Format', content: 'When presenting a loan, provide: 1) Loan Structure — program name, term, draw window, payment type. 2) Strategy Explanation — why this structure fits the borrower goal. 3) Suggested Script — word-for-word client-facing explanation.' },
            { category: 'objections', title: 'Rate Concern Response', content: '"I understand rate is important. The advantage is you can see your actual offers with just a soft credit check — no impact to your score. Compare multiple structures and pick what fits. Unlike credit cards at 22%+, a HELOC at 8-9% saves thousands while providing structured payoff."' },
            { category: 'objections', title: 'Speed Concern Response', content: '"Our platform uses AI-assisted underwriting and bank-grade digital verification. The process is faster than traditional HELOCs — some approvals can fund in as little as 5 days depending on documentation."' },
            { category: 'objections', title: 'Trust & Privacy Response', content: '"Your information is protected with bank-grade security — the same level used by major financial institutions. We never sell your data to third parties. You see all options transparently and choose what works best. No obligation."' },
            { category: 'objections', title: 'Refinance vs HELOC Response', content: '"A refinance replaces your first mortgage — which means giving up your current rate. A HELOC lets you access equity without touching your first mortgage. If your current rate is below market, a HELOC preserves that advantage."' },
            { category: 'objections', title: 'General Hesitation Response', content: '"That is completely fine. You can view your potential offers with just a soft credit check — no commitment, no impact to your credit. Think of it as understanding what is available. Many clients find it helpful to know their options before they need them."' },
            { category: 'value_proposition', title: 'Core Value Proposition', content: 'Key advantages: Multiple loan structures to choose from. Soft credit check to view offers (no hard pull). AI-assisted underwriting for faster decisions. Secure bank-grade income verification. Borrower controls which offer to select. Potential funding as fast as 5 days. Fixed rate options for predictable payments.' },
            { category: 'heloc_guidelines', title: 'CLTV Calculation', content: 'Combined Loan-to-Value (CLTV) = (First Mortgage Balance + HELOC Amount) / Property Value. Most programs allow up to 85% CLTV for primary residences. Some programs may go higher depending on credit score and other factors.' },
            { category: 'heloc_guidelines', title: 'Knowledge Authority Order', content: 'When answering HELOC questions, follow this priority: 1) Internal HELOC knowledge base. 2) Product rules from system prompt. 3) Loan officer provided inputs. 4) General mortgage knowledge. Internal knowledge base overrides external assumptions. Never invent loan program structures not defined in the product rules.' }
        ],

        searchLocalKB(query) {
            if (!query) return '';
            const terms = query.toLowerCase().split(/\\s+/).filter(t => t.length > 2);
            if (terms.length === 0) return '';

            const matches = this.localDocuments.map(doc => {
                const text = (doc.title + ' ' + doc.content).toLowerCase();
                let score = 0;
                terms.forEach(term => {
                    if (text.includes(term)) score += 1;
                });
                return { ...doc, score };
            }).filter(d => d.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 3); // top 3 matches

            if (matches.length === 0) return '';

            let context = '\\n\\n--- LOCAL KNOWLEDGE BASE CONTEXT (FALLBACK) ---\\n';
            matches.forEach(m => {
                context += `[${m.title}]: ${m.content}\\n`;
            });
            context += '--- END KNOWLEDGE BASE ---\\n';

            return context;
        },

        buildSystemPrompt() {
            return `You are Ezra, an internal AI loan structuring assistant inside a HELOC quote platform used by professional loan officers.
Created by Eddie Barragan — Above All CRM.

SYSTEM IDENTITY
Your role is to help loan officers: structure HELOC deals, generate accurate loan quotes, explain loan options clearly, recommend the best program structure, respond to borrower objections, and coach the loan officer on how to present the loan.
You do not speak directly to borrowers unless generating a suggested script.
Your responses should be clear, structured, and professional.

CORE OBJECTIVE
Help the loan officer: build quotes faster, structure better HELOC strategies, avoid incorrect product assumptions, close more loans.

KNOWLEDGE AUTHORITY — Order of priority:
1. Internal HELOC knowledge base (this prompt)
2. Product rules defined below
3. Loan officer provided inputs
4. General mortgage knowledge
If information conflicts with the internal knowledge base, the internal knowledge base overrides.
You must NEVER invent loan program structures.

═══════════════════════════════════════
HELOC PRODUCT STRUCTURES
═══════════════════════════════════════

FIXED HELOC PROGRAMS
Fixed HELOC programs are fully amortizing loans. Monthly payments include principal and interest from day one.
Borrowers typically draw the full approved amount upfront (minus fees) at closing.
Additional draws may be available as principal is repaid.
Unlike traditional HELOCs, these do NOT have long interest-only draw periods.

Draw Windows:
• 5 Year Fixed HELOC — Draw: 2 years, Term: 5 years
• 10 Year Fixed HELOC — Draw: 3 years, Term: 10 years
• 15 Year Fixed HELOC — Draw: 4 years, Term: 15 years
• 30 Year Fixed HELOC — Draw: 5 years, Term: 30 years

All fixed programs use fully amortized principal and interest payments.

VARIABLE HELOC PROGRAMS
• 10 Year Variable HELOC — Draw: 10 years (interest-only), Repayment: 20 years amortization
• 5 Year Draw HELOC — Draw: 5 years (interest-only), Repayment begins after draw

PAYMENT CALCULATION
Fixed programs: monthly payment = fully amortized P&I using loan amount, rate, and term.
Variable programs during draw: monthly payment = loan amount × rate ÷ 12 (interest-only).
Variable after draw: remaining balance amortizes over repayment term.
Always clearly label which payment is being displayed.

═══════════════════════════════════════
UNDERWRITING & APPROVAL PROCESS
═══════════════════════════════════════
1. Borrower submits application
2. Soft credit check determines eligibility — NO impact to credit score
3. AI-assisted underwriting evaluates profile
4. Income verified using secure bank-grade technology
5. Borrower chooses preferred offer from multiple structures
6. Final underwriting approval and closing

Borrowers remain in control of which offer they select.
No hard credit pull is required to initially view offers.

APPROVAL SPEED
Automated underwriting and digital verification enable fast approvals.
Some loans may fund in as little as 5 days depending on documentation.
RULE: Always present timelines as possibilities, NEVER as guarantees.

DATA PRIVACY
• Borrower information handled with bank-grade security
• Information is NEVER sold to third parties
• Borrowers maintain control of their information and loan choices
• All options shown transparently

═══════════════════════════════════════
STRUCTURING INTELLIGENCE
═══════════════════════════════════════
Recommend based on borrower goals:
• Debt consolidation → longer amortization (15yr or 30yr fixed)
• Short-term liquidity → shorter fixed (5yr or 10yr)
• Payment flexibility → variable HELOC
• Rapid payoff → shorter amortization

CORE VALUE PROPOSITION
• Multiple loan structures to choose from
• Soft credit check to view offers
• AI-assisted underwriting for faster decisions
• Secure bank-grade income verification
• Borrower controls which offer to select
• Potential funding as fast as 5 days

═══════════════════════════════════════
DEAL ARCHITECT MODE
═══════════════════════════════════════
When a loan officer says "structure this deal" or provides borrower info, perform:
Step 1 — Identify borrower goal (consolidation, equity access, liquidity, payment reduction)
Step 2 — Calculate CLTV: (first mortgage + HELOC amount) ÷ property value
Step 3 — Evaluate program eligibility based on loan size, goal, and payment preference
Step 4 — Recommend best program with reasoning
Step 5 — Calculate payment (P&I for fixed, IO for variable draw)
Step 6 — Return structured quote data in AUTO_FILL_FIELDS JSON block
Step 7 — Generate client explanation

QUOTE GENERATION RULE
When generating a quote, return a JSON block labeled AUTO_FILL_FIELDS:
AUTO_FILL_FIELDS
{
  "borrower_name": "string",
  "credit_score": "string or number",
  "property_value": number,
  "first_mortgage_balance": number,
  "heloc_amount": number,
  "combined_ltv": number,
  "program_selected": "string",
  "draw_period": "X years",
  "loan_term": "X years",
  "interest_rate": number,
  "origination_fee": number,
  "payment_type": "principal_and_interest" | "interest_only",
  "monthly_payment_estimate": number
}

MULTI-TIER RATE INPUT
Loan officers may paste data from lender portals (Figure, etc.) or give you rates for multiple origination fee tiers.
When given rates per origination tier, include them in the AUTO_FILL_FIELDS JSON with a "tiers" array:
"tiers": [
  { "origPct": 4.99, "tierNum": 1, "fixed": { "30": 7.45, "20": 7.20, "15": 7.20, "10": 7.20 }, "variable": {} },
  { "origPct": 2.99, "tierNum": 2, "fixed": { "30": 7.85, "20": 7.60, "15": 7.60, "10": 7.60 }, "variable": {} },
  { "origPct": 1.50, "tierNum": 3, "fixed": { "30": 8.35, "20": 8.10, "15": 8.10, "10": 8.10 }, "variable": {} }
]
Tier 1 = highest origination fee (lowest rates), Tier 3 = lowest origination fee (highest rates).

PASTED LENDER DATA
If a loan officer pastes raw text from a lender portal, extract the cash amount, origination fee options,
and all rate/term/payment combinations. Return them in AUTO_FILL_FIELDS with the tiers array above.
The app will auto-populate all rate fields across all 3 pricing tiers.

QUOTE TOOL INTERACTION
When the loan officer says things like "go with option 2", "tier 2 at 20", "use tier 1", "switch to 30 year",
"highlight that one", or makes follow-up corrections like "change cash to $150K", "make it 15 years",
include an ACTION_COMMAND JSON block:
ACTION_COMMAND
{
  "action": "select_tier" | "select_term" | "set_field" | "highlight",
  "tier": "t1" | "t2" | "t3",
  "term": 30 | 20 | 15 | 10,
  "field": "field_id",
  "value": "new_value"
}

═══════════════════════════════════════
SALES COACH MODE
═══════════════════════════════════════
When asked how to present a loan, provide three sections:
1. Loan Structure — program details
2. Strategy Explanation — why this structure fits
3. Suggested Script — ready-to-use client wording

═══════════════════════════════════════
RESPONSE RULES
═══════════════════════════════════════
• Clear, structured, professional — short paragraphs
• Use headings when explaining loan structures
• Never invent programs not listed above
• Never claim hard pull needed to view initial offers
• Timelines are possibilities, not guarantees
• If inputs are missing, ask the loan officer for clarification
• Behave like a senior mortgage strategist sitting next to the loan officer`;
        }
    };

    // ============================================
    // CONFIGURATION
    // ============================================
    const EZRA_CONFIG = {
        widgetTitle: 'Ezra — AI Loan Structuring Assistant',
        placeholderText: 'Ask Ezra anything...',
        quickCommands: [
            { label: 'Build Quote', icon: '💰', action: 'build_quote', prompt: 'Ezra build a quote for this borrower' },
            { label: 'Structure Deal', icon: '🏗️', action: 'structure_deal', prompt: 'Ezra structure this deal' },
            { label: 'Recommend Program', icon: '🎯', action: 'recommend_program', prompt: 'Which HELOC program is best for this borrower?' },
            { label: 'Tier 1', icon: '1️⃣', action: 'tier1', prompt: 'Go with tier 1' },
            { label: 'Tier 2', icon: '2️⃣', action: 'tier2', prompt: 'Go with tier 2' },
            { label: 'Tier 3', icon: '3️⃣', action: 'tier3', prompt: 'Go with tier 3' },
            { label: 'Handle Objection', icon: '🛡️', action: 'handle_objection', prompt: 'How do I handle common HELOC objections?' },
            { label: 'Client Script', icon: '📝', action: 'client_script', prompt: 'How should I explain this HELOC to my client?' }
        ],
        models: {
            gemini: { name: 'Fast', color: '#4285f4', desc: 'Quick answers & simple questions' },
            claude: { name: 'Deep', color: '#d97757', desc: 'Calculations & detailed analysis' },
            gpt: { name: 'Complex', color: '#10a37f', desc: 'Strategy & advanced reasoning' }
        },
        supabaseUrl: window.SUPABASE_URL || '',
        supabaseKey: window.SUPABASE_ANON_KEY || ''
    };

    // ============================================
    // STATE MANAGEMENT
    // ============================================
    const EzraState = {
        isOpen: false,
        isMinimized: false,
        conversationId: null,
        messages: [],
        currentModel: 'gemini',
        userTier: 'diamond',
        autoFillEnabled: true,
        isTyping: false,
        supabase: null,
        user: null,
        dealRadarData: null,
        activeTab: 'chat' // 'chat' | 'deal-radar'
    };

    // ============================================
    // INITIALIZATION
    // ============================================
    let _initAttempts = 0;
    function initEzra() {
        // Wait for the app's Supabase client to be available
        if (!window._supabase) {
            _initAttempts++;
            if (_initAttempts <= 30) { // up to 15 seconds
                if (_initAttempts === 1) console.log('Ezra: Waiting for Supabase client...');
                setTimeout(initEzra, 500);
            } else {
                console.warn('Ezra: Supabase client not found after 15s — widget disabled');
            }
            return;
        }

        // Use the app's existing Supabase client
        EzraState.supabase = window._supabase;

        // Pick up tier from app globals
        if (window.currentUserTier) EzraState.userTier = window.currentUserTier;

        // Diamond-only feature gate
        const tier = (EzraState.userTier || '').toLowerCase();
        if (tier !== 'diamond' && window.currentUserRole !== 'super_admin') {
            console.log('Ezra: Requires Diamond tier — widget hidden');
            return;
        }

        // Create widget DOM first so elements exist
        createWidgetDOM();

        // Setup event listeners
        setupEventListeners();

        // Check auth state (async — loads conversation)
        checkAuthState();

        // Load user preferences
        loadUserPreferences();

        console.log('Ezra: Initialized successfully');
    }

    async function checkAuthState() {
        const { data: { session } } = await EzraState.supabase.auth.getSession();
        if (session?.user) {
            EzraState.user = session.user;
            loadOrCreateConversation();
        }
    }

    // ============================================
    // DOM CREATION
    // ============================================
    function createWidgetDOM() {
        // Remove existing widget if present
        const existing = document.getElementById('ezra-widget');
        if (existing) existing.remove();

        const widget = document.createElement('div');
        widget.id = 'ezra-widget';
        widget.className = 'ezra-widget';
        widget.innerHTML = `
            <!-- Floating Gold Orb -->
            <button id="ezra-orb" class="ezra-orb" aria-label="Open Ezra AI Assistant">
                <span class="ezra-orb-icon">\u2726</span>
                <span class="ezra-orb-ring"></span>
            </button>

            <!-- Chat Panel -->
            <div id="ezra-container" class="ezra-container">
                <!-- Header -->
                <div class="ezra-header">
                    <div class="ezra-header-left">
                        <div class="ezra-avatar">\u2726</div>
                        <div class="ezra-header-info">
                            <span class="ezra-title">EZRA</span>
                            <span class="ezra-status">
                                <span class="ezra-status-dot"></span>
                                <span class="ezra-status-text">Online</span>
                            </span>
                        </div>
                    </div>
                    <div class="ezra-header-actions">
                        <button id="ezra-model-selector" class="ezra-model-btn" title="AI Mode">
                            <span class="ezra-model-name">Fast</span>
                        </button>
                        <button id="ezra-minimize" class="ezra-icon-btn" title="Minimize">\u2212</button>
                        <button id="ezra-close" class="ezra-icon-btn" title="Close">\u00D7</button>
                    </div>
                </div>

                <!-- Quick Commands -->
                <div class="ezra-quick-commands">
                    ${EZRA_CONFIG.quickCommands.map(cmd => `
                        <button class="ezra-quick-btn" data-action="${cmd.action}" title="${cmd.label}">
                            <span>${cmd.icon}</span>
                            <span>${cmd.label}</span>
                        </button>
                    `).join('')}
                </div>

                <!-- Messages Area -->
                <div id="ezra-messages" class="ezra-messages">
                    <div class="ezra-welcome">
                        <div class="ezra-welcome-icon">\u2726</div>
                        <h3>Hello, I'm Ezra</h3>
                        <p>Your AI loan structuring co-pilot.</p>
                        <div class="ezra-welcome-capabilities">
                            <div class="ezra-welcome-cap"><span>\u2726</span> Build & auto-fill quotes</div>
                            <div class="ezra-welcome-cap"><span>\u2726</span> Structure deals instantly</div>
                            <div class="ezra-welcome-cap"><span>\u2726</span> Recommend best program</div>
                            <div class="ezra-welcome-cap"><span>\u2726</span> Client scripts & coaching</div>
                        </div>
                    </div>
                </div>

                <!-- Typing Indicator -->
                <div id="ezra-typing" class="ezra-typing" style="display: none;">
                    <span class="ezra-typing-dot"></span>
                    <span class="ezra-typing-dot"></span>
                    <span class="ezra-typing-dot"></span>
                </div>

                <!-- Input Area -->
                <div class="ezra-input-area">
                    <div class="ezra-input-wrapper">
                        <textarea
                            id="ezra-input"
                            class="ezra-input"
                            placeholder="${EZRA_CONFIG.placeholderText}"
                            rows="1"
                        ></textarea>
                        <button id="ezra-send" class="ezra-send-btn" disabled>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="ezra-input-footer">
                        <span class="ezra-tier-badge">${EzraState.userTier}</span>
                        <span class="ezra-powered-by">Powered by AI</span>
                    </div>
                </div>
            </div>

            <!-- Model Selector Modal -->
            <div id="ezra-model-modal" class="ezra-modal" style="display: none;">
                <div class="ezra-modal-content">
                    <h4>Select AI Mode</h4>
                    <div class="ezra-model-options">
                        ${Object.entries(EZRA_CONFIG.models).map(([key, model]) => `
                            <button class="ezra-model-option ${key === EzraState.currentModel ? 'active' : ''}" data-model="${key}">
                                <span class="ezra-model-color" style="background: ${model.color}"></span>
                                <span class="ezra-model-label">${model.name}</span>
                                <span class="ezra-model-use">${model.desc}</span>
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(widget);

        // Inject styles
        injectStyles();
    }

    function injectStyles() {
        if (document.getElementById('ezra-styles')) return;

        const styles = document.createElement('style');
        styles.id = 'ezra-styles';
        styles.textContent = `
            /* ============================================
               EZRA WIDGET — DARK GLASS + GOLD THEME
               ============================================ */

            /* CSS Variables */
            :root {
                --ezra-gold: #c5a059;
                --ezra-gold-bright: #d4af37;
                --ezra-gold-dim: rgba(197,160,89,0.3);
                --ezra-dark-1: #0f172a;
                --ezra-dark-2: #1e293b;
                --ezra-dark-3: #334155;
                --ezra-glass: rgba(30,41,59,0.85);
                --ezra-glass-border: rgba(197,160,89,0.25);
                --ezra-text: #e2e8f0;
                --ezra-text-muted: #94a3b8;
                --ezra-radius: 16px;
                --ezra-radius-sm: 10px;
            }

            /* Widget Wrapper */
            .ezra-widget {
                position: fixed;
                bottom: 28px;
                right: 28px;
                z-index: 9999;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            }

            /* ===== FLOATING ORB ===== */
            .ezra-orb {
                width: 56px;
                height: 56px;
                border-radius: 50%;
                border: none;
                cursor: pointer;
                background: linear-gradient(135deg, #c5a059 0%, #d4af37 50%, #c5a059 100%);
                color: #1e293b;
                font-size: 22px;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                box-shadow:
                    0 0 20px rgba(212,175,55,0.4),
                    0 0 60px rgba(212,175,55,0.15),
                    0 8px 32px rgba(0,0,0,0.3);
                transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
                z-index: 2;
            }

            .ezra-orb:hover {
                transform: translateY(-4px) scale(1.08);
                box-shadow:
                    0 0 30px rgba(212,175,55,0.6),
                    0 0 80px rgba(212,175,55,0.25),
                    0 12px 40px rgba(0,0,0,0.35);
            }

            .ezra-orb-icon {
                font-size: 24px;
                filter: drop-shadow(0 0 4px rgba(212,175,55,0.6));
                z-index: 1;
            }

            .ezra-orb-ring {
                position: absolute;
                inset: -4px;
                border-radius: 50%;
                border: 2px solid rgba(212,175,55,0.4);
                animation: ezra-orb-pulse 2.5s ease-in-out infinite;
                pointer-events: none;
            }

            @keyframes ezra-orb-pulse {
                0%, 100% { transform: scale(1); opacity: 0.6; }
                50% { transform: scale(1.15); opacity: 0; }
            }

            /* ===== CHAT PANEL ===== */
            .ezra-container {
                position: absolute;
                bottom: 0;
                right: 0;
                width: 480px;
                height: 660px;
                background: linear-gradient(135deg, var(--ezra-dark-2), var(--ezra-dark-1));
                border-radius: var(--ezra-radius);
                border: 1px solid var(--ezra-glass-border);
                box-shadow:
                    0 0 40px rgba(197,160,89,0.12),
                    0 25px 50px rgba(0,0,0,0.5),
                    inset 0 1px 0 rgba(255,255,255,0.05);
                display: none;
                flex-direction: column;
                overflow: hidden;
                backdrop-filter: blur(20px);
            }

            .ezra-container.open {
                display: flex;
                animation: ezra-panel-in 0.35s cubic-bezier(0.4,0,0.2,1);
            }

            @keyframes ezra-panel-in {
                from {
                    opacity: 0;
                    transform: translateY(16px) scale(0.96);
                }
                to {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
            }

            /* ===== HEADER ===== */
            .ezra-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 14px 18px;
                background: transparent;
                border-bottom: 1px solid var(--ezra-glass-border);
            }

            .ezra-header-left {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .ezra-avatar {
                width: 36px;
                height: 36px;
                background: linear-gradient(135deg, var(--ezra-gold), var(--ezra-gold-bright));
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                color: var(--ezra-dark-1);
                font-weight: 700;
                box-shadow: 0 0 12px rgba(212,175,55,0.3);
            }

            .ezra-header-info {
                display: flex;
                flex-direction: column;
            }

            .ezra-title {
                font-family: 'DM Sans', 'Inter', sans-serif;
                font-weight: 700;
                font-size: 15px;
                letter-spacing: 2px;
                color: var(--ezra-gold);
            }

            .ezra-status {
                display: flex;
                align-items: center;
                gap: 5px;
                font-size: 11px;
                color: var(--ezra-text-muted);
            }

            .ezra-status-dot {
                width: 7px;
                height: 7px;
                background: #22c55e;
                border-radius: 50%;
                box-shadow: 0 0 6px rgba(34,197,94,0.5);
                animation: ezra-status-pulse 2s infinite;
            }

            @keyframes ezra-status-pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.4; }
            }

            .ezra-header-actions {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .ezra-icon-btn {
                width: 30px;
                height: 30px;
                background: rgba(255,255,255,0.06);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 8px;
                color: var(--ezra-text-muted);
                font-size: 16px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }

            .ezra-icon-btn:hover {
                background: rgba(255,255,255,0.12);
                color: var(--ezra-text);
            }

            .ezra-model-btn {
                height: 30px;
                width: auto;
                padding: 0 10px;
                background: rgba(197,160,89,0.12);
                border: 1px solid var(--ezra-gold-dim);
                border-radius: 8px;
                color: var(--ezra-gold);
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 4px;
                transition: all 0.2s;
            }

            .ezra-model-btn:hover {
                background: rgba(197,160,89,0.2);
                border-color: var(--ezra-gold);
            }

            /* ===== QUICK COMMANDS ===== */
            .ezra-quick-commands {
                display: flex;
                gap: 6px;
                padding: 10px 14px;
                overflow-x: auto;
                scrollbar-width: none;
                border-bottom: 1px solid rgba(255,255,255,0.04);
            }

            .ezra-quick-commands::-webkit-scrollbar {
                display: none;
            }

            .ezra-quick-btn {
                display: flex;
                align-items: center;
                gap: 5px;
                padding: 6px 12px;
                background: rgba(255,255,255,0.04);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 20px;
                font-size: 11px;
                font-weight: 500;
                color: var(--ezra-text-muted);
                cursor: pointer;
                white-space: nowrap;
                transition: all 0.2s;
            }

            .ezra-quick-btn:hover {
                background: rgba(197,160,89,0.12);
                border-color: var(--ezra-gold-dim);
                color: var(--ezra-gold);
            }

            /* ===== MESSAGES ===== */
            .ezra-messages {
                flex: 1;
                overflow-y: auto;
                padding: 18px;
                display: flex;
                flex-direction: column;
                gap: 14px;
                scrollbar-width: thin;
                scrollbar-color: var(--ezra-dark-3) transparent;
            }

            .ezra-messages::-webkit-scrollbar { width: 4px; }
            .ezra-messages::-webkit-scrollbar-track { background: transparent; }
            .ezra-messages::-webkit-scrollbar-thumb { background: var(--ezra-dark-3); border-radius: 4px; }

            /* Welcome */
            .ezra-welcome {
                text-align: center;
                padding: 24px 16px;
                color: var(--ezra-text);
            }

            .ezra-welcome-icon {
                font-size: 40px;
                color: var(--ezra-gold);
                margin-bottom: 12px;
                filter: drop-shadow(0 0 8px rgba(212,175,55,0.4));
            }

            .ezra-welcome h3 {
                margin: 0 0 8px;
                font-family: 'DM Sans', 'Inter', sans-serif;
                font-size: 18px;
                font-weight: 600;
                color: var(--ezra-text);
            }

            .ezra-welcome p {
                margin: 0 0 16px;
                color: var(--ezra-text-muted);
                font-size: 13px;
                line-height: 1.5;
            }

            .ezra-welcome-capabilities {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 8px;
                text-align: left;
            }

            .ezra-welcome-cap {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 8px 10px;
                background: rgba(255,255,255,0.03);
                border: 1px solid rgba(255,255,255,0.06);
                border-radius: 8px;
                font-size: 11px;
                color: var(--ezra-text-muted);
            }

            .ezra-welcome-cap span {
                color: var(--ezra-gold);
                font-size: 10px;
            }

            /* Message Bubbles */
            .ezra-message {
                display: flex;
                gap: 10px;
                max-width: 88%;
            }

            .ezra-message.user {
                align-self: flex-end;
                flex-direction: row-reverse;
            }

            .ezra-message-avatar {
                width: 28px;
                height: 28px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
                flex-shrink: 0;
            }

            .ezra-message.assistant .ezra-message-avatar {
                background: linear-gradient(135deg, var(--ezra-dark-3), var(--ezra-dark-2));
                border: 1px solid var(--ezra-glass-border);
                color: var(--ezra-gold);
            }

            .ezra-message.user .ezra-message-avatar {
                background: linear-gradient(135deg, var(--ezra-gold), var(--ezra-gold-bright));
                color: var(--ezra-dark-1);
            }

            .ezra-message-content {
                padding: 10px 14px;
                border-radius: 12px;
                font-size: 13px;
                line-height: 1.55;
            }

            .ezra-message.assistant .ezra-message-content {
                background: rgba(255,255,255,0.05);
                border: 1px solid rgba(255,255,255,0.08);
                color: var(--ezra-text);
            }

            .ezra-message.user .ezra-message-content {
                background: linear-gradient(135deg, rgba(197,160,89,0.2), rgba(212,175,55,0.15));
                border: 1px solid var(--ezra-gold-dim);
                color: var(--ezra-text);
            }

            .ezra-message-content code {
                background: rgba(0,0,0,0.3);
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 12px;
                color: var(--ezra-gold);
            }

            .ezra-message-time {
                font-size: 10px;
                color: var(--ezra-text-muted);
                margin-top: 4px;
                opacity: 0.7;
            }

            /* Auto-fill Block (dark emerald) */
            .ezra-autofill-block {
                background: linear-gradient(135deg, rgba(5,46,22,0.6), rgba(6,78,59,0.4));
                border: 1px solid rgba(34,197,94,0.3);
                border-radius: var(--ezra-radius-sm);
                padding: 14px;
                margin-top: 10px;
            }

            .ezra-autofill-header {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 600;
                color: #4ade80;
                font-size: 13px;
                margin-bottom: 10px;
            }

            .ezra-autofill-fields {
                display: grid;
                gap: 6px;
            }

            .ezra-autofill-field {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 7px 10px;
                background: rgba(0,0,0,0.2);
                border-radius: 6px;
                font-size: 12px;
            }

            .ezra-autofill-label {
                color: var(--ezra-text-muted);
            }

            .ezra-autofill-value {
                font-weight: 600;
                color: #4ade80;
            }

            .ezra-autofill-actions {
                display: flex;
                gap: 8px;
                margin-top: 10px;
            }

            .ezra-autofill-btn {
                flex: 1;
                padding: 8px;
                border: none;
                border-radius: 6px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.2s;
            }

            .ezra-autofill-btn.primary {
                background: #22c55e;
                color: white;
            }

            .ezra-autofill-btn.primary:hover {
                background: #16a34a;
            }

            .ezra-autofill-btn.secondary {
                background: rgba(255,255,255,0.06);
                color: var(--ezra-text);
                border: 1px solid rgba(255,255,255,0.1);
            }

            /* ===== TYPING INDICATOR ===== */
            .ezra-typing {
                display: flex;
                align-items: center;
                gap: 5px;
                padding: 12px 18px;
            }

            .ezra-typing-dot {
                width: 7px;
                height: 7px;
                background: var(--ezra-gold);
                border-radius: 50%;
                animation: ezra-typing-bounce 1.4s infinite ease-in-out both;
            }

            .ezra-typing-dot:nth-child(1) { animation-delay: -0.32s; }
            .ezra-typing-dot:nth-child(2) { animation-delay: -0.16s; }

            @keyframes ezra-typing-bounce {
                0%, 80%, 100% { transform: scale(0); opacity: 0.4; }
                40% { transform: scale(1); opacity: 1; }
            }

            /* ===== INPUT AREA ===== */
            .ezra-input-area {
                padding: 12px 16px;
                border-top: 1px solid rgba(255,255,255,0.06);
                background: rgba(0,0,0,0.15);
            }

            .ezra-input-wrapper {
                display: flex;
                gap: 8px;
                background: rgba(255,255,255,0.04);
                border-radius: 24px;
                padding: 4px;
                border: 1px solid rgba(255,255,255,0.08);
                transition: border-color 0.2s;
            }

            .ezra-input-wrapper:focus-within {
                border-color: var(--ezra-gold-dim);
                box-shadow: 0 0 0 3px rgba(197,160,89,0.08);
            }

            .ezra-input {
                flex: 1;
                border: none;
                background: transparent;
                padding: 10px 14px;
                font-size: 13px;
                resize: none;
                outline: none;
                max-height: 120px;
                font-family: inherit;
                color: var(--ezra-text);
            }

            .ezra-input::placeholder {
                color: var(--ezra-text-muted);
                opacity: 0.6;
            }

            .ezra-send-btn {
                width: 36px;
                height: 36px;
                background: linear-gradient(135deg, var(--ezra-gold), var(--ezra-gold-bright));
                border: none;
                border-radius: 50%;
                color: var(--ezra-dark-1);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                flex-shrink: 0;
            }

            .ezra-send-btn:hover:not(:disabled) {
                transform: scale(1.05);
                box-shadow: 0 0 12px rgba(212,175,55,0.4);
            }

            .ezra-send-btn:disabled {
                opacity: 0.3;
                cursor: not-allowed;
            }

            .ezra-send-btn svg {
                width: 16px;
                height: 16px;
            }

            .ezra-input-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-top: 6px;
                padding: 0 4px;
                font-size: 10px;
                color: rgba(148,163,184,0.5);
            }

            .ezra-tier-badge {
                background: linear-gradient(135deg, var(--ezra-gold), var(--ezra-gold-bright));
                color: var(--ezra-dark-1);
                padding: 2px 8px;
                border-radius: 10px;
                font-weight: 700;
                font-size: 9px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            /* ===== MODEL MODAL ===== */
            .ezra-modal {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.6);
                backdrop-filter: blur(4px);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10001;
            }

            .ezra-modal-content {
                background: linear-gradient(135deg, var(--ezra-dark-2), var(--ezra-dark-1));
                border: 1px solid var(--ezra-glass-border);
                border-radius: var(--ezra-radius);
                padding: 24px;
                width: 320px;
                box-shadow: 0 25px 50px rgba(0,0,0,0.5);
            }

            .ezra-modal-content h4 {
                margin: 0 0 16px;
                font-size: 15px;
                font-weight: 600;
                color: var(--ezra-text);
            }

            .ezra-model-options {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .ezra-model-option {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 12px;
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: var(--ezra-radius-sm);
                background: rgba(255,255,255,0.03);
                cursor: pointer;
                transition: all 0.2s;
                color: var(--ezra-text);
            }

            .ezra-model-option:hover {
                background: rgba(255,255,255,0.06);
                border-color: rgba(255,255,255,0.15);
            }

            .ezra-model-option.active {
                border-color: var(--ezra-gold-dim);
                background: rgba(197,160,89,0.08);
            }

            .ezra-model-color {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                flex-shrink: 0;
            }

            .ezra-model-label {
                font-weight: 600;
                flex: 1;
                text-align: left;
                font-size: 13px;
            }

            .ezra-model-use {
                font-size: 10px;
                color: var(--ezra-text-muted);
            }

            /* ===== DEAL RADAR (dark theme) ===== */
            .ezra-deal-radar {
                padding: 16px;
                height: 100%;
                overflow-y: auto;
            }

            .ezra-dr-header {
                text-align: center;
                margin-bottom: 20px;
            }

            .ezra-dr-header h3 {
                margin: 0 0 8px;
                font-size: 18px;
                color: var(--ezra-text);
            }

            .ezra-dr-header p {
                margin: 0;
                color: var(--ezra-text-muted);
                font-size: 12px;
            }

            .ezra-dr-actions {
                display: flex;
                gap: 10px;
                margin-bottom: 20px;
            }

            .ezra-dr-btn {
                flex: 1;
                padding: 10px;
                border: none;
                border-radius: var(--ezra-radius-sm);
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
                transition: all 0.2s;
            }

            .ezra-dr-btn.primary {
                background: linear-gradient(135deg, var(--ezra-gold), var(--ezra-gold-bright));
                color: var(--ezra-dark-1);
            }

            .ezra-dr-btn.primary:hover {
                box-shadow: 0 0 12px rgba(212,175,55,0.3);
            }

            .ezra-dr-btn.secondary {
                background: rgba(255,255,255,0.04);
                color: var(--ezra-text);
                border: 1px solid rgba(255,255,255,0.08);
            }

            .ezra-dr-btn.secondary:hover {
                background: rgba(255,255,255,0.08);
            }

            .ezra-dr-content {
                min-height: 200px;
            }

            .ezra-dr-empty {
                text-align: center;
                padding: 40px 20px;
                color: var(--ezra-text-muted);
            }

            .ezra-dr-icon {
                font-size: 48px;
                display: block;
                margin-bottom: 16px;
            }

            .ezra-dr-scanning {
                text-align: center;
                padding: 40px 20px;
            }

            .ezra-dr-spinner {
                width: 40px;
                height: 40px;
                border: 3px solid var(--ezra-dark-3);
                border-top-color: var(--ezra-gold);
                border-radius: 50%;
                animation: ezra-spin 1s linear infinite;
                margin: 0 auto 16px;
            }

            @keyframes ezra-spin {
                to { transform: rotate(360deg); }
            }

            .ezra-dr-sub {
                font-size: 12px;
                color: var(--ezra-text-muted);
            }

            .ezra-dr-stats {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                margin-bottom: 20px;
            }

            .ezra-dr-stat {
                background: rgba(255,255,255,0.03);
                border: 1px solid rgba(255,255,255,0.06);
                padding: 14px;
                border-radius: var(--ezra-radius-sm);
                text-align: center;
            }

            .ezra-dr-stat-value {
                display: block;
                font-size: 22px;
                font-weight: 700;
                color: var(--ezra-gold);
            }

            .ezra-dr-stat-label {
                font-size: 11px;
                color: var(--ezra-text-muted);
            }

            .ezra-dr-list {
                display: flex;
                flex-direction: column;
                gap: 10px;
            }

            .ezra-dr-card {
                background: rgba(255,255,255,0.03);
                border-radius: var(--ezra-radius-sm);
                padding: 14px;
                border: 1px solid rgba(255,255,255,0.06);
                transition: all 0.2s;
            }

            .ezra-dr-card:hover {
                border-color: var(--ezra-gold-dim);
                box-shadow: 0 0 12px rgba(197,160,89,0.1);
            }

            .ezra-dr-card-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }

            .ezra-dr-type {
                background: linear-gradient(135deg, var(--ezra-gold), var(--ezra-gold-bright));
                color: var(--ezra-dark-1);
                padding: 3px 10px;
                border-radius: 12px;
                font-size: 10px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .ezra-dr-card-body h4 {
                margin: 0 0 8px;
                font-size: 15px;
                color: var(--ezra-text);
            }

            .ezra-dr-metrics {
                display: flex;
                gap: 16px;
                margin-bottom: 8px;
            }

            .ezra-dr-equity {
                color: #4ade80;
                font-weight: 600;
                font-size: 13px;
            }

            .ezra-dr-cltv {
                color: var(--ezra-text-muted);
                font-size: 13px;
            }

            .ezra-dr-strategy {
                margin: 0;
                font-size: 12px;
                color: var(--ezra-text-muted);
                line-height: 1.4;
            }

            .ezra-dr-card-actions {
                display: flex;
                gap: 8px;
                margin-top: 10px;
            }

            .ezra-dr-action-btn {
                flex: 1;
                padding: 8px;
                border: none;
                border-radius: 6px;
                font-size: 11px;
                font-weight: 600;
                cursor: pointer;
                background: linear-gradient(135deg, var(--ezra-gold), var(--ezra-gold-bright));
                color: var(--ezra-dark-1);
                transition: all 0.2s;
            }

            .ezra-dr-action-btn:hover {
                box-shadow: 0 0 10px rgba(212,175,55,0.3);
            }

            .ezra-dr-action-btn.secondary {
                background: transparent;
                color: var(--ezra-text);
                border: 1px solid rgba(255,255,255,0.1);
            }

            .ezra-dr-action-btn.secondary:hover {
                background: rgba(255,255,255,0.06);
            }

            .ezra-dr-error {
                text-align: center;
                padding: 40px 20px;
                color: #f87171;
            }

            /* ===== RESPONSIVE ===== */
            @media (max-width: 520px) {
                .ezra-widget {
                    bottom: 20px;
                    right: 20px;
                }

                .ezra-container {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    width: auto;
                    height: auto;
                    border-radius: 0;
                    border: none;
                }
            }
        `;

        document.head.appendChild(styles);
    }

    // ============================================
    // EVENT LISTENERS
    // ============================================
    function setupEventListeners() {
        // Toggle button
        document.getElementById('ezra-orb')?.addEventListener('click', toggleWidget);

        // Close button
        document.getElementById('ezra-close')?.addEventListener('click', closeWidget);

        // Minimize button
        document.getElementById('ezra-minimize')?.addEventListener('click', minimizeWidget);

        // Model selector
        document.getElementById('ezra-model-selector')?.addEventListener('click', showModelModal);

        // Send button
        document.getElementById('ezra-send')?.addEventListener('click', sendMessage);

        // Input textarea
        const input = document.getElementById('ezra-input');
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
            input.addEventListener('input', autoResizeTextarea);
        }

        // Quick command buttons
        document.querySelectorAll('.ezra-quick-btn').forEach(btn => {
            btn.addEventListener('click', () => handleQuickCommand(btn.dataset.action));
        });

        // Model selection
        document.querySelectorAll('.ezra-model-option').forEach(btn => {
            btn.addEventListener('click', () => selectModel(btn.dataset.model));
        });

        // Close modal on outside click
        document.getElementById('ezra-model-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'ezra-model-modal') {
                hideModelModal();
            }
        });
    }

    // ============================================
    // WIDGET CONTROLS
    // ============================================
    function toggleWidget() {
        const container = document.getElementById('ezra-container');
        EzraState.isOpen = !EzraState.isOpen;

        if (EzraState.isOpen) {
            container.classList.add('open');
            document.getElementById('ezra-orb').style.display = 'none';
            setTimeout(() => document.getElementById('ezra-input')?.focus(), 100);
        } else {
            container.classList.remove('open');
            document.getElementById('ezra-orb').style.display = 'flex';
        }
    }

    function closeWidget() {
        EzraState.isOpen = false;
        document.getElementById('ezra-container').classList.remove('open');
        document.getElementById('ezra-orb').style.display = 'flex';
    }

    function minimizeWidget() {
        EzraState.isMinimized = true;
        closeWidget();
    }

    function showModelModal() {
        document.getElementById('ezra-model-modal').style.display = 'flex';
    }

    function hideModelModal() {
        document.getElementById('ezra-model-modal').style.display = 'none';
    }

    function selectModel(model) {
        EzraState.currentModel = model;
        document.querySelectorAll('.ezra-model-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.model === model);
        });
        document.querySelector('.ezra-model-name').textContent = EZRA_CONFIG.models[model].name;
        hideModelModal();
    }

    function autoResizeTextarea() {
        const input = document.getElementById('ezra-input');
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';

        const sendBtn = document.getElementById('ezra-send');
        sendBtn.disabled = input.value.trim().length === 0;
    }

    // ============================================
    // MESSAGE HANDLING
    // ============================================
    async function sendMessage() {
        const input = document.getElementById('ezra-input');
        const message = input.value.trim();

        if (!message || EzraState.isTyping) return;

        // Clear input
        input.value = '';
        input.style.height = 'auto';
        document.getElementById('ezra-send').disabled = true;

        // Add user message
        addMessage('user', message);

        // Show typing indicator
        showTypingIndicator();

        try {
            // Route to appropriate AI model
            const response = await routeToAI(message);

            // Hide typing indicator
            hideTypingIndicator();

            // Add assistant response
            addMessage('assistant', response.content, response.metadata);

            // Handle auto-fill if present
            if (response.autoFillFields) {
                showAutoFillBlock(response.autoFillFields);
            }

            // Save to Supabase
            saveMessageToSupabase('user', message);
            saveMessageToSupabase('assistant', response.content, response.metadata);

        } catch (error) {
            hideTypingIndicator();
            addMessage('assistant', 'I apologize, but I encountered an error. Please try again.');
            console.error('Ezra error:', error);
        }
    }

    function addMessage(role, content, metadata = {}) {
        const messagesContainer = document.getElementById('ezra-messages');

        // Remove welcome message if present
        const welcome = messagesContainer.querySelector('.ezra-welcome');
        if (welcome) welcome.remove();

        const messageDiv = document.createElement('div');
        messageDiv.className = `ezra-message ${role}`;

        const avatar = role === 'assistant' ? '\u2726' : '\u2726';
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        messageDiv.innerHTML = `
            <div class="ezra-message-avatar">${avatar}</div>
            <div>
                <div class="ezra-message-content">${formatMessage(content)}</div>
                <div class="ezra-message-time">${time}${metadata.model ? ` · ${EZRA_CONFIG.models[metadata.model]?.name || 'AI'}` : ''}</div>
            </div>
        `;

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Store in state
        EzraState.messages.push({ role, content, metadata, timestamp: new Date() });
    }

    function formatMessage(content) {
        // Strip AUTO_FILL_FIELDS JSON block from display (handled by auto-fill UI)
        let clean = content.replace(/AUTO_FILL_FIELDS\s*\n?\s*\{[\s\S]*?\}/g, '').trim();
        // Simple markdown-like formatting
        return clean
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    function showTypingIndicator() {
        EzraState.isTyping = true;
        document.getElementById('ezra-typing').style.display = 'flex';
        document.getElementById('ezra-messages').scrollTop = document.getElementById('ezra-messages').scrollHeight;
    }

    function hideTypingIndicator() {
        EzraState.isTyping = false;
        document.getElementById('ezra-typing').style.display = 'none';
    }

    // ============================================
    // QUICK COMMANDS
    // ============================================
    function handleQuickCommand(action) {
        if (action === 'deal_radar') {
            showDealRadar();
            return;
        }

        // Use prompt from config, enriched with current form data
        const cmd = EZRA_CONFIG.quickCommands.find(c => c.action === action);
        let prompt = cmd?.prompt || '';

        // For deal-building actions, auto-append form context
        const ctx = getFormContext();
        if (ctx.hasFormData && ctx.helocAmount > 0 && ['build_quote', 'structure_deal', 'recommend_program', 'client_script'].includes(action)) {
            const name = ctx.clientName !== 'Borrower' ? ctx.clientName : '';
            const details = [];
            if (name) details.push(name);
            if (ctx.homeValue > 0) details.push(`$${(ctx.homeValue / 1000).toFixed(0)}K property`);
            if (ctx.mortgageBalance > 0) details.push(`$${(ctx.mortgageBalance / 1000).toFixed(0)}K mortgage`);
            if (ctx.helocAmount > 0) details.push(`$${(ctx.helocAmount / 1000).toFixed(0)}K HELOC`);
            if (details.length > 0) {
                prompt += ' — ' + details.join(', ');
            }
        }

        const input = document.getElementById('ezra-input');
        input.value = prompt;
        input.focus();
        autoResizeTextarea();
    }

    // ============================================
    // DEAL RADAR UI
    // ============================================
    async function showDealRadar() {
        EzraState.activeTab = 'deal-radar';

        const messagesContainer = document.getElementById('ezra-messages');
        messagesContainer.innerHTML = `
            <div class="ezra-deal-radar">
                <div class="ezra-dr-header">
                    <h3>🎯 Deal Radar</h3>
                    <p>AI-powered equity opportunity scanner</p>
                </div>
                <div class="ezra-dr-actions">
                    <button class="ezra-dr-btn primary" onclick="Ezra.scanDealRadar()">
                        <span>🔍</span> Scan Database
                    </button>
                    <button class="ezra-dr-btn secondary" onclick="Ezra.showDealDashboard()">
                        <span>📊</span> Dashboard
                    </button>
                </div>
                <div id="ezra-dr-content" class="ezra-dr-content">
                    <div class="ezra-dr-empty">
                        <span class="ezra-dr-icon">📡</span>
                        <p>Click "Scan Database" to find equity opportunities in your borrower database</p>
                    </div>
                </div>
            </div>
        `;

        // Load existing opportunities if available
        loadDealOpportunities();
    }

    async function loadDealOpportunities() {
        if (!EzraState.user) return;

        try {
            const { data, error } = await EzraState.supabase
                .from('deal_radar')
                .select(`
                    *,
                    borrowers (first_name, last_name, credit_score)
                `)
                .eq('loan_officer_id', EzraState.user.id)
                .eq('status', 'new')
                .gt('expires_at', new Date().toISOString())
                .order('priority_score', { ascending: false })
                .limit(10);

            if (error) throw error;

            if (data && data.length > 0) {
                renderDealOpportunities(data);
            }
        } catch (e) {
            console.error('Error loading deal opportunities:', e);
        }
    }

    function renderDealOpportunities(opportunities) {
        const content = document.getElementById('ezra-dr-content');
        if (!content) return;

        const totalEquity = opportunities.reduce((sum, opp) => sum + (opp.tappable_equity || 0), 0);

        content.innerHTML = `
            <div class="ezra-dr-stats">
                <div class="ezra-dr-stat">
                    <span class="ezra-dr-stat-value">${opportunities.length}</span>
                    <span class="ezra-dr-stat-label">Opportunities</span>
                </div>
                <div class="ezra-dr-stat">
                    <span class="ezra-dr-stat-value">$${(totalEquity / 1000).toFixed(0)}k</span>
                    <span class="ezra-dr-stat-label">Total Equity</span>
                </div>
            </div>
            <div class="ezra-dr-list">
                ${opportunities.map(opp => `
                    <div class="ezra-dr-card" data-opp-id="${opp.id}">
                        <div class="ezra-dr-card-header">
                            <span class="ezra-dr-type">${formatOpportunityType(opp.opportunity_type)}</span>
                            <span class="ezra-dr-priority" style="--priority: ${opp.priority_score}">
                                ${opp.priority_score >= 80 ? '🔥' : opp.priority_score >= 60 ? '⚡' : '💡'}
                            </span>
                        </div>
                        <div class="ezra-dr-card-body">
                            <h4>${opp.borrowers?.first_name} ${opp.borrowers?.last_name}</h4>
                            <div class="ezra-dr-metrics">
                                <span class="ezra-dr-equity">$${(opp.tappable_equity / 1000).toFixed(0)}k tappable</span>
                                <span class="ezra-dr-cltv">${opp.current_combined_ltv?.toFixed(1)}% CLTV</span>
                            </div>
                            <p class="ezra-dr-strategy">${opp.suggested_strategy?.substring(0, 100)}...</p>
                        </div>
                        <div class="ezra-dr-card-actions">
                            <button class="ezra-dr-action-btn" onclick="Ezra.createQuoteFromDeal('${opp.id}')">
                                Create Quote
                            </button>
                            <button class="ezra-dr-action-btn secondary" onclick="Ezra.viewDealDetails('${opp.id}')">
                                Details
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function formatOpportunityType(type) {
        const types = {
            heloc: 'HELOC',
            cash_out_refi: 'Cash-Out Refi',
            debt_consolidation: 'Debt Consolidation',
            rate_reduction: 'Rate Reduction',
            equity_access: 'Equity Access'
        };
        return types[type] || type;
    }

    async function scanDealRadar() {
        const content = document.getElementById('ezra-dr-content');
        content.innerHTML = `
            <div class="ezra-dr-scanning">
                <div class="ezra-dr-spinner"></div>
                <p>Scanning borrower database for equity opportunities...</p>
                <p class="ezra-dr-sub">This may take a moment</p>
            </div>
        `;

        try {
            const response = await fetch(`${EzraState.supabase.supabaseUrl}/functions/v1/deal-radar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${EzraState.supabase.supabaseKey}`
                },
                body: JSON.stringify({
                    action: 'full_scan',
                    loanOfficerId: EzraState.user.id
                })
            });

            const result = await response.json();

            if (result.success) {
                showToast(`Found ${result.opportunitiesFound} opportunities!`, 'success');
                loadDealOpportunities();
            } else {
                throw new Error(result.error);
            }
        } catch (e) {
            console.error('Deal Radar scan error:', e);
            content.innerHTML = `
                <div class="ezra-dr-error">
                    <span>⚠️</span>
                    <p>Scan failed. Please try again.</p>
                    <button onclick="Ezra.scanDealRadar()">Retry</button>
                </div>
            `;
        }
    }

    async function createQuoteFromDeal(opportunityId) {
        try {
            const { data: opp, error } = await EzraState.supabase
                .from('deal_radar')
                .select(`*, borrowers (*)`)
                .eq('id', opportunityId)
                .single();

            if (error) throw error;

            // Build quote from opportunity data
            const quoteMessage = `Build a HELOC quote for ${opp.borrowers.first_name} ${opp.borrowers.last_name}, ` +
                `$${(opp.tappable_equity / 1000).toFixed(0)}k equity available, ` +
                `${opp.current_combined_ltv?.toFixed(1)}% CLTV`;

            // Switch back to chat and send
            EzraState.activeTab = 'chat';
            document.getElementById('ezra-input').value = quoteMessage;
            sendMessage();

        } catch (e) {
            console.error('Error creating quote from deal:', e);
            showToast('Failed to create quote', 'error');
        }
    }

    async function viewDealDetails(opportunityId) {
        // Show detailed view in chat
        EzraState.activeTab = 'chat';
        document.getElementById('ezra-input').value = `Show me details for deal opportunity ${opportunityId}`;
        sendMessage();
    }

    async function showDealDashboard() {
        try {
            const response = await fetch(`${EzraState.supabase.supabaseUrl}/functions/v1/deal-radar`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${EzraState.supabase.supabaseKey}`
                },
                body: JSON.stringify({
                    action: 'get_dashboard',
                    loanOfficerId: EzraState.user.id
                })
            });

            const result = await response.json();

            // Display dashboard in chat
            EzraState.activeTab = 'chat';
            const dashboardText = formatDashboardText(result.dashboard);
            addMessage('assistant', dashboardText);

        } catch (e) {
            console.error('Error loading dashboard:', e);
            showToast('Failed to load dashboard', 'error');
        }
    }

    function formatDashboardText(dashboard) {
        return `## 📊 Deal Radar Dashboard

**Overview**
• Total Opportunities: ${dashboard.total_opportunities || 0}
• Total Tappable Equity: $${((dashboard.total_tappable_equity || 0) / 1000).toFixed(0)}k

**By Opportunity Type**
${Object.entries(dashboard.by_type || {}).map(([type, count]) => `• ${formatOpportunityType(type)}: ${count}`).join('\n')}

**Top Opportunities**
${(dashboard.top_opportunities || []).slice(0, 5).map((opp, i) =>
            `${i + 1}. ${opp.type} - $${(opp.equity / 1000).toFixed(0)}k equity (${opp.confidence * 100}% confidence)`
        ).join('\n')}

Use the **Deal Radar** tab to view all opportunities and create quotes.`;
    }

    // ============================================
    // AI ROUTING (Task 3)
    // ============================================
    async function routeToAI(message) {
        // Check for pasted lender portal data FIRST (Figure, etc.) — most specific
        const portalData = parseLenderPortalData(message);
        if (portalData) {
            showTypingIndicator();
            await new Promise(r => setTimeout(r, 400));
            hideTypingIndicator();

            const applied = applyMultiTierData(portalData);

            // Build tier summary — show which tiers have rates vs just origination fees
            const tierLines = portalData.tiers.map(t => {
                const rateCount = Object.keys(t.fixed).length + Object.keys(t.variable).length;
                const rateStr = Object.entries(t.fixed).map(([term, rate]) => `${term}yr @ ${rate}%`).join(', ');
                if (rateCount > 0) {
                    return `**Tier ${t.tierNum}** (${t.origPct}% orig${t.origAmount ? ', $' + t.origAmount.toLocaleString() + ' fee' : ''}): ${rateStr}`;
                }
                return `**Tier ${t.tierNum}** (${t.origPct}% orig${t.origAmount ? ', $' + t.origAmount.toLocaleString() + ' fee' : ''}): *rates not shown — tell me the rates for this tier*`;
            }).join('\n');

            // Summary values
            const cashStr = portalData.cashAmount ? `**Cash to Borrower:** $${portalData.cashAmount.toLocaleString()}` : '';
            const drawStr = portalData.initialDrawAmount ? `**Initial Draw:** $${portalData.initialDrawAmount.toLocaleString()}` : '';
            const totalStr = portalData.totalLoanAmount ? `**Total Loan Amount:** $${portalData.totalLoanAmount.toLocaleString()}` : '';
            const payoffStr = portalData.mortgagePayoff ? `**Payoff/Closing Costs:** $${portalData.mortgagePayoff.toLocaleString()}` : '';
            const summaryParts = [cashStr, drawStr, totalStr, payoffStr].filter(Boolean).join('\n');

            // Variable rate note
            const varNote = portalData.hasVariableRates
                ? '\n\nVariable rates were detected and applied to the variable rate row. Both fixed and variable rates are populated.'
                : '';

            // Note about missing tiers
            const tiersWithoutRates = portalData.tiers.filter(t => Object.keys(t.fixed).length === 0);
            const missingNote = tiersWithoutRates.length > 0
                ? `\n\n*Note: Figure only shows rates for the selected origination fee. Tiers ${tiersWithoutRates.map(t => t.tierNum).join(' and ')} need rates — paste the page again after clicking each origination fee, or tell me the rates.*`
                : '';

            return {
                content: `**Figure Portal Data Imported**\n\n${summaryParts ? summaryParts + '\n\n' : ''}**Pricing Tiers:**\n${tierLines}${varNote}${missingNote}\n\n${applied} fields populated. Say **"undo"** to revert.\nSay "go with tier 2 at 20 year" to highlight a specific option.`,
                metadata: { model: 'local', intent: 'portal_import' }
            };
        }

        // Check for conversational rate data (user telling Ezra rates per tier)
        const rateData = parseConversationalRates(message);
        if (rateData && rateData.tiers.length > 0) {
            showTypingIndicator();
            await new Promise(r => setTimeout(r, 400));
            hideTypingIndicator();

            const applied = applyMultiTierData(rateData);
            const tierSummary = rateData.tiers.map(t => {
                const fixedStr = Object.entries(t.fixed).map(([term, rate]) => `${term}yr @ ${rate}%`).join(', ');
                const varStr = Object.entries(t.variable || {}).map(([term, rate]) => `${term}yr var @ ${rate}%`).join(', ');
                return `**Tier ${t.tierNum}** (${t.origPct}% orig): ${fixedStr}${varStr ? ' | ' + varStr : ''}`;
            }).join('\n');

            const ctx = getFormContext();
            const helocAmt = rateData.helocAmount || ctx.helocAmount;
            const propVal = rateData.propertyValue || ctx.homeValue;

            // Build payment summary for the recommended tier
            const recTier = rateData.tiers.find(t => t.tierNum === 2) || rateData.tiers[0];
            let paymentInfo = '';
            if (helocAmt > 0 && recTier) {
                const terms = Object.entries(recTier.fixed).sort((a, b) => parseInt(b[0]) - parseInt(a[0]));
                paymentInfo = '\n\n**Payment Estimates (Tier ' + recTier.tierNum + '):**\n' +
                    terms.map(([term, rate]) => {
                        const pmt = calcAmortizedPayment(helocAmt, rate, parseInt(term));
                        return `• ${term}yr Fixed @ ${rate}% → $${pmt.toLocaleString()}/mo`;
                    }).join('\n');
            }

            return {
                content: `**Quote Data Applied**\n\n${rateData.borrowerName ? `**Borrower:** ${rateData.borrowerName}\n` : ''}${propVal ? `**Property:** $${propVal.toLocaleString()}\n` : ''}${rateData.mortgageBalance ? `**Mortgage:** $${rateData.mortgageBalance.toLocaleString()}\n` : ''}${helocAmt ? `**HELOC:** $${helocAmt.toLocaleString()}\n` : ''}\n**Rate Matrix:**\n${tierSummary}${paymentInfo}\n\n${applied} fields populated. Say **"undo"** to revert.\nUse the tier selector or say "go with tier 2 at 20 year" to highlight a specific option.`,
                metadata: { model: 'local', intent: 'rate_import' }
            };
        }

        // Try EzraReal command parsing (simple quote/deal commands without rate data)
        if (window.EzraReal) {
            const parsed = window.EzraReal.parseCommand(message);
            if (parsed) {
                showTypingIndicator();
                const result = await window.EzraReal.processCommand(parsed.command, parsed.params);
                hideTypingIndicator();

                if (result.success) {
                    if (result.quote) EzraState.lastQuote = result.quote;
                    return {
                        content: result.message,
                        metadata: { model: 'ezra-real', intent: parsed.command },
                        autoFillFields: result.quote ? result.quote : null,
                        isRealData: true
                    };
                } else if (result.error) {
                    return {
                        content: `I couldn't process that command: ${result.error}. Let me try a different approach.`,
                        metadata: { model: 'fallback', intent: 'error_recovery' }
                    };
                }
            }
        }

        // Check for quote tool interaction commands (tier/term/field changes)
        const quoteCmd = parseQuoteCommand(message);
        if (quoteCmd) {
            showTypingIndicator();
            await new Promise(r => setTimeout(r, 300)); // Brief delay for UX
            hideTypingIndicator();
            const response = executeQuoteCommand(quoteCmd);
            if (response) {
                return {
                    content: response,
                    metadata: { model: 'local', intent: 'quote_command' }
                };
            }
        }

        // Fall back to AI service for non-command queries
        const intent = determineIntent(message);
        let model = EzraState.currentModel;

        if (intent === 'deal_architect' || intent === 'quote_calculation' || intent === 'quote_creation') {
            model = 'claude';
        } else if (intent === 'complex_strategy' || intent === 'program_recommendation') {
            model = 'gpt';
        } else if (intent === 'simple_chat') {
            model = 'gemini';
        }

        const response = await callAIService(message, model, intent);

        return {
            content: response.content,
            metadata: { model, intent },
            autoFillFields: response.autoFillFields
        };
    }

    // ============================================
    // QUOTE TOOL INTERACTION — Conversational Commands
    // ============================================

    // Parse natural language commands that interact with the quote tool
    function parseQuoteCommand(message) {
        const lower = message.toLowerCase().trim();

        // --- UNDO ---
        if (/^undo$/i.test(lower) || /^undo\s+(?:that|last|changes|import|fill)/i.test(lower) || /^revert$/i.test(lower)) {
            return { action: 'undo' };
        }

        // --- TIER + TERM COMBO (check FIRST — more specific) ---
        // "tier 2 at 20", "t1 30 year", "tier 3 at 15", "option 1 at 30", "go with tier 2 at 15 year"
        const comboMatch = lower.match(/(?:tier|option)\s*(\d)\s*(?:at|@|,)?\s*(\d+)\s*(?:year|yr|y)?/i)
            || lower.match(/\bt(\d)\s+(\d+)\s*(?:year|yr|y)?/i)
            || lower.match(/(?:go\s*(?:with)?|use|select)\s*(?:tier|option|t)\s*(\d)\s*(?:at|@|,)\s*(\d+)/i);
        if (comboMatch) {
            const tierNum = parseInt(comboMatch[1]);
            const termNum = parseInt(comboMatch[2]);
            if (tierNum >= 1 && tierNum <= 3 && [5, 10, 15, 20, 30].includes(termNum)) {
                return { action: 'select_both', tier: 't' + tierNum, term: termNum };
            }
        }

        // --- TIER SELECTION ---
        // "go with tier 1", "use tier 2", "option 1", "go with option 3", "select tier 2"
        const tierMatch = lower.match(/(?:go\s*(?:with)?|use|select|switch\s*to|pick|choose)\s*(?:tier|option|t)\s*(\d)/i)
            || lower.match(/^(?:tier|option|t)\s*(\d)$/i);
        if (tierMatch) {
            const tierNum = parseInt(tierMatch[1]);
            if (tierNum >= 1 && tierNum <= 3) {
                return { action: 'select_tier', tier: 't' + tierNum };
            }
        }

        // --- TERM SELECTION ---
        // "go with 30 year", "switch to 15", "make it 20 year", "30 yr", "use 10 year term"
        const termMatch = lower.match(/(?:go\s*(?:with)?|use|select|switch\s*to|pick|choose|make\s*it)\s*(\d+)\s*(?:year|yr|y)?(?:\s*term)?/i)
            || lower.match(/^(\d+)\s*(?:year|yr|y)(?:\s*term)?$/i);
        if (termMatch) {
            const termNum = parseInt(termMatch[1]);
            if ([5, 10, 15, 20, 30].includes(termNum)) {
                return { action: 'select_term', term: termNum };
            }
        }

        // --- HIGHLIGHT / SHOW ---
        // "highlight that", "highlight tier 2", "show me tier 1", "show me the 30 year"
        const highlightTierMatch = lower.match(/(?:highlight|show\s*(?:me)?|focus)\s*(?:tier|option|t)\s*(\d)/i);
        if (highlightTierMatch) {
            const tierNum = parseInt(highlightTierMatch[1]);
            if (tierNum >= 1 && tierNum <= 3) {
                return { action: 'highlight_tier', tier: 't' + tierNum };
            }
        }
        if (/^highlight\s*(?:that|this|it)$/i.test(lower)) {
            return { action: 'highlight_current' };
        }

        // --- FIELD ADJUSTMENTS ---
        // "change cash to $150K", "set home value to $800,000", "make the cash $200k"
        // "change mortgage to $400k", "adjust the heloc to $100k"
        const fieldChangeMatch = lower.match(/(?:change|set|make|adjust|update)\s*(?:the\s*)?(.+?)\s*(?:to|=)\s*\$?\s*([0-9,.]+)\s*(k|m)?/i);
        if (fieldChangeMatch) {
            let fieldName = fieldChangeMatch[1].trim().toLowerCase();
            let val = parseFloat(fieldChangeMatch[2].replace(/,/g, ''));
            if (fieldChangeMatch[3] && fieldChangeMatch[3].toLowerCase() === 'k') val *= 1000;
            if (fieldChangeMatch[3] && fieldChangeMatch[3].toLowerCase() === 'm') val *= 1000000;

            const fieldAliases = {
                'cash': 'in-net-cash', 'cash back': 'in-net-cash', 'net cash': 'in-net-cash', 'heloc': 'in-net-cash', 'heloc amount': 'in-net-cash', 'draw': 'in-net-cash',
                'home value': 'in-home-value', 'property value': 'in-home-value', 'property': 'in-home-value', 'home': 'in-home-value', 'value': 'in-home-value',
                'mortgage': 'in-mortgage-balance', 'mortgage balance': 'in-mortgage-balance', '1st mortgage': 'in-mortgage-balance', 'first mortgage': 'in-mortgage-balance', 'balance': 'in-mortgage-balance',
                'payoff': 'in-refi-balance', 'heloc payoff': 'in-refi-balance', 'refi balance': 'in-refi-balance', 'existing heloc': 'in-refi-balance',
                'credit': 'in-client-credit', 'credit score': 'in-client-credit', 'score': 'in-client-credit', 'fico': 'in-client-credit'
            };

            const fieldId = fieldAliases[fieldName];
            if (fieldId) {
                return { action: 'set_field', fieldId: fieldId, value: val, fieldLabel: fieldName };
            }
        }

        // --- INTEREST ONLY TOGGLE ---
        // "switch to interest only", "make it IO", "turn on interest only"
        if (/(?:switch\s*to|make\s*it|turn\s*on|enable)\s*(?:interest[\s-]?only|IO|i\.o\.)/i.test(lower)) {
            return { action: 'toggle_io', enable: true };
        }
        if (/(?:switch\s*to|make\s*it|turn\s*off|disable)\s*(?:p&i|p\s*and\s*i|principal|amortiz|fully\s*amort)/i.test(lower)) {
            return { action: 'toggle_io', enable: false };
        }

        // --- SHORTHAND ---
        // "lower the rate", "bump the cash", "more cash", "less origination"
        if (/(?:lower|reduce|decrease)\s*(?:the\s*)?(?:rate|interest)/i.test(lower)) {
            return { action: 'nudge', direction: 'lower_rate' };
        }
        if (/(?:raise|increase|bump|more)\s*(?:the\s*)?(?:cash|heloc|draw)/i.test(lower)) {
            return { action: 'nudge', direction: 'more_cash' };
        }
        if (/(?:lower|reduce|less)\s*(?:the\s*)?(?:cash|heloc|draw)/i.test(lower)) {
            return { action: 'nudge', direction: 'less_cash' };
        }

        return null; // Not a quote command
    }

    // Execute a parsed quote command and return a response message
    function executeQuoteCommand(cmd) {
        // Handle undo
        if (cmd.action === 'undo') {
            const restored = restoreForm();
            return restored
                ? '**Undo Complete** — Quote fields restored to their previous state.'
                : 'Nothing to undo — no previous state saved.';
        }

        const fmt = (n) => '$' + Number(n).toLocaleString();
        const tierNames = { t1: 'Tier 1', t2: 'Tier 2', t3: 'Tier 3' };

        function setField(id, value) {
            const field = document.getElementById(id);
            if (!field) return false;
            field.value = value;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            field.style.transition = 'background 0.3s';
            field.style.background = '#dcfce7';
            setTimeout(() => field.style.background = '', 1500);
            return true;
        }

        function refreshQuote() {
            if (typeof updateQuote === 'function') {
                setTimeout(() => updateQuote(), 50);
            }
        }

        function readSnapshot() {
            const g = (id) => { const el = document.getElementById(id); return el ? (el.value || el.innerText || '').trim() : ''; };
            return {
                rate: g('snap-rate'),
                term: g('snap-term'),
                payment: g('snap-payment'),
                totalLoan: g('snap-total-loan'),
                origPts: g('snap-orig-perc'),
                origAmt: g('snap-orig-amt'),
                tier: document.getElementById('rec-tier-select')?.value || 't2'
            };
        }

        function highlightTierTable(tierId) {
            // Flash the tier's table with a gold border
            const tableEl = document.getElementById(tierId + '-table');
            if (tableEl) {
                tableEl.style.transition = 'box-shadow 0.3s';
                tableEl.style.boxShadow = '0 0 12px rgba(197,160,89,0.6)';
                setTimeout(() => { tableEl.style.boxShadow = ''; }, 3000);
            }
            // Scroll the matrix into view
            const matrixEl = document.querySelector('.matrix-container');
            if (matrixEl) matrixEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }

        switch (cmd.action) {
            case 'select_tier': {
                const sel = document.getElementById('rec-tier-select');
                if (sel) { sel.value = cmd.tier; sel.dispatchEvent(new Event('change', { bubbles: true })); }
                refreshQuote();
                highlightTierTable(cmd.tier);
                const snap = readSnapshot();
                return `**Done — switched to ${tierNames[cmd.tier]}**\n\nUpdated snapshot:\n• Rate: ${snap.rate}% | Term: ${snap.term}yr | Payment: ${snap.payment}\n• Origination: ${snap.origPts}% (${snap.origAmt}) | Total Loan: ${snap.totalLoan}\n\nThe quote tool has been updated. Want me to adjust the term too?`;
            }
            case 'select_term': {
                const sel = document.getElementById('rec-term-select');
                if (sel) { sel.value = String(cmd.term); sel.dispatchEvent(new Event('change', { bubbles: true })); }
                refreshQuote();
                const snap = readSnapshot();
                return `**Done — switched to ${cmd.term}-Year term**\n\nUpdated snapshot:\n• Rate: ${snap.rate}% | Term: ${snap.term}yr | Payment: ${snap.payment}\n• Origination: ${snap.origPts}% (${snap.origAmt}) | Total Loan: ${snap.totalLoan}\n\nQuote updated. Need to change the tier or adjust any values?`;
            }
            case 'select_both': {
                const tierSel = document.getElementById('rec-tier-select');
                const termSel = document.getElementById('rec-term-select');
                if (tierSel) { tierSel.value = cmd.tier; tierSel.dispatchEvent(new Event('change', { bubbles: true })); }
                if (termSel) { termSel.value = String(cmd.term); termSel.dispatchEvent(new Event('change', { bubbles: true })); }
                refreshQuote();
                highlightTierTable(cmd.tier);
                const snap = readSnapshot();
                return `**Done — ${tierNames[cmd.tier]} at ${cmd.term} years**\n\nUpdated snapshot:\n• Rate: ${snap.rate}% | Term: ${snap.term}yr | Payment: ${snap.payment}\n• Origination: ${snap.origPts}% (${snap.origAmt}) | Total Loan: ${snap.totalLoan}\n\nQuote updated and highlighted. Anything else to adjust?`;
            }
            case 'highlight_tier': {
                highlightTierTable(cmd.tier);
                const g = (id) => { const el = document.getElementById(id); return el ? el.innerText.trim() : ''; };
                return `**Highlighted ${tierNames[cmd.tier]}**\n\n| Term | Rate | Payment |\n|------|------|--------|\n| 30yr | ${g('out-' + cmd.tier + '-30-rate')}% | ${g('out-' + cmd.tier + '-30-pay')} |\n| 20yr | ${g('out-' + cmd.tier + '-20-rate')}% | ${g('out-' + cmd.tier + '-20-pay')} |\n| 15yr | ${g('out-' + cmd.tier + '-15-rate')}% | ${g('out-' + cmd.tier + '-15-pay')} |\n| 10yr | ${g('out-' + cmd.tier + '-10-rate')}% | ${g('out-' + cmd.tier + '-10-pay')} |\n\nOrigination: ${g('out-' + cmd.tier + '-orig')}%\n\nWant to go with this tier? Just say "use ${tierNames[cmd.tier].toLowerCase()}".`;
            }
            case 'highlight_current': {
                const currentTier = document.getElementById('rec-tier-select')?.value || 't2';
                highlightTierTable(currentTier);
                return `**Highlighted current recommendation (${tierNames[currentTier]})**\n\nThe recommended tier is now scrolled into view with a gold highlight. Want to switch to a different tier?`;
            }
            case 'set_field': {
                setField(cmd.fieldId, cmd.value);
                refreshQuote();
                // Read updated snapshot after a brief delay
                setTimeout(() => { }, 100);
                const snap = readSnapshot();
                const displayVal = cmd.fieldId === 'in-client-credit' ? String(cmd.value) : fmt(cmd.value);
                return `**Done — ${cmd.fieldLabel} updated to ${displayVal}**\n\nQuote recalculated:\n• Rate: ${snap.rate}% | Term: ${snap.term}yr | Payment: ${snap.payment}\n• Total Loan: ${snap.totalLoan}\n\nAnything else to adjust?`;
            }
            case 'toggle_io': {
                const toggle = document.getElementById('toggle-interest-only');
                if (toggle) {
                    const isActive = toggle.classList.contains('active');
                    if (cmd.enable && !isActive) toggle.click();
                    if (!cmd.enable && isActive) toggle.click();
                }
                refreshQuote();
                const snap = readSnapshot();
                return cmd.enable
                    ? `**Switched to Interest-Only payments**\n\nPayments now show interest-only amounts (draw period).\n• Payment: ${snap.payment}\n\nRemember: after the draw period ends, payments convert to fully amortized P&I.`
                    : `**Switched to Principal & Interest payments**\n\nPayments now show fully amortized P&I.\n• Payment: ${snap.payment}`;
            }
            case 'nudge': {
                if (cmd.direction === 'lower_rate') {
                    // Move to tier 1 (lower rate, higher points)
                    const sel = document.getElementById('rec-tier-select');
                    if (sel) { sel.value = 't1'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
                    refreshQuote();
                    highlightTierTable('t1');
                    const snap = readSnapshot();
                    return `**Switched to Tier 1 for the lowest rate**\n\nTier 1 offers the lowest rates with higher origination points.\n• Rate: ${snap.rate}% | Payment: ${snap.payment}\n• Origination: ${snap.origPts}% (${snap.origAmt})\n\nThe trade-off is higher upfront cost for a lower monthly payment.`;
                }
                if (cmd.direction === 'more_cash') {
                    const el = document.getElementById('in-net-cash');
                    const current = parseFloat(el?.value) || 0;
                    const newVal = current + 25000;
                    setField('in-net-cash', newVal);
                    refreshQuote();
                    const snap = readSnapshot();
                    return `**Cash increased by $25,000 → ${fmt(newVal)}**\n\n• Payment: ${snap.payment} | Total Loan: ${snap.totalLoan}\n\nSay "more cash" again or specify an exact amount.`;
                }
                if (cmd.direction === 'less_cash') {
                    const el = document.getElementById('in-net-cash');
                    const current = parseFloat(el?.value) || 0;
                    const newVal = Math.max(0, current - 25000);
                    setField('in-net-cash', newVal);
                    refreshQuote();
                    const snap = readSnapshot();
                    return `**Cash decreased by $25,000 → ${fmt(newVal)}**\n\n• Payment: ${snap.payment} | Total Loan: ${snap.totalLoan}`;
                }
                return 'I can adjust the quote — tell me what to change specifically.';
            }
            default:
                return null;
        }
    }

    function determineIntent(message) {
        const lower = message.toLowerCase();

        // Check for quote tool interaction commands FIRST
        const quoteCmd = parseQuoteCommand(message);
        if (quoteCmd) {
            return 'quote_command';
        }

        // Deal architect — structured deal building
        if (/structure this deal|build.*quote for|ezra structure|ezra build/i.test(lower)) {
            return 'deal_architect';
        }
        // Quote creation
        if (/create.*quote|build.*quote|make.*quote|generate.*quote/i.test(lower)) {
            return 'quote_creation';
        }
        // Payment / calculation
        if (/calculate|cltv|payment|amortiz/i.test(lower)) {
            return 'quote_calculation';
        }
        // Program recommendation
        if (/recommend|best program|which program|suggest.*program|which heloc/i.test(lower)) {
            return 'program_recommendation';
        }
        // Deal strategy
        if (/strategy|optimize|approval|probability/i.test(lower)) {
            return 'complex_strategy';
        }
        // Objection handling
        if (/objection|handle|respond|concern|pushback/i.test(lower)) {
            return 'objection_handling';
        }
        // Sales coach / explain to client
        if (/explain|script|say|tell|presentation|how.*present|how.*explain/i.test(lower)) {
            return 'sales_coach';
        }
        // Approval process questions
        if (/process|underwriting|approval|how.*work|soft.*pull|hard.*pull|fund|timeline/i.test(lower)) {
            return 'approval_process';
        }
        return 'simple_chat';
    }

    async function callAIService(message, model, intent) {
        const formCtx = getFormContext();
        // Merge form data with any inline numbers/names from the message
        const ctx = parseMessageContext(message, formCtx);
        let contextSummary = buildContextSummary();

        // --- Append Local Fallback Knowledge Base Search ---
        const localKbContext = EZRA_KNOWLEDGE.searchLocalKB(message);
        if (localKbContext) {
            contextSummary += localKbContext;
        }

        // ── Try real AI backend first ──
        try {
            const aiResponse = await callAIProxy(message, model, intent, contextSummary);
            if (aiResponse) {
                const autoFillData = extractAutoFillFields(aiResponse);
                return { content: aiResponse, autoFillFields: autoFillData };
            }
        } catch (e) {
            console.warn('Ezra: AI proxy unavailable, using smart templates', e.message);
        }

        // ── Fallback: dynamic templates using REAL form data ──
        return buildDynamicResponse(message, intent, ctx);
    }

    // Call the ai-proxy Edge Function
    async function callAIProxy(message, model, intent, contextSummary) {
        if (!EzraState.supabase) return null;

        const session = await EzraState.supabase.auth.getSession();
        const token = session?.data?.session?.access_token;
        if (!token) return null;

        const supabaseUrl = EzraState.supabase.supabaseUrl ||
            window.SUPABASE_URL || 'https://czzabvfzuxhpdcowgvam.supabase.co';

        // Map internal model names to provider names for the proxy
        const providerMap = { gemini: 'gemini', claude: 'anthropic', gpt: 'openai' };

        const systemPrompt = EZRA_KNOWLEDGE.buildSystemPrompt() + contextSummary;

        const response = await fetch(`${supabaseUrl}/functions/v1/ai-proxy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                action: 'generate',
                provider: providerMap[model] || 'gemini',
                systemPrompt,
                userMessage: message,
                maxTokens: 1500
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `AI proxy ${response.status}`);
        }

        const data = await response.json();
        return data.text || null;
    }

    // Build dynamic responses using REAL form data
    async function buildDynamicResponse(message, intent, ctx) {
        const fmt = (n) => '$' + Number(n).toLocaleString();
        const hasData = ctx.hasFormData;

        // Pick a rate for calculations (prefer 15yr fixed, fallback to any available)
        const bestRate = ctx.rates.fixed15 || ctx.rates.fixed30 || ctx.rates.fixed10 || ctx.rates.fixed20 || 8.25;
        const bestVarRate = ctx.rates.var10 || ctx.rates.var30 || ctx.rates.var15 || bestRate;

        // Compute payments with real data
        const payment15 = ctx.helocAmount > 0 ? calcAmortizedPayment(ctx.helocAmount, bestRate, 15) : 0;
        const payment30 = ctx.helocAmount > 0 ? calcAmortizedPayment(ctx.helocAmount, bestRate, 30) : 0;
        const payment10 = ctx.helocAmount > 0 ? calcAmortizedPayment(ctx.helocAmount, bestRate, 10) : 0;
        const payment5 = ctx.helocAmount > 0 ? calcAmortizedPayment(ctx.helocAmount, bestRate, 5) : 0;
        const ioPayment = ctx.helocAmount > 0 ? calcInterestOnlyPayment(ctx.helocAmount, bestVarRate) : 0;
        const origFeeAmt = ctx.helocAmount > 0 ? +(ctx.helocAmount * ctx.origFee / 100).toFixed(0) : 0;

        // Determine best program based on goal cues from message
        const lower = message.toLowerCase();
        let recProgram = '15 Year Fixed HELOC';
        let recDraw = '4 years';
        let recTerm = '15 years';
        let recPayment = payment15;
        let recReason = 'Balanced payoff with manageable monthly payments. Fully amortized P&I pays down principal from day one.';

        if (/cash flow|low.*payment|afford/i.test(lower)) {
            recProgram = '30 Year Fixed HELOC'; recDraw = '5 years'; recTerm = '30 years'; recPayment = payment30;
            recReason = 'Lowest monthly payment of all fixed programs. Maximizes cash flow while still paying down principal.';
        } else if (/short.*term|quick|fast.*payoff|rapid/i.test(lower)) {
            recProgram = '5 Year Fixed HELOC'; recDraw = '2 years'; recTerm = '5 years'; recPayment = payment5;
            recReason = 'Fastest payoff with shortest term. Higher payment but lowest total interest cost.';
        } else if (/flex|interest.only|variable/i.test(lower)) {
            recProgram = '10 Year Variable HELOC'; recDraw = '10 years'; recTerm = '10yr draw + 20yr repay'; recPayment = ioPayment;
            recReason = 'Interest-only payments during draw period give maximum payment flexibility.';
        } else if (/improv|renov|home.*improv/i.test(lower)) {
            recProgram = '10 Year Fixed HELOC'; recDraw = '3 years'; recTerm = '10 years'; recPayment = payment10;
            recReason = 'Moderate term with 3-year draw window — ideal for phased home improvement projects.';
        }

        // CLTV status
        const cltvStatus = ctx.cltv <= 85 ? `${ctx.cltv}% ✓ (within 85% max)` : `${ctx.cltv}% ⚠️ (exceeds 85% guideline)`;
        const cltvWarning = ctx.cltv > 85 ? `\n\n⚠️ **CLTV Warning**: At ${ctx.cltv}%, this exceeds the standard 85% maximum. Max HELOC at 85% CLTV: ${fmt(ctx.maxEquityAt85)}. Consider reducing the HELOC amount or verifying property value.` : '';

        const responses = {};

        // ── DEAL ARCHITECT ──
        responses.deal_architect = hasData && ctx.helocAmount > 0 ? `**DEAL ARCHITECT**

**Step 1 — Borrower Goal**
Analyze the best HELOC structure for ${ctx.clientName}.

**Step 2 — Equity Analysis**
• Property Value: ${fmt(ctx.homeValue)}
• First Mortgage: ${fmt(ctx.mortgageBalance)}
• Requested HELOC: ${fmt(ctx.helocAmount)}
• Combined LTV: ${cltvStatus}
• Max Available at 85%: ${fmt(ctx.maxEquityAt85)}${ctx.creditScore !== 'Not provided' ? `\n• Credit Score: ${ctx.creditScore}` : ''}

**Step 3 — Program Recommendation**
**${recProgram}** with ${recDraw} draw window.

**Why This Program**
${recReason}

**Step 4 — Payment Calculation**
• Rate: ${bestRate}%
• Monthly Payment: ${fmt(recPayment)}/mo (${recProgram.includes('Variable') ? 'interest-only during draw' : 'principal & interest'})
• Origination Fee: ${fmt(origFeeAmt)} (${ctx.origFee}%)

**Step 5 — All Program Comparison**
| Program | Payment | Type |
|---------|---------|------|
| 5yr Fixed | ${fmt(payment5)}/mo | P&I |
| 10yr Fixed | ${fmt(payment10)}/mo | P&I |
| 15yr Fixed | ${fmt(payment15)}/mo | P&I |
| 30yr Fixed | ${fmt(payment30)}/mo | P&I |
| Variable IO | ${fmt(ioPayment)}/mo | Interest-Only |

**Step 6 — Client Explanation**
"${recProgram.includes('Variable')
                ? 'During the draw period, you only pay interest on the amount you use. This keeps your payment lower while giving you access to your equity. After the draw period, the loan converts to a fully amortized repayment schedule.'
                : 'This program works more like a traditional loan. Instead of interest-only payments, the balance starts paying down right away with principal and interest. That helps build equity faster and keeps the loan on a predictable payoff schedule.'}"${cltvWarning}

AUTO_FILL_FIELDS
${JSON.stringify({
                    borrower_name: ctx.clientName,
                    credit_score: ctx.creditScore !== 'Not provided' ? ctx.creditScore : undefined,
                    property_value: ctx.homeValue,
                    first_mortgage_balance: ctx.mortgageBalance,
                    heloc_amount: ctx.helocAmount,
                    combined_ltv: ctx.cltv,
                    program_selected: recProgram,
                    draw_period: recDraw,
                    loan_term: recTerm,
                    interest_rate: bestRate,
                    origination_fee: origFeeAmt,
                    payment_type: recProgram.includes('Variable') ? 'interest_only' : 'principal_and_interest',
                    monthly_payment_estimate: recPayment
                })}` : `**DEAL ARCHITECT**

To structure a deal, I need data in the quote form. Please fill in:
• **Home Value** — property value field
• **1st Mortgage Balance** — existing mortgage
• **HELOC Amount** — the green "Net Cash" field at the top
• **Client Name** — borrower name

Once you enter the numbers, click **"Structure Deal"** again and I'll run a full analysis with program recommendations, payment calculations, and auto-fill.

**Tip**: You can also type specifics like:
"Structure a deal — $800K property, $400K mortgage, $100K HELOC for debt consolidation"`;

        // ── QUOTE CREATION ──
        responses.quote_creation = hasData && ctx.helocAmount > 0 ? `**Building quote for ${ctx.clientName}**

**Current Form Data**
• Property Value: ${fmt(ctx.homeValue)}
• First Mortgage: ${fmt(ctx.mortgageBalance)}
• HELOC Amount: ${fmt(ctx.helocAmount)}
• CLTV: ${cltvStatus}${ctx.creditScore !== 'Not provided' ? `\n• Credit Score: ${ctx.creditScore}` : ''}

**Recommended: ${recProgram}**
• Draw Window: ${recDraw}
• Monthly Payment: ${fmt(recPayment)}/mo
• Payment Type: ${recProgram.includes('Variable') ? 'Interest-only during draw' : 'Fully amortized P&I'}

**All Fixed Options at ${bestRate}%**
• 5yr: ${fmt(payment5)}/mo | 10yr: ${fmt(payment10)}/mo | 15yr: ${fmt(payment15)}/mo | 30yr: ${fmt(payment30)}/mo
• Variable IO: ${fmt(ioPayment)}/mo

Click **Apply to Quote Tool** below to auto-fill these values.${cltvWarning}

AUTO_FILL_FIELDS
${JSON.stringify({
            borrower_name: ctx.clientName,
            credit_score: ctx.creditScore !== 'Not provided' ? ctx.creditScore : undefined,
            property_value: ctx.homeValue,
            first_mortgage_balance: ctx.mortgageBalance,
            heloc_amount: ctx.helocAmount,
            combined_ltv: ctx.cltv,
            program_selected: recProgram,
            draw_period: recDraw,
            loan_term: recTerm,
            interest_rate: bestRate,
            origination_fee: origFeeAmt,
            payment_type: recProgram.includes('Variable') ? 'interest_only' : 'principal_and_interest',
            monthly_payment_estimate: recPayment
        })}` : `I'll help you build a HELOC quote. Please enter the following in the quote form:

• **Home Value** — property value
• **1st Mortgage Balance** — current mortgage payoff
• **HELOC Amount** — the green "Net Cash" field at the top
• **Client Name** — borrower name
• **Credit Score** — estimated credit score

Or tell me the details directly:
"Build a quote — $750K home, $350K mortgage, $80K HELOC, 740 score, debt consolidation"

**Available Programs**
Fixed: 5yr / 10yr / 15yr / 30yr — fully amortized P&I from day one
Variable: 10yr draw (IO) + 20yr repay, or 5yr draw (IO)`;

        // ── QUOTE CALCULATION ──
        responses.quote_calculation = hasData && ctx.helocAmount > 0 ? `**Payment Calculations for ${ctx.clientName}**

HELOC Amount: ${fmt(ctx.helocAmount)} at ${bestRate}%

**Fixed HELOC (Principal & Interest)**
| Term | Monthly P&I | Total Interest |
|------|-------------|----------------|
| 5 Year | ${fmt(payment5)} | ${fmt(payment5 * 60 - ctx.helocAmount)} |
| 10 Year | ${fmt(payment10)} | ${fmt(payment10 * 120 - ctx.helocAmount)} |
| 15 Year | ${fmt(payment15)} | ${fmt(payment15 * 180 - ctx.helocAmount)} |
| 30 Year | ${fmt(payment30)} | ${fmt(payment30 * 360 - ctx.helocAmount)} |

**Variable HELOC (Interest-Only Draw)**
• Monthly IO: ${fmt(ioPayment)} at ${bestVarRate}% (during draw period)
• After draw: converts to fully amortized repayment

**CLTV**: ${cltvStatus}${cltvWarning}` : `**Payment Calculation**

Enter a HELOC amount in the "Net Cash" field and I'll calculate payments across all programs.

**Formulas Used:**
• Fixed P&I: Loan × [r(1+r)^n] / [(1+r)^n - 1]
• Variable IO: Loan × Rate ÷ 12
• CLTV: (First Mortgage + HELOC) ÷ Property Value

Or ask me directly: "Calculate payment on $150K at 8.25% for 15 years"`;

        // ── PROGRAM RECOMMENDATION ──
        responses.program_recommendation = hasData && ctx.helocAmount > 0 ? `**Program Recommendation for ${ctx.clientName}**

Based on ${fmt(ctx.helocAmount)} HELOC at ${ctx.cltv}% CLTV:

**Best Fit: ${recProgram}**
${recReason}
• Monthly Payment: ${fmt(recPayment)}/mo
• Draw Window: ${recDraw}

**All Options Compared**
| Program | Payment | Draw | Best For |
|---------|---------|------|----------|
| 5yr Fixed | ${fmt(payment5)} | 2yr | Rapid payoff |
| 10yr Fixed | ${fmt(payment10)} | 3yr | Home improvement |
| 15yr Fixed | ${fmt(payment15)} | 4yr | Debt consolidation |
| 30yr Fixed | ${fmt(payment30)} | 5yr | Max cash flow |
| 10yr Variable | ${fmt(ioPayment)} IO | 10yr | Payment flexibility |

Tell me about the borrower's goal and I'll refine my recommendation.${cltvWarning}` : `**Program Recommendation Guide**

**By Borrower Goal:**
• **Debt Consolidation** → 15 Year Fixed (4yr draw, P&I)
• **Short-Term Liquidity** → 5 Year Fixed (2yr draw, fastest payoff)
• **Home Improvement** → 10 Year Fixed (3yr draw, moderate)
• **Payment Flexibility** → 10 Year Variable (10yr IO draw)
• **Maximum Cash Flow** → 30 Year Fixed (5yr draw, lowest payment)

Enter borrower details in the form and click **Recommend Program** for a personalized analysis.`;

        // ── COMPLEX STRATEGY ──
        responses.complex_strategy = hasData && ctx.helocAmount > 0 ? `**Deal Strategy for ${ctx.clientName}**

**Current Position**
• Property: ${fmt(ctx.homeValue)} | Mortgage: ${fmt(ctx.mortgageBalance)} | HELOC: ${fmt(ctx.helocAmount)}
• CLTV: ${cltvStatus}
• Available equity at 85%: ${fmt(ctx.maxEquityAt85)}

**Recommended: ${recProgram}**
${recReason}
• Payment: ${fmt(recPayment)}/mo

**Approval Path**
1. Soft credit check — zero impact to score
2. AI-assisted underwriting — fast eligibility decision
3. Bank-grade income verification — secure digital process
4. Borrower selects preferred offer — full control
5. Funding possible in as fast as 5 days

**Alternative Structures**
• 10yr Fixed: ${fmt(payment10)}/mo — faster payoff, lower total interest
• 30yr Fixed: ${fmt(payment30)}/mo — lower payment, more cash flow
• Variable IO: ${fmt(ioPayment)}/mo — interest-only during draw

Present all options transparently. Let the borrower decide.${cltvWarning}` : `**Deal Strategy Analysis**

Enter borrower details in the quote form (Home Value, Mortgage Balance, HELOC Amount) and I'll provide a complete strategy with:
• Equity evaluation & CLTV check
• Program recommendation with reasoning
• Payment comparison across all structures
• Approval path & timeline`;

        // ── OBJECTION HANDLING ──
        responses.objection_handling = `**Objection Response Scripts**

**"The rate seems high"**
"I understand rate is important. You can see your actual offers with just a soft credit check — no impact to your score. Unlike credit cards at 22%+, a HELOC at 8-9% saves thousands while providing structured payoff."${hasData && ctx.helocAmount > 0 ? `\n*For ${ctx.clientName}: At ${bestRate}%, the ${recProgram} payment is ${fmt(recPayment)}/mo.*` : ''}

**"How long does this take?"**
"AI-assisted underwriting and digital verification — some approvals fund in as little as 5 days."

**"Is my information safe?"**
"Bank-grade security. We never sell your data to third parties."

**"I'm not sure I need this right now"**
"View potential offers with just a soft credit check — no commitment, no impact to credit."

**"Why not just refinance?"**
"A refinance replaces your first mortgage — you'd give up your current rate. A HELOC accesses equity without touching your first mortgage."`;

        // ── SALES COACH ──
        responses.sales_coach = hasData && ctx.helocAmount > 0 ? `**Sales Coach — Presenting to ${ctx.clientName}**

**Loan Structure**
${recProgram} with ${recDraw} draw window.
${recProgram.includes('Variable') ? 'Interest-only payments during draw period.' : 'Fully amortized principal and interest payments.'}
Payment: ${fmt(recPayment)}/mo on ${fmt(ctx.helocAmount)} at ${bestRate}%

**Strategy**
${recReason}

**Suggested Client Script**
"${ctx.clientName.split(' ')[0] || 'Mr./Ms. Borrower'}, ${recProgram.includes('Variable')
                ? `this program gives you maximum flexibility. During the ${recDraw} draw period, you only pay interest — that's ${fmt(ioPayment)} per month.`
                : `this program works more like a traditional loan. Your payment of ${fmt(recPayment)} per month includes both principal and interest, so the balance pays down right away.`}"

**Process Script**
"You can view your offers with a soft credit check — no impact to your score. Our technology evaluates eligibility quickly, verifies income securely, and presents multiple options. Some approvals fund in as little as 5 days."

**Key Talking Points**
• Soft credit check — no hard pull
• CLTV at ${ctx.cltv}% — ${ctx.cltv <= 85 ? 'well within guidelines' : 'may need adjustment'}
• ${recProgram.includes('Variable') ? 'IO flexibility during draw' : 'Fixed rate = predictable payments'}
• Bank-grade security — data never sold` : `**Sales Coach**

Fill in the borrower details in the quote form and I'll generate:
• A customized loan structure breakdown
• Personalized client script using their name
• Strategy explanation tailored to their situation

Or tell me: "How should I present a $100K HELOC for debt consolidation?"`;

        // ── APPROVAL PROCESS ──
        responses.approval_process = `**Approval Process — How It Works**

**Step 1 — Application** — Borrower submits basic info. No commitment.
**Step 2 — Soft Credit Check** — No impact to score. See potential offers risk-free.
**Step 3 — AI-Assisted Underwriting** — Automated profile evaluation.
**Step 4 — Income Verification** — Secure bank-grade digital verification.
**Step 5 — Offer Selection** — Borrower reviews structures, chooses best fit.
**Step 6 — Final Approval & Closing** — Some loans fund in as little as 5 days.${hasData && ctx.helocAmount > 0 ? `\n\n**For ${ctx.clientName}'s Deal**\n• HELOC: ${fmt(ctx.helocAmount)} | CLTV: ${ctx.cltv}%\n• ${ctx.cltv <= 85 ? 'CLTV within guidelines — should move through underwriting smoothly.' : '⚠️ CLTV exceeds 85% — may require additional review.'}` : ''}`;

        // ── SIMPLE CHAT ──
        responses.simple_chat = `I'm Ezra, your AI loan structuring co-pilot.${hasData ? `\n\n**Current Quote**: ${ctx.clientName !== 'Borrower' ? ctx.clientName + ' — ' : ''}${ctx.helocAmount > 0 ? fmt(ctx.helocAmount) + ' HELOC' : 'No amount set'}${ctx.homeValue > 0 ? ' | ' + fmt(ctx.homeValue) + ' property' : ''}${ctx.cltv > 0 ? ' | ' + ctx.cltv + '% CLTV' : ''}` : ''}

Here's what I can do:
• **Build Quote** — auto-fill quote from borrower data
• **Structure Deal** — full deal analysis with recommendations
• **Recommend Program** — best program for borrower's goal
• **Calculate Payment** — run numbers on any scenario
• **Handle Objections** — scripts for common concerns
• **Client Scripts** — word-for-word presentation scripts

**Quick Commands** — talk to me like a colleague:
• "Go with tier 2" or "tier 1 at 30" — switch tiers/terms
• "Change cash to $150K" — adjust any field
• "Switch to interest only" — toggle IO mode
• "Show me tier 3" — highlight a tier's rates
• "More cash" / "Lower the rate" — quick adjustments
• **Paste lender portal data** — I'll parse rates and fill all tiers
• **Tell me rates per tier** — e.g., "For 4.99 orig, 30yr is 7.45..."

${hasData && ctx.helocAmount > 0 ? 'Your form has data — try **"Structure Deal"** or **"Build Quote"** for a full analysis.' : 'Enter borrower details in the quote form, then ask me to structure the deal.'}`;

        // Simulate brief delay for UX
        await new Promise(resolve => setTimeout(resolve, 500));

        const responseContent = responses[intent] || responses.simple_chat;
        const autoFillData = extractAutoFillFields(responseContent);
        return { content: responseContent, autoFillFields: autoFillData };
    }

    // Parse AUTO_FILL_FIELDS JSON from AI response
    function extractAutoFillFields(response) {
        const match = response.match(/AUTO_FILL_FIELDS\s*\n?\s*(\{[\s\S]*?\})/);
        if (!match) return null;
        try {
            const parsed = JSON.parse(match[1]);
            // App-side math validation — recalculate CLTV and payment
            if (parsed.property_value && parsed.first_mortgage_balance && parsed.heloc_amount) {
                parsed.combined_ltv = calcCLTV(parsed.first_mortgage_balance, parsed.heloc_amount, parsed.property_value);
            }
            if (parsed.heloc_amount && parsed.interest_rate) {
                if (parsed.payment_type === 'interest_only') {
                    parsed.monthly_payment_estimate = calcInterestOnlyPayment(parsed.heloc_amount, parsed.interest_rate);
                } else if (parsed.loan_term) {
                    const years = parseInt(parsed.loan_term);
                    if (years) parsed.monthly_payment_estimate = calcAmortizedPayment(parsed.heloc_amount, parsed.interest_rate, years);
                }
            }
            return parsed;
        } catch (e) {
            console.warn('Ezra: Could not parse AUTO_FILL_FIELDS', e);
            return null;
        }
    }

    // ============================================
    // AUTO-FILL FUNCTIONALITY (Task 4)
    // ============================================
    function showAutoFillBlock(fields) {
        const messagesContainer = document.getElementById('ezra-messages');

        const autoFillDiv = document.createElement('div');
        autoFillDiv.className = 'ezra-message assistant';

        const fieldRows = Object.entries(fields).map(([key, value]) => `
            <div class="ezra-autofill-field">
                <span class="ezra-autofill-label">${formatFieldLabel(key)}</span>
                <span class="ezra-autofill-value">${formatFieldValue(key, value)}</span>
            </div>
        `).join('');

        autoFillDiv.innerHTML = `
            <div class="ezra-message-avatar">\u2726</div>
            <div style="flex: 1;">
                <div class="ezra-autofill-block">
                    <div class="ezra-autofill-header">
                        <span>⚡</span>
                        <span>Ready to Auto-Fill Quote Fields</span>
                    </div>
                    <div class="ezra-autofill-fields">
                        ${fieldRows}
                    </div>
                    <div class="ezra-autofill-actions">
                        <button class="ezra-autofill-btn primary" onclick="Ezra.applyAutoFill(${JSON.stringify(fields).replace(/"/g, '&quot;')})">
                            Apply to Quote Tool
                        </button>
                        <button class="ezra-autofill-btn secondary" onclick="this.closest('.ezra-message').remove()">
                            Dismiss
                        </button>
                    </div>
                </div>
            </div>
        `;

        messagesContainer.appendChild(autoFillDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function formatFieldLabel(key) {
        return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    function formatFieldValue(key, value) {
        if (typeof value === 'string' && isNaN(value)) return value;
        if (key === 'payment_type') return String(value).replace(/_/g, ' ');
        if (key.includes('payment_estimate') || key.includes('payment')) {
            return '$' + Number(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + '/mo';
        }
        if (key.includes('amount') || key.includes('value') || key.includes('balance') || key.includes('fee')) {
            return '$' + Number(value).toLocaleString();
        }
        if (key.includes('rate') || key.includes('ltv')) {
            return value + '%';
        }
        if (key.includes('period') || key.includes('term')) {
            return value;
        }
        return value;
    }

    function applyAutoFill(fields) {
        // Use EzraReal for comprehensive field mapping if available
        if (window.EzraReal && EzraState.lastQuote) {
            const applied = window.EzraReal.applyToForm(EzraState.lastQuote);
            if (typeof showToast === 'function') {
                showToast(`Ezra applied ${applied.length} fields — quote updated`, 'success');
            }
            return;
        }

        // Fallback to basic mapping
        const fieldMap = {
            borrower_name: 'in-client-name',
            property_value: 'in-home-value',
            existing_mortgage_balance: 'in-mortgage-balance',
            first_mortgage_balance: 'in-mortgage-balance',
            heloc_amount: 'in-net-cash',
            credit_score: 'in-client-credit'
        };

        let appliedCount = 0;

        function setField(id, value) {
            const field = document.getElementById(id);
            if (!field) return false;
            field.value = value;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            appliedCount++;
            field.style.transition = 'background 0.3s';
            field.style.background = '#dcfce7';
            setTimeout(() => field.style.background = '', 1500);
            return true;
        }

        Object.entries(fields).forEach(([ezraKey, value]) => {
            const formFieldId = fieldMap[ezraKey];
            if (formFieldId) setField(formFieldId, value);
        });

        if (fields.origination_fee !== undefined) {
            const loanAmt = fields.heloc_amount || 0;
            if (loanAmt > 0) {
                const origPct = ((fields.origination_fee / loanAmt) * 100).toFixed(2);
                setField('t2-orig', origPct);
            }
        }

        // Handle multi-tier rate data if present (from AI or parser)
        if (fields.tiers && Array.isArray(fields.tiers)) {
            applyMultiTierData(fields);
        }

        // Handle single-rate data: populate recommended tier rate manually
        if (fields.interest_rate && !fields.tiers) {
            const term = parseInt(fields.loan_term) || 30;
            const rateFieldId = 't2-' + term + '-rate-manual';
            const manualEl = document.getElementById(rateFieldId);
            const selectEl = document.getElementById('t2-' + term + '-rate');
            if (manualEl) {
                // Enable manual rates mode if not already
                const toggle = document.getElementById('toggle-manual-rates');
                if (toggle && !toggle.classList.contains('active')) toggle.click();
                manualEl.value = parseFloat(fields.interest_rate).toFixed(2);
                manualEl.style.display = 'block';
                manualEl.dispatchEvent(new Event('input', { bubbles: true }));
                if (selectEl) selectEl.style.display = 'none';
                appliedCount++;
            }
        }

        if (typeof updateQuote === 'function') {
            setTimeout(() => {
                updateQuote();
                if (typeof showToast === 'function') {
                    showToast(`Ezra applied ${appliedCount} fields — quote updated`, 'success');
                }
            }, 100);
        } else if (typeof showToast === 'function') {
            showToast(`Applied ${appliedCount} fields to quote tool`, 'success');
        }

        if (typeof autoSave === 'function') {
            setTimeout(autoSave, 300);
        }
    }

    // ============================================
    // SUPABASE INTEGRATION
    // ============================================
    const EZRA_TABLES_DEPLOYED = true;

    async function loadOrCreateConversation() {
        if (!EZRA_TABLES_DEPLOYED || !EzraState.user) return;
        try {
            const { data } = await EzraState.supabase
                .from('ezra_conversations')
                .select('*')
                .eq('loan_officer_id', EzraState.user.id)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (data) {
                EzraState.conversationId = data.id;
                loadConversationHistory(data.id);
            } else {
                createNewConversation();
            }
        } catch (e) { }
    }

    async function createNewConversation() {
        if (!EZRA_TABLES_DEPLOYED) return;
        try {
            const conversationId = 'ezra_' + Date.now();
            const { data } = await EzraState.supabase
                .from('ezra_conversations')
                .insert({
                    conversation_id: conversationId,
                    loan_officer_id: EzraState.user.id,
                    tier_access: EzraState.userTier,
                    status: 'active'
                })
                .select()
                .single();

            if (data) EzraState.conversationId = data.id;
        } catch (e) { }
    }

    async function loadConversationHistory(conversationId) {
        if (!EZRA_TABLES_DEPLOYED) return;
        try {
            const { data } = await EzraState.supabase
                .from('ezra_messages')
                .select('*')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: true })
                .limit(50);

            if (data) {
                data.forEach(msg => {
                    addMessage(msg.role, msg.content, { model: msg.model_used });
                });
            }
        } catch (e) { }
    }

    async function saveMessageToSupabase(role, content, metadata = {}) {
        if (!EZRA_TABLES_DEPLOYED || !EzraState.conversationId) return;
        try {
            await EzraState.supabase
                .from('ezra_messages')
                .insert({
                    conversation_id: EzraState.conversationId,
                    role,
                    content,
                    model_used: metadata.model,
                    metadata
                });
        } catch (e) { }
    }

    async function loadUserPreferences() {
        if (!EZRA_TABLES_DEPLOYED || !EzraState.user) return;
    }

    // ============================================
    // VECTOR SEARCH (Task 5)
    // ============================================
    async function searchKnowledgeBase(query, category = null) {
        // This would call an Edge Function that:
        // 1. Generates embedding for the query
        // 2. Calls search_ezra_knowledge() in Supabase
        // 3. Returns relevant context

        const { data, error } = await EzraState.supabase
            .rpc('search_ezra_knowledge', {
                query_embedding: query, // Would be actual embedding vector
                match_threshold: 0.7,
                match_count: 5,
                filter_category: category
            });

        return data || [];
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }

    // ============================================
    // PUBLIC API
    // ============================================
    window.Ezra = {
        init: initEzra,
        toggle: toggleWidget,
        open: () => { if (!EzraState.isOpen) toggleWidget(); },
        close: closeWidget,
        sendMessage: (msg) => {
            document.getElementById('ezra-input').value = msg;
            sendMessage();
        },
        applyAutoFill: applyAutoFill,
        undoLastImport: restoreForm,
        setModel: selectModel,
        getState: () => ({ ...EzraState }),
        searchKnowledge: searchKnowledgeBase,
        // Deal Radar API
        showDealRadar: showDealRadar,
        scanDealRadar: scanDealRadar,
        showDealDashboard: showDealDashboard,
        createQuoteFromDeal: createQuoteFromDeal,
        viewDealDetails: viewDealDetails
    };

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEzra);
    } else {
        initEzra();
    }

    // Also listen for auth-ready event as a fallback trigger
    document.addEventListener('auth-ready', () => {
        if (!EzraState.supabase && window._supabase) {
            initEzra();
        }
    });

})();
