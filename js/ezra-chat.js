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
    let _accumulatedPortalData = null; // Accumulates tier data across multiple Figure pastes
    let _pendingPortalRates = null; // Rates waiting for tier assignment

    // Assign pending rates to a specific origination fee tier (called by quick-select buttons)
    function assignRatesToTier(origPct) {
        if (!_pendingPortalRates || !_accumulatedPortalData) return;

        const tier = _accumulatedPortalData.tiers.find(t => t.origPct === origPct);
        if (!tier) return;

        // Assign the pending rates to this tier
        Object.assign(tier.fixed, _pendingPortalRates.fixed);
        Object.assign(tier.variable, _pendingPortalRates.variable);
        _pendingPortalRates = null;

        // Apply to form
        applyAccumulatedToForm();

        // Remove the tier selection buttons from chat
        const btnContainer = document.getElementById('ezra-tier-select-btns');
        if (btnContainer) btnContainer.remove();

        // Build status message
        const tiersWithRates = _accumulatedPortalData.tiers.filter(t => Object.keys(t.fixed).length > 0);
        const tiersWithoutRates = _accumulatedPortalData.tiers.filter(t => Object.keys(t.fixed).length === 0);
        const total = _accumulatedPortalData.tiers.length;

        const tierLines = _accumulatedPortalData.tiers.map(t => {
            const fixedStr = Object.entries(t.fixed).map(([term, rate]) => `${term}yr @ ${rate}%`).join(', ');
            const varStr = Object.entries(t.variable || {}).map(([term, rate]) => `${term}yr var @ ${rate}%`).join(', ');
            const hasRates = Object.keys(t.fixed).length > 0;
            const feeStr = t.origAmount ? `, $${t.origAmount.toLocaleString()} fee` : '';
            if (hasRates) {
                return `**Tier ${t.tierNum}** (${t.origPct}% orig${feeStr}): ${fixedStr}${varStr ? ' | Var: ' + varStr : ''}`;
            }
            return `**Tier ${t.tierNum}** (${t.origPct}% orig${feeStr}): waiting for rates`;
        }).join('\n');

        let statusMsg;
        if (tiersWithoutRates.length === 0) {
            statusMsg = `**All ${total} tiers complete!**\n\n${tierLines}\n\nAll rates populated. Say **"undo"** to revert.`;
            _accumulatedPortalData = null; // Done
        } else {
            const missing = tiersWithoutRates.map(t => `${t.origPct}%`).join(' and ');
            statusMsg = `**Rates applied to ${origPct}% tier.**\n\n${tierLines}\n\n${tiersWithRates.length}/${total} tiers done. Click the ${missing} origination fee in Figure and paste again.`;
        }
        addMessage('assistant', statusMsg, { model: 'local' });
    }

    // Apply accumulated portal data to form fields
    function applyAccumulatedToForm() {
        if (!_accumulatedPortalData) return 0;
        const merged = _accumulatedPortalData;
        let appliedCount = 0;

        function setField(id, value) {
            const field = document.getElementById(id);
            if (!field) return;
            field.value = value;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            appliedCount++;
            field.style.transition = 'background 0.3s';
            field.style.background = '#dcfce7';
            setTimeout(() => field.style.background = '', 1500);
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
        if (toggle && !toggle.classList.contains('active')) toggle.click();

        // Set borrower summary fields
        if (merged.cashAmount) setField('in-net-cash', merged.cashAmount);

        // Apply ALL accumulated tiers
        for (const tier of merged.tiers) {
            const prefix = 't' + tier.tierNum;
            if (tier.origPct) setField(prefix + '-orig', tier.origPct);
            Object.entries(tier.fixed || {}).forEach(([term, rate]) => {
                setManualRate(prefix + '-' + term + '-rate', rate);
            });
            Object.entries(tier.variable || {}).forEach(([term, rate]) => {
                setManualRate(prefix + '-' + term + '-var', rate);
            });
        }

        if (typeof updateQuote === 'function') setTimeout(updateQuote, 100);
        if (typeof autoSave === 'function') setTimeout(autoSave, 300);
        return appliedCount;
    }

    // Expose assignRatesToTier globally so onclick buttons can call it
    window._ezraAssignRatesToTier = assignRatesToTier;

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
        _accumulatedPortalData = null; // Clear accumulated portal data on undo
        _pendingPortalRates = null;
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
        // The paste always lists ALL origination fees, but we can't detect which one is selected.
        // Strategy: store the raw rates separately and let routeToAI handle tier assignment
        // (via quick-select buttons or auto-assign if only one tier is empty).
        const sortedOrigs = [...origFees].sort((a, b) => b - a); // highest first = tier 1

        // Store the parsed rates as "unassigned" — routeToAI will assign them to a tier
        result.unassignedFixed = {};
        result.unassignedVariable = {};
        fixedEntries.forEach(e => { result.unassignedFixed[e.term] = e.rate; });
        variableEntries.forEach(e => { result.unassignedVariable[e.term] = e.rate; });

        // Build tier skeletons with origination fees (no rates yet — rates assigned by routeToAI)
        if (sortedOrigs.length > 0) {
            for (let i = 0; i < sortedOrigs.length; i++) {
                result.tiers.push({
                    origPct: sortedOrigs[i],
                    tierNum: i + 1,
                    fixed: {},
                    variable: {},
                    origAmount: origAmounts[origFees.indexOf(sortedOrigs[i])] || 0
                });
            }
        } else {
            // No origination fees found — create single tier with rates directly
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
            const isInvestment = (ctx.occupancy || '').toLowerCase().includes('investment');
            const maxCltvPct = isInvestment ? 70 : 85;
            const maxEquityAtCap = Math.floor(ctx.homeValue * maxCltvPct / 100 - ctx.mortgageBalance);
            summary += `CLTV: ${ctx.cltv}%`;
            if (ctx.cltv > maxCltvPct) summary += ` ⚠️ EXCEEDS ${maxCltvPct}% MAX`;
            summary += `\n`;
            summary += `Max HELOC at ${maxCltvPct}% CLTV: $${Math.max(0, maxEquityAtCap).toLocaleString()}\n`;
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
        // Comprehensive local knowledge base — sales playbooks, product info, closing scripts
        // This is the PRIMARY intelligence source. AI proxy is secondary.
        localDocuments: [
            // ═══ PRODUCT STRUCTURES ═══
            { category: 'product_structures', title: 'Fixed HELOC Programs Overview', content: 'Fixed HELOC programs are fully amortizing loans. Monthly payments include principal and interest from day one. Borrowers typically draw the full approved amount upfront (minus fees) at closing. Additional draws may be available as principal is repaid. Unlike traditional HELOCs, these products do NOT have long interest-only draw periods.' },
            { category: 'product_structures', title: 'Fixed HELOC Draw Windows', content: '5 Year Fixed HELOC: Draw period 2 years, Loan term 5 years. 10 Year Fixed HELOC: Draw period 3 years, Loan term 10 years. 15 Year Fixed HELOC: Draw period 4 years, Loan term 15 years. 30 Year Fixed HELOC: Draw period 5 years, Loan term 30 years. All fixed programs use fully amortized principal and interest payments.' },
            { category: 'product_structures', title: 'Variable HELOC Programs', content: 'Variable HELOC products include interest-only draw periods. Two structures: 1) 10 Year Variable HELOC — Draw 10 years (interest-only payments), Repayment 20 years amortization after draw. 2) 5 Year Draw HELOC — Draw 5 years (interest-only), Repayment begins after draw period ends.' },
            { category: 'product_structures', title: 'Origination Fee Tiers Explained', content: 'Three pricing tiers trade origination fee vs rate. Tier 1 (highest origination ~4.99%) = lowest rates. Tier 2 (mid ~2.99%) = balanced. Tier 3 (lowest origination ~1.50%) = highest rates. Higher upfront cost means lower ongoing rate. Break-even typically 18-36 months. For clients staying long-term, Tier 1 saves the most. For short-term needs, Tier 3 minimizes upfront cost.' },

            // ═══ PAYMENT RULES ═══
            { category: 'payment_rules', title: 'Fixed HELOC Payment Calculation', content: 'For fixed HELOC programs: Monthly payment = fully amortized principal and interest. Formula: P&I = Loan × [r(1+r)^n] / [(1+r)^n - 1] where r = monthly rate, n = total payments.' },
            { category: 'payment_rules', title: 'Variable HELOC Payment Calculation', content: 'For variable HELOC during draw period: Monthly payment = loan amount × interest rate ÷ 12. This is interest-only. After draw period: Remaining balance amortizes over the repayment term using standard P&I formula.' },

            // ═══ APPROVAL PROCESS ═══
            { category: 'approval_process', title: 'AI Underwriting Process', content: 'Process: 1) Borrower submits application. 2) Soft credit check — NO impact to score. 3) AI underwriting evaluates profile. 4) Income verified with bank-grade tech. 5) Borrower chooses from multiple offers. 6) Final approval and closing. No hard pull to view initial offers.' },
            { category: 'approval_process', title: 'Approval Speed & Timeline', content: 'Some loans fund in as little as 5 days. RULE: Present as possibilities, NEVER guarantees. Say "as fast as 5 days" not "guaranteed in 5 days".' },
            { category: 'approval_process', title: 'Income Verification', content: 'Digital verification through secure portal. Reduces paperwork and speeds up process. All data protected with bank-level encryption, never sold.' },

            // ═══ DATA PRIVACY ═══
            { category: 'data_privacy', title: 'Data Privacy & Security', content: 'Bank-grade security. NEVER sold to third parties. Borrowers control their info and choices. All options shown transparently.' },

            // ═══ DEAL ARCHITECT ═══
            { category: 'deal_architect', title: 'Deal Architect Mode', content: 'Step 1 — Identify goal. Step 2 — Calculate CLTV. Step 3 — Evaluate eligibility. Step 4 — Recommend program. Step 5 — Calculate payment. Step 6 — Return AUTO_FILL_FIELDS JSON. Step 7 — Generate client explanation.' },
            { category: 'deal_architect', title: 'Structuring Intelligence', content: 'By goal: Debt consolidation → 15yr/30yr fixed. Short-term liquidity → 5yr/10yr fixed. Payment flexibility → variable. Rapid payoff → shorter term. Home improvement → 10yr fixed. Max cash flow → 30yr fixed.' },

            // ═══ FIRST CONTACT SALES PLAYBOOK ═══
            { category: 'first_contact', title: 'Cold Lead First Contact Script', content: 'Opening: "Hi [Name], this is [LO Name]. I specialize in helping homeowners like you access their home equity — and based on what I can see, you may be sitting on a significant amount. I\'d love to run a quick comparison for you. It takes about 2 minutes, and there\'s absolutely no obligation. Would you be open to seeing what\'s available to you?" Key: Lead with curiosity, not a pitch. Make them wonder how much equity they have. Always offer the soft check as the low-commitment next step.' },
            { category: 'first_contact', title: 'Warm Lead First Contact Script', content: 'Opening: "Hi [Name]! I saw you were interested in exploring your home equity options — great timing. I put together a personalized comparison based on your property, and honestly, the numbers look really good. Can I walk you through it real quick? It\'ll only take a couple minutes." Key: Assume interest. Compliment their timing. Create excitement about the numbers. The quote is already built — you\'re just presenting it.' },
            { category: 'first_contact', title: 'Inbound Lead Speed-to-Contact', content: 'RULE: Contact inbound leads within 5 minutes. After 30 minutes, conversion drops 80%. Script: "Hi [Name], I just got your information and wanted to reach out right away. Looks like you\'re interested in accessing some of your home equity — I can have a personalized quote ready for you in just a couple minutes. What\'s the best way to send it over?" Priority: Text first, then call. If no answer, leave voicemail + send quote link via SMS.' },
            { category: 'first_contact', title: 'Referral Lead Script', content: '"Hi [Name], [Referrer] mentioned you might be interested in exploring your home equity. They thought I could help — and I\'d love to. I can run a quick comparison right now with zero obligation. Would you be open to seeing what your equity looks like?" Key: Leverage the referrer\'s name. Referral leads close at 3-5x the rate of cold leads.' },
            { category: 'first_contact', title: 'Quote Link Send Script', content: 'After building the quote, send via SMS: "Hey [Name]! Here\'s your personalized HELOC comparison: [LINK]. Take a look when you get a chance — I think you\'ll like what you see. No obligation, just wanted you to have the info. Let me know if you have any questions!" Follow-up 24hrs later if no click: "Hey [Name], just checking in — did you get a chance to look at your HELOC comparison? Happy to walk you through it if you\'d like."' },

            // ═══ USE-CASE SELLING ═══
            { category: 'use_case_selling', title: 'Debt Consolidation Pitch', content: 'Script: "[Name], let me show you something. Right now you might be paying 22-29% on credit cards, maybe 12-15% on a personal loan. With a HELOC at [RATE]%, you could roll all of that into one lower payment and actually pay it off on a schedule. On $[AMOUNT], you\'d save roughly $[SAVINGS]/month compared to minimum payments on cards. And the best part — you\'re using equity you already own." Tip: Always calculate the actual savings. Show the credit card rate vs HELOC rate side-by-side. Make it feel like found money.' },
            { category: 'use_case_selling', title: 'Home Improvement Pitch', content: 'Script: "[Name], a HELOC is the smartest way to fund home improvements because you\'re borrowing against equity you already have — at a fraction of what a contractor financing plan or personal loan would cost. Plus, improvements can increase your home\'s value, which means your equity grows even more. It\'s like using your home to invest in your home." Tip: Frame it as an investment, not debt. Mention the ROI — kitchen remodels return 60-80% of cost in home value.' },
            { category: 'use_case_selling', title: 'Emergency Fund / Safety Net Pitch', content: 'Script: "A lot of my clients set up a HELOC just to have it available — like a financial safety net. You don\'t pay anything until you actually draw on it, and when you do, the rate is way lower than credit cards or personal loans. It\'s one of the smartest financial moves a homeowner can make." Note: For variable HELOCs with IO draw, emphasize you only pay interest on what you use.' },
            { category: 'use_case_selling', title: 'Investment Opportunity Pitch', content: '"Some of my most successful clients use their HELOC to fund investments — whether it\'s a down payment on a rental property, a business opportunity, or even a strategic stock purchase. At [RATE]%, if your return exceeds that, you\'re making money with money you already had sitting in your walls." Caution: Never give specific investment advice. Frame as what clients have done, not what they should do.' },
            { category: 'use_case_selling', title: 'College Tuition / Major Expense Pitch', content: '"[Name], parent PLUS loans are at 9%+ right now. A HELOC at [RATE]% could save you thousands over the course of your child\'s education — and you get a structured payoff instead of decades of student loan payments. It\'s equity you\'ve already built; why not put it to work for your family?" Frame: Compare to the alternative. Student loans, personal loans, and credit cards are all more expensive.' },

            // ═══ CLOSING TECHNIQUES ═══
            { category: 'closing', title: 'Assumptive Close', content: 'Use "when" not "if". Examples: "When you\'re ready to move forward, it\'s a quick process." "Once we get your application in, you could be funded in as little as 5 days." "When would you like me to send over the quote?" Never ask "Would you like to apply?" Instead: "Let\'s get you started — I just need a couple quick details."' },
            { category: 'closing', title: 'Soft Check Close', content: 'The most powerful close in HELOC sales. Script: "Here\'s what I\'d suggest — let\'s run a soft credit check so you can see your actual offers. It takes 60 seconds, there\'s zero impact to your score, and zero obligation. If you don\'t like what you see, you walk away with nothing lost. But at least you\'ll know exactly what\'s available to you." Why it works: Zero risk to the borrower. Curiosity drives action. Once they see real numbers, conversion rate jumps significantly.' },
            { category: 'closing', title: 'Urgency Close (Ethical)', content: 'Use real urgency, never fake it. Examples: "Rates have been moving — what I quoted you today may look different next week." "Your home value supports this HELOC now — if the market shifts, the numbers could change." "I\'ve got a few slots open this week to walk you through it — want me to pencil you in?" Never: "This offer expires tonight" or "Only 3 spots left" — these are pressure tactics that violate trust.' },
            { category: 'closing', title: 'Comparison Close', content: '"Let me put this in perspective. If you put $50K on credit cards at 24%, your minimum payment would be around $1,000/month and it would take 30+ years to pay off. With a HELOC at [RATE]%, your payment is $[PMT]/month and it\'s fully paid off in [TERM] years. Same money, completely different outcome." Always compare HELOC to the realistic alternative the client would otherwise use.' },
            { category: 'closing', title: 'Follow-Up Persistence Framework', content: 'Day 1: Send quote link via SMS. Day 2: "Did you get a chance to look?" text. Day 4: Call + voicemail if no answer. Day 7: Re-send quote with "updated numbers" framing. Day 14: "Just checking in — your equity position is still strong" text. Day 30: "Market update" touchpoint. Key: 80% of deals close between the 5th and 12th contact. Most LOs give up after 2. Persistence wins.' },

            // ═══ OBJECTION HANDLING (EXPANDED) ═══
            { category: 'objections', title: 'Rate Concern Response', content: '"I understand rate is important. Compare a HELOC at 8-9% to credit cards at 22%+. You save thousands while getting a structured payoff. And with a soft credit check, you can see your actual offers with zero impact to your score. Let me show you what the monthly payment actually looks like — I think you\'ll be pleasantly surprised."' },
            { category: 'objections', title: 'Speed Concern Response', content: '"Our platform uses AI-assisted underwriting and digital verification. Some approvals fund in as little as 5 days. It\'s significantly faster than a traditional HELOC or refinance."' },
            { category: 'objections', title: 'Trust & Privacy Response', content: '"Bank-grade security — same level as major financial institutions. We never sell your data. You see all options transparently and choose what works best. No obligation."' },
            { category: 'objections', title: 'Refinance vs HELOC Response', content: '"A refinance replaces your first mortgage — you\'d give up your current rate. A HELOC accesses equity WITHOUT touching your first mortgage. If your current rate is below market, a HELOC preserves that advantage. It\'s the best of both worlds."' },
            { category: 'objections', title: 'General Hesitation Response', content: '"Totally fine. A soft credit check has zero impact and zero commitment. Think of it as understanding what\'s available. Many clients are glad they looked — even if they don\'t move forward right away."' },
            { category: 'objections', title: 'I Need to Talk to My Spouse', content: '"Absolutely — this is a decision you should make together. Would it be helpful if I sent over a summary you can both review? That way when you sit down, you\'ll have all the numbers in front of you. I can also jump on a quick call with both of you if that\'s easier." Key: Don\'t fight this objection. Enable it. Send the quote link so both spouses can review. Offer a couples call.' },
            { category: 'objections', title: 'I Already Have a HELOC', content: '"That\'s actually a great position to be in — you already understand the product. The question is: are you getting the best rate and terms? Rates and programs change, and many of my clients are surprised when they see how much better their new options are. Want me to run a quick comparison against what you have now?" Key: Frame as an upgrade opportunity, not a replacement.' },
            { category: 'objections', title: 'I Want to Shop Around', content: '"I\'d encourage that — you should absolutely compare. One thing I can tell you is that our platform shows you multiple structures and tiers side-by-side, so you\'re already comparison shopping in one place. And since it\'s a soft check, there\'s no downside to seeing what we offer. Most clients find everything they need right here." Key: Don\'t resist the shopping impulse. Channel it toward your multi-tier comparison.' },
            { category: 'objections', title: 'My Bank Offered Better', content: '"That\'s great that your bank is competitive. I\'d love to compare total cost though — rate is only part of the picture. What origination fees, closing costs, and draw terms did they offer? A lot of times the headline rate doesn\'t tell the whole story. Let me put them side by side for you." Key: Never attack the competitor. Just ask for specifics and let the comparison do the work.' },
            { category: 'objections', title: 'I Dont Want More Debt', content: '"I totally understand that concern — nobody wants unnecessary debt. But here\'s how I think about it: if you\'re using equity to pay off 24% credit card debt at 8%, you\'re actually reducing your total debt cost. You\'re not adding debt — you\'re restructuring it into something cheaper and with a real payoff date. It\'s a debt reduction strategy, not a debt increase." Key: Reframe debt consolidation as REDUCING debt cost, not adding debt.' },
            { category: 'objections', title: 'What If My Home Value Drops', content: '"Fair question. Your HELOC is approved based on today\'s value, and once approved, the terms are locked. Even if values dip, your rate and access don\'t change. That said, at [CLTV]% CLTV you\'re well within conservative guidelines — there\'s a solid equity cushion. And historically, real estate has been one of the most reliable long-term assets." Key: Reassure with the CLTV buffer. Never minimize the concern — validate and redirect.' },
            { category: 'objections', title: 'I Just Want Information / Not Ready', content: '"Perfect — that\'s exactly what this is for. No application, no commitment. I\'ll send you a personalized comparison with all the numbers. Take your time, review it, and if you have questions later, I\'m here. Sound good?" Key: The quote link IS your follow-up tool. Get it in their hands. Ezra on the client page does the selling for you 24/7.' },

            // ═══ COMPETITIVE POSITIONING ═══
            { category: 'competitive', title: 'HELOC vs Cash-Out Refinance', content: 'HELOC wins when: Client has a good first mortgage rate they want to keep. Cash-out refis average ~6.5-7% nationally and replace your entire first mortgage. Faster process (5 days vs 30-45 days for refi). Lower closing costs (refi = 2-5% of loan). No appraisal in most cases (AVM instead). Access funds as needed vs lump sum. Keep existing mortgage intact. Frame: "Why would you give up your 3.5% first mortgage just to access equity? A HELOC lets you keep that rate AND access your cash."' },
            { category: 'competitive', title: 'HELOC vs Personal Loan', content: 'HELOC wins: Much lower rate (HELOC 6-9% vs personal loans 12-18%). Higher limits ($50K-$500K+ vs $15-50K). Interest may be tax-deductible (consult tax advisor). Longer terms available. No prepayment penalty. Frame: "A personal loan is unsecured, so you pay a premium for that. Your home equity is collateral — that\'s why the rate is so much lower."' },
            { category: 'competitive', title: 'HELOC vs Credit Cards', content: 'HELOC wins: Fraction of the rate (HELOC 6-9% vs credit cards 22-29%). Structured payoff schedule vs revolving minimum payments. $100K at 24% CC = ~$2,000/mo minimum, takes 30+ years. Same $100K HELOC at 7.5% for 15yr = ~$927/mo, paid in 15 years. Total savings: Over $100,000+ in interest. Frame: "You\'re already paying for this equity — why pay 24% when you could pay 7-8%?"' },
            { category: 'competitive', title: 'HELOC vs 401K Loan', content: 'HELOC wins: No tax penalties for withdrawal. Retirement funds keep growing. No repayment requirement if you leave your job. Lower effective cost when factoring lost market returns. Frame: "Borrowing from your 401K means your retirement money stops working for you. Your home equity is separate — use it without touching your future."' },
            { category: 'competitive', title: 'West Capital Lending HELOC Product Knowledge', content: 'Product structure: 10-year draw period (interest-only payments) + 20-year repayment (fully amortizing). Variable rate tied to WSJ Prime Rate + margin. Typical rates 8-11% depending on FICO/CLTV. Loan amounts $25K-$500K. Funding in ~6 calendar days (as little as 1 day for investment properties). Income verified via Plaid bank statement analysis — no tax returns, no paystubs. Pre-qualification is a soft pull (no credit impact, instant). Application takes ~2 minutes online. No prepayment penalty. All 50 states, primary/second home/investment. IMPORTANT: Never say NFTYDoor to clients — always say West Capital Lending HELOC or your HELOC.' },
            { category: 'competitive', title: 'HELOC vs Figure (Online Lender)', content: 'Key differences: Figure requires FULL draw at origination — borrower gets entire amount upfront, not a revolving line. Origination fees 0-4.99%. Advertised rates 6.65-14.60% (as low as — actual rates vary by credit/equity). Limited redraw window (2-5 years depending on term). Our West Capital Lending HELOC advantage: True revolving line — draw only what you need, pay interest only on what you use. 10-year draw period for flexible access. If client only needs $50K now but wants $100K available later, our HELOC provides that flexibility without paying interest on idle funds. Frame: "Figure makes you take everything upfront. With your HELOC, you draw what you need when you need it — and you only pay interest on what you actually use." Never badmouth Figure — acknowledge them as a solid option, then highlight our structural advantages.' },
            { category: 'competitive', title: 'Draw Period Advantage (10-Year)', content: 'The 10-year interest-only draw period is a major advantage. During draw, payments are interest-only on the amount drawn — keeps payments low when flexibility matters most. After 10 years, transitions to 20-year fully amortizing repayment. Compare: Figure has 5-year max draw with full upfront disbursement. Cash-out refi has no draw period at all (lump sum, payments start immediately on full amount). Frame: "Think of the draw period like having a financial safety net for the next decade. The money is there when you need it, but you are not paying for it until you use it."' },
            { category: 'competitive', title: 'Variable Rate Positioning (WSJ Prime)', content: 'Variable rates are tied to the Wall Street Journal Prime Rate (currently ~8.5%), NOT the 10-year Treasury that purchase mortgages use. When Prime drops, your payment drops automatically — no refinancing needed. Historical context: Prime moved from 3.25% (2020) to 8.5% (2024-2025), and is expected to trend down as Fed cuts rates. Frame for clients concerned about variable: "Your rate adjusts with the market. When rates come down — and the market expects them to — your payment drops automatically. You do not have to refinance or do anything. It just adjusts." For clients who want certainty, acknowledge fixed-rate HELOCs exist but position variable as potentially more advantageous in a declining-rate environment.' },

            // ═══ SALES PSYCHOLOGY ═══
            { category: 'sales_psychology', title: 'Pain Point Discovery Questions', content: 'Ask these to uncover motivation: "What would you do with $X in your hands right now?" "How much are you paying in credit card interest every month?" "Have you been putting off any home improvements?" "What\'s your biggest financial stress right now?" "If you could consolidate everything into one lower payment, what would that free up for you?" Key: Let them sell themselves. Once they verbalize the pain, the HELOC becomes the obvious solution.' },
            { category: 'sales_psychology', title: 'Anchoring With Big Numbers', content: 'Always anchor to the larger number first. "You have $180,000 in accessible equity. We\'re looking at using $75,000 of that." Makes the HELOC feel small relative to their total equity. "Credit cards at 24% on $50K costs you $1,000/month in interest alone. Your HELOC payment is $478." The savings feel massive when anchored against the pain.' },
            { category: 'sales_psychology', title: 'Social Proof Statements', content: 'Use naturally: "Most of my clients in your situation go with the 15-year — it hits the sweet spot between payment and payoff." "The most common use I see is debt consolidation — clients are shocked at how much they save." "Homeowners with your equity position are in a really strong spot right now." Never fabricate specifics. Use general patterns.' },
            { category: 'sales_psychology', title: 'The Curiosity Gap', content: 'Create curiosity that can only be resolved by taking the next step. "Based on your property, I think you\'re going to be really happy with the numbers. Let me run them for you." "I\'ve seen homes in your area qualify for some really competitive rates lately." "There\'s something about your equity position that most homeowners don\'t realize — let me show you." Key: Don\'t give away the answer. Make them want to see the quote.' },

            // ═══ FIRST-TIME CALLER FRAMEWORK ═══
            { category: 'first_contact', title: 'Phone Call Framework (HEAR)', content: 'H — Hook: Open with a benefit. "I see you have some really strong equity in your home." E — Engage: Ask about their situation. "What made you start looking into this?" A — Assess: Qualify quickly. "Do you know roughly what your home is worth? And your mortgage balance?" R — Recommend: Prescribe the next step. "Based on what you\'re telling me, I think I can put together something really competitive. Let me build you a comparison — takes 2 minutes." This framework works for both cold outreach and inbound leads.' },
            { category: 'first_contact', title: 'Text-First Contact Strategy', content: 'Modern borrowers prefer text over calls. Strategy: 1) Initial text with quote link. 2) Follow up with "Did you see the numbers?" text 24hrs later. 3) Call attempt on day 3 if no engagement. 4) Re-text with fresh angle on day 7. Text templates are generated by Ezra Draft Message feature. Key insight: 98% text open rate vs 20% email. Clients who open the quote link are 4x more likely to apply.' },

            // ═══ SALES SCRIPTS (EXPANDED) ═══
            { category: 'sales_scripts', title: 'HELOC Client Introduction', content: 'Opening: "This program gives you access to your home equity with complete transparency. You can view your potential offers with just a soft credit check — no impact to your credit score. Our technology evaluates your eligibility quickly, verifies income securely, and presents you with multiple options. You pick the offer that works best for you. Some approvals can fund in as little as 5 days."' },
            { category: 'sales_scripts', title: 'Fixed HELOC Explanation Script', content: '"This program works more like a traditional loan. Instead of interest-only payments, the balance starts paying down right away with principal and interest. That helps build equity faster and keeps the loan on a predictable schedule."' },
            { category: 'sales_scripts', title: 'Variable HELOC Explanation Script', content: '"This option gives you maximum flexibility. During the draw period, you only pay interest on what you\'ve used — so if you draw $50K of a $100K line, you only pay interest on the $50K. The starting rate is typically lower than fixed, and you can pay down or pay off anytime with zero penalty."' },
            { category: 'sales_scripts', title: 'Presenting the Quote Link', content: '"I just sent you a link to your personalized HELOC comparison. When you open it, you\'ll see all your numbers laid out — your equity position, available options across different rate tiers, and the monthly payments for each. There\'s also an AI advisor named Ezra who can answer any questions right there on the page. Take a look and let me know what you think!"' },
            { category: 'sales_scripts', title: 'The Money-in-Your-Walls Script', content: '"Here\'s how I explain it to my clients: you\'ve been making mortgage payments for years, and that\'s built up equity — real money sitting in your walls. A HELOC lets you access that money at a fraction of what a credit card or personal loan would cost. You\'re not creating new debt — you\'re unlocking value you\'ve already earned."' },
            { category: 'sales_scripts', title: 'Sales Coach Three-Section Format', content: 'When presenting a loan, provide: 1) Loan Structure — program, term, draw window, payment type. 2) Strategy Explanation — why this fits the borrower. 3) Suggested Script — word-for-word client explanation.' },

            // ═══ VALUE PROPOSITION ═══
            { category: 'value_proposition', title: 'Core Value Proposition', content: 'Key advantages: Multiple structures. Soft credit check (no hard pull). AI-assisted underwriting. Bank-grade verification. Borrower chooses. Potential funding as fast as 5 days. Fixed rate options. No prepayment penalty. Keep existing first mortgage rate.' },
            { category: 'value_proposition', title: 'Why Now Value Story', content: 'Home values have appreciated significantly. Many homeowners are sitting on more equity than they realize. Rates, while higher than 2021, are still far below credit card and personal loan rates. A HELOC at 8% vs credit cards at 24% is a no-brainer for debt consolidation. "Your equity is a financial tool — the question isn\'t whether to use it, it\'s when and how."' },

            // ═══ GUIDELINES ═══
            { category: 'heloc_guidelines', title: 'CLTV Calculation', content: 'CLTV = (First Mortgage + HELOC) / Property Value. Most programs up to 85% CLTV for primary residences.' },
            { category: 'heloc_guidelines', title: 'Credit Score Minimum', content: 'Minimum credit score for HELOC qualification is 640. Most programs accept 640+. Higher scores (700+) typically get better rates. The pre-qualification on the client page checks for 640+ as the minimum threshold.' },
            { category: 'heloc_guidelines', title: 'DTI Requirements', content: 'Maximum DTI (Debt-to-Income) ratio accepted is 50%. DTI = Total Monthly Debt Payments / Gross Monthly Income. Under 36% is excellent, 36-43% is good, 43-50% is acceptable. Above 50% typically does not qualify.' },
            { category: 'heloc_guidelines', title: 'Required Documents', content: 'Only two documents needed: 1) Valid driver\'s license (current, unexpired). 2) Trust documents IF the property is held in a trust — need trust certificate and whether it is revocable or irrevocable. Income is verified digitally via Plaid — no bank statements, pay stubs, or tax returns needed.' },
            { category: 'heloc_guidelines', title: 'Trust Property Guidelines', content: 'If a property is vested in a trust, borrower must provide trust certificate and specify whether it is a revocable trust or irrevocable trust. Revocable trusts are more straightforward. Irrevocable trusts may require additional review. Always ask the client if their property is in a trust.' },
            { category: 'heloc_guidelines', title: 'Knowledge Authority Order', content: 'Priority: 1) Internal KB. 2) Product rules. 3) LO inputs. 4) General mortgage knowledge. Internal overrides external. Never invent programs.' },

            // ═══ INCOME & EMPLOYMENT ═══
            { category: 'income_employment', title: 'Income Verification — Digital Process', content: 'Income is verified digitally through Plaid — the same bank-grade system used by Venmo, Cash App, and major financial institutions. No pay stubs, no tax returns, no W-2s needed. The system connects securely to the borrower\'s bank and verifies income automatically. This dramatically speeds up the process compared to traditional document-based verification. Borrowers simply log in to their bank through a secure portal — takes about 60 seconds.' },
            { category: 'income_employment', title: 'Self-Employed Borrower Income', content: 'Self-employed borrowers can qualify for a HELOC. Income verification through Plaid works for self-employed individuals as well — the system analyzes bank deposit patterns. For borderline cases, lenders may request 1-2 years of tax returns or profit & loss statements. Self-employed borrowers should ensure consistent bank deposits for the strongest profile. Business owners with irregular income may benefit from using a 12-month or 24-month average. Tip for LOs: Ask "How does your income hit your bank account?" to set expectations.' },
            { category: 'income_employment', title: 'Employment Gaps & Job Changes', content: 'Recent job changes do not automatically disqualify a borrower. AI underwriting evaluates the overall income picture, not just tenure. Key factors: current employment status (actively employed), consistent income deposits, and debt-to-income ratio. A borrower who changed jobs 2 months ago but has a higher salary is often stronger than one in the same job for 10 years. Gaps longer than 6 months may require explanation. Retirement income, Social Security, pensions, and disability income all count.' },
            { category: 'income_employment', title: 'Acceptable Income Sources', content: 'All of these count as qualifying income: W-2 salary, self-employment/1099, Social Security benefits, pension/retirement distributions, disability income, rental income (with documentation), alimony/child support (if it continues for 3+ years), VA benefits, trust income, and investment dividends. Multiple income sources can be combined. Tip: Ask borrowers about ALL income — many forget to mention Social Security or rental income.' },

            // ═══ PROPERTY & APPRAISAL ═══
            { category: 'property_appraisal', title: 'AVM vs Traditional Appraisal', content: 'AVM (Automated Valuation Model) is used in most cases — no in-person appraisal needed. AVM pulls comparable sales, tax records, and market data to estimate property value automatically. Takes seconds vs weeks for a traditional appraisal. Traditional appraisal may be required when: AVM confidence is low, property is unique/rural, recent major renovations not reflected in records, or value is contested. If a traditional appraisal IS required, the lender will notify the borrower and schedule it. Cost is typically $400-600 for a full appraisal. Most urban and suburban properties qualify for AVM-only.' },
            { category: 'property_appraisal', title: 'Property Types That Qualify', content: 'Eligible property types: Single-family homes (primary residence), condos (with HOA approval in some cases), townhomes, 2-4 unit properties (owner-occupied). Investment properties may qualify with different rates and lower max CLTV (typically 75-80%). Second homes/vacation homes: eligible with slightly different terms. Manufactured homes: may qualify if on permanent foundation with real property classification. Co-ops, houseboats, and raw land typically do NOT qualify. Always confirm property type upfront.' },
            { category: 'property_appraisal', title: 'HOA and Condo Considerations', content: 'Condos and townhomes in HOA communities generally qualify for HELOCs. Key considerations: Some HOAs have restrictions on second liens — check CC&Rs if the borrower mentions an HOA. Condo project approval may be needed for larger complexes. HOA dues are included in DTI calculation as a monthly obligation. Litigation involving the HOA can delay or prevent approval. Tip: Ask "Is your property in an HOA?" early in the conversation to avoid surprises later.' },

            // ═══ CREDIT & QUALIFICATION ═══
            { category: 'credit_qualification', title: 'Credit Score Tiers & Rate Impact', content: 'Minimum score: 640. Credit score ranges and their impact: 640-679 = qualifies but higher rates, 680-719 = good rates, 720-759 = very competitive rates, 760+ = best available rates. Credit score is one factor among many — CLTV, DTI, and income stability also matter. A borrower with a 660 score but 50% CLTV and low DTI may get better terms than a 740 score with 85% CLTV. Tip: If a client\'s score is borderline (630-650), suggest they check for errors on their report — 1 in 5 reports contain mistakes.' },
            { category: 'credit_qualification', title: 'Hard Pull vs Soft Pull Explained', content: 'Soft pull (soft inquiry): Used for pre-qualification. NO impact on credit score. Borrower sees their options risk-free. This is what happens when they click "Move Forward" initially. Hard pull (hard inquiry): Only happens when borrower formally applies and accepts an offer. Stays on credit report for 2 years but only affects score for about 12 months. Impact is typically 5-10 points and recovers within a few months. Multiple hard pulls for the same loan type within 14-45 days count as ONE inquiry (rate shopping protection). Key messaging: "The soft check is like window shopping — you see everything with zero risk."' },
            { category: 'credit_qualification', title: 'Bankruptcy & Foreclosure Seasoning', content: 'Borrowers with past credit events CAN qualify after seasoning periods: Chapter 7 Bankruptcy: typically 4 years from discharge date. Chapter 13 Bankruptcy: typically 2 years from discharge or 4 years from dismissal. Foreclosure: typically 4-7 years from completion date. Short Sale: typically 2-4 years from sale date. Deed in Lieu: typically 2-4 years. Key: These are guidelines — each lender has specific overlays. The AI underwriting evaluates the complete picture including re-established credit. Tip for LOs: Don\'t dismiss these leads — they often have rebuilt credit and strong equity positions.' },
            { category: 'credit_qualification', title: 'DTI Calculation Deep Dive', content: 'DTI = Total Monthly Debt Payments / Gross Monthly Income. What counts as debt: mortgage payment (PITI), HELOC payment (proposed), car payments, student loans, credit card minimum payments, personal loans, child support/alimony payments, HOA dues. What does NOT count: utilities, insurance (unless in PITI), food, phone, subscriptions, 401K loans (some lenders). Example: $8,000/mo gross income, $2,400 in monthly debt payments (including proposed HELOC) = 30% DTI. Under 36% = excellent. 36-43% = good. 43-50% = acceptable. Over 50% = typically does not qualify. Tip: If DTI is tight, show the client shorter terms with higher payments vs longer terms with lower payments.' },

            // ═══ RATE & PRICING ═══
            { category: 'rate_pricing', title: 'Rate Lock & Float Explained', content: 'Once a borrower accepts an offer and locks their rate, that rate is guaranteed for the lock period (typically 30-60 days). If rates go up during processing, the borrower keeps their locked rate. If rates go down, some programs offer a one-time float-down option. Rate lock happens AFTER the borrower accepts a specific offer — not at pre-qualification. Tip: Use rate movement as ethical urgency: "Rates have been moving — locking now protects you if they go up before closing." Never guarantee rates will go up or down.' },
            { category: 'rate_pricing', title: 'Origination Fee Break-Even Analysis', content: 'The break-even point is when lower monthly payments from a higher origination tier offset the upfront cost. Formula: Break-even months = (Higher origination cost - Lower origination cost) / (Higher monthly payment - Lower monthly payment). Example: Tier 1 (4.99% origination) saves $85/mo vs Tier 3 (1.50% origination) on a $100K HELOC. Extra upfront cost: ~$3,490. Break-even: $3,490 / $85 = 41 months (3.4 years). Rule of thumb: Staying 3+ years → Tier 1 saves the most. Under 2 years → Tier 3 minimizes cost. 2-3 years → Tier 2 is the sweet spot. Always present break-even analysis to help clients choose.' },
            { category: 'rate_pricing', title: 'Variable vs Fixed Rate Strategy', content: 'When to recommend fixed: Client wants payment predictability, plans to hold 5+ years, using for debt consolidation (structured payoff), concerned about rising rates. When to recommend variable: Client wants maximum flexibility, plans to pay off quickly (under 3 years), wants lowest initial payment, using as emergency fund/safety net (only pay interest on what you use). Hybrid strategy: Some clients use variable HELOC as a line of credit for ongoing needs + fixed HELOC for a known large expense. Key: Most clients want predictability — default to fixed unless they specifically need flexibility.' },

            // ═══ CLOSING & FUNDING ═══
            { category: 'closing_funding', title: 'Closing Process & What to Expect', content: 'After approval, the closing process is simple: 1) Borrower receives closing disclosure (3 days before closing). 2) Reviews terms, rate, fees. 3) Signs documents (e-sign available in many cases, or mobile notary). 4) 3-day right of rescission period begins (federal law for primary residence HELOCs). 5) After rescission period, funds are disbursed. Total from approval to cash in hand: typically 5-10 business days. The 3-day rescission period is required by law and cannot be waived for primary residence HELOCs. Funds arrive via wire transfer or check to borrower\'s account.' },
            { category: 'closing_funding', title: 'Right of Rescission Explained', content: 'Federal law (TILA) gives borrowers 3 business days after signing to cancel a HELOC on their primary residence with no penalty. This is a consumer protection — borrowers should know about it. The 3 days are BUSINESS days (excludes Sundays and federal holidays). Saturdays count. Example: Sign on Monday → rescission expires Thursday at midnight. If the borrower does nothing, the loan proceeds automatically after the 3 days. This does NOT apply to purchase money loans or investment properties. Tip: Mention this as a trust-builder: "You even get 3 days after signing to change your mind — zero risk."' },
            { category: 'closing_funding', title: 'Subordination Agreements', content: 'A subordination agreement maintains the priority of liens on the property. Relevant when: Borrower is refinancing their first mortgage and has an existing HELOC — the HELOC lender may need to agree to stay in second position. This can add 2-4 weeks to a refinance timeline. If a borrower has an existing HELOC and wants a new one, the old HELOC typically needs to be paid off at closing. Second lien position is standard for HELOCs — this is expected and normal. Tip: If a client mentions they\'re also refinancing their first mortgage, ask about timing to avoid subordination delays.' },

            // ═══ TAX & LEGAL ═══
            { category: 'tax_legal', title: 'HELOC Interest Tax Deductibility', content: 'HELOC interest MAY be tax-deductible IF the funds are used for home improvements (buying, building, or substantially improving the home that secures the loan). Under the Tax Cuts and Jobs Act (2017): Interest on up to $750K of total mortgage debt (first mortgage + HELOC combined) is deductible IF used for home improvements. Interest is NOT deductible if funds are used for debt consolidation, car purchases, vacations, etc. CRITICAL: Always say "consult your tax advisor" — NEVER give specific tax advice. Frame: "Many clients use HELOC funds for home improvements, which may offer tax advantages — your tax professional can confirm the details for your situation."' },
            { category: 'tax_legal', title: 'TILA & RESPA Compliance Reminders', content: 'TILA (Truth in Lending Act) requirements: All rate quotes must include APR, finance charges must be disclosed, right of rescission must be provided. RESPA (Real Estate Settlement Procedures Act): Closing costs must be itemized, no kickbacks or referral fees allowed, good faith estimate required. As a loan officer, NEVER: guarantee approval, promise specific rates before qualification, pressure with fake urgency ("only 3 spots left"), claim no fees exist, or give tax/legal/investment advice. Always: disclose that rates are subject to qualification, present options transparently, and recommend professional advisors for tax/legal questions.' },
            { category: 'tax_legal', title: 'Community Property & Joint Applications', content: 'In community property states (AZ, CA, ID, LA, NV, NM, TX, WA, WI), both spouses may need to sign HELOC documents even if only one is on the mortgage. Non-borrowing spouse may need to sign the deed of trust (security instrument) to acknowledge the lien. This does NOT mean the non-borrowing spouse is liable for the debt — only that they acknowledge the home is being used as collateral. Joint applications: Both borrowers\' income and debts are considered. The LOWER of the two credit scores typically determines the rate. Tip: If one spouse has a much lower score, explore single-borrower application using only the stronger profile.' },

            // ═══ SPECIAL SITUATIONS ═══
            { category: 'special_situations', title: 'Investment Property HELOCs', content: 'HELOCs on investment/rental properties ARE available but with different terms: Max CLTV typically 75-80% (vs 85% for primary residence). Rates are typically 0.5-1.5% higher than primary residence rates. Rental income can be used to qualify (usually 75% of gross rent to account for vacancies). Must still meet DTI requirements with rental income factored in. Great for: Accessing equity to fund down payment on next investment property, renovating rental to increase rent, consolidating investment property debt. Frame: "Your rental property has equity working for you — let\'s put it to use."' },
            { category: 'special_situations', title: 'High-Value / Jumbo Properties', content: 'Properties valued over $1M may have different guidelines: Some programs cap at $500K HELOC amount regardless of equity. Higher-value properties may require traditional appraisal instead of AVM. Rates may be slightly different for jumbo amounts. CLTV limits may be more conservative (75-80%). Good news: High-value properties typically have excellent equity positions. The borrower profile on jumbo deals tends to be strong (high income, good credit). Tip: For properties over $1.5M, always confirm specific program limits before quoting.' },
            { category: 'special_situations', title: 'Recently Purchased Homes', content: 'Borrowers who recently purchased their home CAN qualify for a HELOC, but there may be seasoning requirements: Some programs require 3-6 months of ownership before a HELOC can be taken. The purchase price (not current estimated value) may be used for CLTV calculation within the first 12 months. After 12 months, current market value is typically used. If the borrower put 20%+ down, they likely have enough equity for a HELOC after seasoning. Tip: Ask "When did you purchase your home?" early to set timeline expectations.' },
            { category: 'special_situations', title: 'Divorce & Title Changes', content: 'Divorce situations and HELOCs: If one spouse is awarded the home in divorce, they can use a HELOC to buy out the other spouse\'s equity share. The divorce decree or separation agreement may need to be provided. Both names may need to be on the current title/deed for signing. A quit claim deed transferring the departing spouse\'s interest is often part of the process. HELOC can also be used to pay off joint debts as part of divorce settlement. Tip: Be sensitive to the situation — frame it as "getting a fresh financial start."' },
            { category: 'special_situations', title: 'Estate & Inherited Properties', content: 'Inherited properties can qualify for HELOCs once the title is properly transferred. Requirements: Probate must be complete or trust distribution must be documented. New owner must be on title. Property taxes and insurance must be current. If multiple heirs inherit, all title holders may need to sign. Great use case: Accessing equity in an inherited home to fund renovations before selling, or to consolidate the estate\'s debts. Tip: Recommend the borrower consult with an estate attorney to ensure clean title transfer before applying.' },

            // ═══ COMPETITIVE POSITIONING (EXPANDED) ═══
            { category: 'competitive', title: 'HELOC vs Home Equity Loan (HELoan)', content: 'Key difference: A HELOC is a revolving line of credit (like a credit card secured by your home). A HELoan is a lump-sum loan with fixed payments. HELOC advantages: Draw funds as needed during draw period, only pay interest on what you use, re-borrow as you pay down, more flexible. HELoan advantages: Fixed payment from day one, single lump sum. When HELOC wins: Ongoing needs (home improvement over time), emergency fund, flexible access. When HELoan might win: Single large expense with no need for re-borrowing. Frame: "A HELOC gives you the flexibility of a credit line with the security of your home equity — you control when and how much you use."' },
            { category: 'competitive', title: 'Online HELOC vs Bank HELOC', content: 'Online/fintech HELOC providers (like our platform) vs traditional banks: Speed: Online 5-10 days vs Bank 30-60 days. Process: Digital verification vs stacks of paperwork. Appraisal: AVM (instant) vs in-person ($400-600, weeks). Experience: Apply from your couch vs branch visits. Rates: Often comparable or better (lower overhead). Support: Dedicated LO vs branch turnover. Banks may offer relationship discounts for existing customers with large deposits. Our advantage: Speed, convenience, transparency (see all options at once), dedicated loan officer support, AI-assisted underwriting. Frame: "You get the technology of a fintech with the personal touch of a dedicated loan officer."' },
            { category: 'competitive', title: 'HELOC vs 0% APR Credit Card Balance Transfer', content: '0% APR balance transfer cards seem attractive but: Promotional period only lasts 12-21 months, then jumps to 22-29%. Balance transfer fee: 3-5% upfront. Credit limit often much lower than HELOC. Missed payment can cancel the 0% rate immediately. Doesn\'t solve the underlying debt — just delays it. HELOC advantage: True structured payoff with a real end date, much lower long-term rate, higher available funds, no promotional period gimmick. Frame: "A 0% card delays the problem for 12 months. A HELOC solves it permanently with a structured payoff at a fraction of the long-term cost."' },
            { category: 'competitive', title: 'HELOC vs DSCR Loan for Investors', content: 'For real estate investors: DSCR (Debt Service Coverage Ratio) loans are popular for investment properties but have higher rates (typically 7-10%+), require 20-25% down, and have extensive documentation. A HELOC on your PRIMARY residence can fund the down payment for an investment property at a lower rate. Strategy: Use HELOC equity to fund the down payment, then conventional or DSCR for the investment property mortgage. This is called "equity stacking" and many sophisticated investors use it. Caution: Never recommend specific investment strategies — present what clients have done, not what they should do.' },

            // ═══ FOLLOW-UP & NURTURE ═══
            { category: 'followup_nurture', title: 'Lead Temperature Classification', content: 'Hot lead (contact within 1 hour): Opened quote link multiple times, clicked on rate tiers, spent 5+ minutes on page, asked Ezra questions, clicked Move Forward. Warm lead (contact within 24 hours): Opened quote link once, brief page visit, no interaction with Ezra. Cold lead (nurture sequence): Received link but didn\'t open, opened but bounced quickly, no engagement signals. Stale lead (re-engagement campaign): No activity in 7+ days after initial contact. Dead lead (archive): Explicitly declined, DNC request, invalid contact info. Action priority: Hot → call immediately. Warm → text + follow-up call. Cold → automated drip. Stale → "market update" re-engagement. Dead → respect their decision.' },
            { category: 'followup_nurture', title: 'Re-Engagement Scripts for Stale Leads', content: 'After 7+ days of silence: "Hey [Name], just wanted to let you know your equity position is still looking strong. Rates have moved a bit since we last talked — want me to refresh your numbers?" After 14+ days: "Hi [Name], I was reviewing my client pipeline and noticed we never got to finish your HELOC comparison. No pressure at all — but if anything has changed or you have questions, I\'m here." After 30+ days: "Hey [Name], quick market update — [relevant rate/market info]. Your home equity is still a powerful financial tool. Let me know if you\'d ever like to revisit your options." Key: Each touchpoint offers NEW value (updated numbers, market info) rather than just "checking in."' },
            { category: 'followup_nurture', title: 'Voicemail Scripts That Get Callbacks', content: 'Voicemail script (under 30 seconds): "Hi [Name], this is [LO Name]. I put together a personalized HELOC comparison for you and honestly, the numbers look really good. I\'ll text you the link so you can take a look when it\'s convenient. If you have any questions, you can call or text me back at this number. Talk soon!" Key principles: Keep under 30 seconds. Lead with a benefit. Always follow up voicemail with a text. Don\'t ask them to call back — offer the text/link as the easy next step. Be enthusiastic but not pushy. Never leave more than one voicemail per week.' },
            { category: 'followup_nurture', title: 'Email Subject Lines That Get Opens', content: 'High-performing subject lines for HELOC follow-ups: "Your equity position — quick update" (curiosity), "[Name], your personalized HELOC comparison is ready" (personalization), "How [Amount] in equity could work for you" (specific number), "Quick question about your home equity" (engagement), "I found something interesting about your property" (curiosity gap). Avoid: "HELOC offer inside" (spam trigger), "ACT NOW" (pressure), "You\'re approved!" (misleading). Best times to send: Tuesday-Thursday, 9-11am local time. Always include the quote link in the email body.' },

            // ═══ ADVANCED SALES TECHNIQUES ═══
            { category: 'advanced_sales', title: 'The Two-Option Close', content: 'Instead of asking "Do you want to move forward?" (yes/no), present two options: "Based on your situation, I think either the 15-year at [rate]% or the 10-year at [rate]% makes the most sense. Which one sounds better to you?" This reframes the decision from "yes or no" to "which one" — psychologically, the borrower is already choosing between options rather than deciding whether to proceed at all. Works especially well after presenting the quote comparison. Pair with: "Most of my clients in your equity range go with the 15-year — it hits the sweet spot."' },
            { category: 'advanced_sales', title: 'Handling "Let Me Think About It"', content: 'When a client says "let me think about it," this usually means they have an unspoken concern. Script: "Absolutely — this is an important decision and you should take your time. Just so I can be most helpful, is there anything specific you\'re weighing? Sometimes I can address concerns right now and save you the back-and-forth." If they share a concern: address it directly. If they truly need time: "Perfect. I\'ll send your comparison over so you have everything in one place. Is it okay if I follow up [tomorrow/next week]?" Key: Get permission for the follow-up. Set a specific time. Never pressure.' },
            { category: 'advanced_sales', title: 'Building Referral Relationships', content: 'After closing a HELOC, referral ask script: "I\'m really glad we could help you access your equity. A quick question — do you know any other homeowners who might be sitting on equity they don\'t realize they have? I\'d love to help them the same way I helped you." Why it works: You\'re not asking for a "referral" — you\'re asking if they KNOW someone. It\'s less transactional. Best timing: After funding when the client is happiest. Referral leads close at 3-5x the rate of cold leads. Tip: Send a thank-you text after the referral conversation regardless of whether they provide one.' },
            { category: 'advanced_sales', title: 'Price Anchoring for Debt Consolidation', content: 'When discussing debt consolidation, always calculate and present the TOTAL cost of the alternative first: "Right now, $75,000 in credit card debt at 24% costs you approximately $1,500/month in interest ALONE — and with minimum payments, that debt would take 30+ years to pay off and cost over $180,000 in total interest. Your HELOC at [rate]% costs [payment]/month total — principal AND interest — and you\'re completely debt-free in [term] years. Total interest: approximately $[amount]. That\'s a savings of over $[difference]." The large anchor number makes the HELOC look incredibly cheap by comparison.' },

            // ═══ PRODUCT EDGE CASES ═══
            { category: 'product_edge_cases', title: 'CLTV Close to 85% — What to Tell Clients', content: 'When CLTV is 80-85%, the borrower qualifies but is at the upper limit. Key messaging: "Your combined loan-to-value is [X]%, which is within our guidelines. You have a healthy equity cushion." If CLTV is over 85%: "Based on current property values, you\'re just above our 85% CLTV limit. A few options: 1) Request a lower HELOC amount that brings CLTV under 85%. 2) Wait for property values to appreciate. 3) Pay down your first mortgage to create more equity." Tip: Always present solutions, not just problems. Calculate exactly how much less they\'d need to borrow to qualify.' },
            { category: 'product_edge_cases', title: 'Interest-Only vs Fully Amortizing Explained Simply', content: 'For clients confused about IO vs P&I: "Think of it like renting vs owning your car payment. Interest-only is like leasing — lower monthly payment, but you\'re not building equity in the loan. Fully amortizing is like buying — higher monthly payment, but every payment reduces what you owe. Interest-only makes sense when you want maximum cash flow flexibility. Fully amortizing makes sense when you want a guaranteed payoff schedule. Most of my clients prefer the fixed, fully amortizing option because they like knowing exactly when they\'ll be done paying."' },
            { category: 'product_edge_cases', title: 'Draw Period Re-Borrowing Rules', content: 'During the draw period, borrowers can access additional funds as they pay down the balance (up to their approved credit limit). Example: $100K HELOC, borrower draws $80K at closing. After 2 years of payments, balance is down to $65K. They can draw up to $35K more (back to the $100K limit). After the draw period ends, no new draws are allowed — the balance enters repayment. Important: The draw period length varies by product (2-10 years depending on fixed vs variable). Some programs allow partial draws at closing with the remainder available during the draw period. Tip: Emphasize this flexibility for clients using HELOC as a safety net.' },

            // ═══ EZRA CLIENT-FACING INTELLIGENCE ═══
            { category: 'client_intelligence', title: 'How Ezra Helps Clients on the Quote Page', content: 'Ezra (client-facing) is an AI advisor embedded in the quote page. Capabilities: Explains the quote in plain language, answers HELOC questions 24/7, provides guided tour of the quote, handles objections with real data, supports English and Spanish, suggests next steps. Ezra does NOT: give financial/tax/legal advice, guarantee approval, pressure the client, or share information with third parties. Every response includes real quote data (rate, payment, equity) and ends with a gentle CTA. Ezra\'s tone is helpful, confident, and educational — never salesy or pushy. The LO gets notified when a client engages with Ezra.' },
            { category: 'client_intelligence', title: 'Quote Link Engagement Scoring', content: 'Client engagement on the quote page generates signals: Page opened = base score. Time on page (5+ min) = high interest. Clicked rate tiers = comparing options. Opened Ezra chat = has questions. Asked Ezra questions = actively engaged. Clicked Move Forward = ready to apply. Multiple visits = strong interest. Mobile device = convenience-driven (text-preferred). These signals feed into the lead engagement score visible to the LO. Hot leads (score 10+) should be contacted immediately. The LO dashboard shows real-time click notifications. Tip: Tell clients "I\'ll be able to see when you\'ve had a chance to review your quote, so I\'ll follow up at the right time."' },

            // ═══ VARIABLE RATE MECHANICS ═══
            { category: 'rate_pricing', title: 'ARM/Variable Rate Adjustment Details', content: 'Variable HELOC rates are tied to an index (typically Prime Rate or SOFR) plus a margin set by the lender. Example: Prime (currently ~8.5%) + margin (0.5%) = 9.0% variable rate. Adjustment caps protect borrowers: Annual cap limits how much the rate can increase per year (typically 1-2%). Lifetime cap limits the maximum rate over the loan life (often 18%). Floor rate is the minimum the rate can drop to (usually the initial rate or margin). Adjustments typically happen monthly or quarterly. Key messaging: "Variable rates give you a lower starting point with the flexibility to benefit when rates drop — and caps protect you from big surprises."' },

            // ═══ DRAW RULES & BALLOON CLARIFICATION ═══
            { category: 'product_edge_cases', title: 'Minimum & Maximum Draw Rules', content: 'Minimum initial draw: Many programs require a minimum first draw of $15,000-$25,000 at closing. This ensures the HELOC is actively used. Maximum draw: Equal to approved credit limit, minus any fees financed. Partial draws: During the draw period, borrowers can take additional draws in increments (some programs have a $500-$1,000 minimum per subsequent draw). Re-draw: As principal is paid down, that amount becomes available again (revolving line). After draw period ends: No new draws allowed — remaining balance amortizes over repayment period. Tip: "Think of it like a credit card with a much lower rate — you can use what you need, pay it down, and use it again."' },
            { category: 'product_edge_cases', title: 'Balloon Payment Clarification', content: 'Important: Our fixed HELOC programs are FULLY AMORTIZING — there are NO balloon payments. Every monthly payment includes principal and interest, and the loan is fully paid off by the end of the term. Variable HELOCs have an interest-only draw period followed by a fully amortizing repayment period — still no balloon. Some competitors offer balloon HELOCs (entire balance due at end of draw period) — ours do NOT work this way. This is a key differentiator. Script: "Unlike some programs where the whole balance comes due at once, your payments are structured to pay it off completely over the term. No surprises."' },

            // ═══ STATE REGULATIONS & LIEN POSITION ═══
            { category: 'heloc_guidelines', title: 'State-Specific HELOC Regulations', content: 'Important state-specific rules: TEXAS: Article XVI Section 50(a)(6) of the Texas Constitution has unique HELOC rules — max 80% CLTV (not 85%), 12-day cooling off period, no fees above 3% of loan amount. CALIFORNIA: Non-disturbance provisions and community property rules apply. COMMUNITY PROPERTY STATES (AZ, CA, ID, LA, NV, NM, TX, WA, WI): Non-borrowing spouse typically must sign deed of trust even if not on the loan. NEW YORK: Special mortgage tax applies. FLORIDA: Homestead protections affect HELOC enforcement. Always verify state-specific requirements with the underwriting team before quoting. Tip: Ask "What state is your property in?" early — it affects terms and timeline.' },
            { category: 'heloc_guidelines', title: 'HELOC Lien Position & Priority', content: 'A HELOC sits in SECOND lien position behind the first mortgage. This means: If borrower defaults, the first mortgage lender gets paid first from property sale proceeds. The HELOC lender gets paid from remaining proceeds. This is why HELOC rates are typically higher than first mortgage rates — second position carries more risk for the lender. Subordination: If borrower refinances their first mortgage, the HELOC lender may need to agree to stay in second position (subordination agreement). This can add 2-4 weeks to a refinance timeline. Script: "Your HELOC sits behind your first mortgage — your existing mortgage is completely unaffected. The rate reflects the second position, which is still far below credit cards or personal loans."' },

            // ═══ LOAN AMOUNTS & BANKRUPTCY ═══
            { category: 'credit_qualification', title: 'Minimum & Maximum HELOC Amounts', content: 'Typical ranges: Minimum HELOC amount: $15,000-$25,000 (varies by lender/program). Maximum HELOC amount: Up to $500,000+ for primary residences (some programs cap at $400K). Investment properties: typically lower max ($250K-$350K). The actual maximum depends on: Property value × max CLTV (85% primary, 75-80% investment) minus existing mortgage balance. Example: $500K home × 85% = $425K max combined debt. If mortgage is $300K, max HELOC = $125K. If property value supports a larger HELOC than the program max, the program max applies. Tip: Always calculate the CLTV-based max first, then check against program limits.' },
            { category: 'special_situations', title: 'Bankruptcy & HELOC Treatment', content: 'How HELOCs are treated in bankruptcy: Chapter 7 Bankruptcy: The HELOC debt may be discharged (borrower no longer personally liable), BUT the lien survives — meaning the lender can still foreclose if payments stop. Chapter 13 Bankruptcy: HELOC may be included in the repayment plan. If the home is "underwater" (HELOC balance exceeds home value minus first mortgage), the HELOC may be "stripped" to unsecured status. After bankruptcy: New HELOC is possible after seasoning periods (Ch. 7: 4 years, Ch. 13: 2 years from discharge). Tip: Don\'t dismiss leads who mention past bankruptcy — many have rebuilt credit and strong equity positions. Ask when the discharge occurred.' },
            { category: 'special_situations', title: 'HELOC Assumability', content: 'HELOCs are generally NOT assumable — a new property buyer cannot take over the seller\'s existing HELOC. The HELOC must be paid off at or before the property sale closing. This is standard across virtually all HELOC programs. Why: The HELOC was underwritten based on the original borrower\'s credit, income, and risk profile. A new buyer would need their own qualification. What to tell sellers: "Your HELOC will be paid off from the sale proceeds at closing — it\'s automatic and handled by the title company." What to tell buyers: "If you want to access equity in your new home, we can set up a HELOC after your purchase closes and any seasoning period passes."' },

            // ═══ RATE LOCK & COMMUNITY PROPERTY ═══
            { category: 'closing_funding', title: 'Rate Lock Timing Details', content: 'Rate lock timing: Pre-qualification: NO rate lock — rates shown are estimates based on current market. Offer acceptance: Rate LOCKS when borrower formally accepts a specific offer. Lock period: Typically 30-60 days from acceptance. During processing: Locked rate is guaranteed even if market rates rise. If closing delayed: Rate may need to be re-locked (could be higher or lower depending on market). Float-down option: Some programs offer a one-time float-down if rates drop significantly during processing. Script: "Once you accept your offer, your rate is locked — if rates go up while we process your loan, you keep YOUR lower rate. That\'s the benefit of locking early." Ethical urgency: "Rates have been moving lately — locking now protects you from any increases during processing."' },
            { category: 'tax_legal', title: 'Spousal Rights & Community Property Details', content: 'In community property states (AZ, CA, ID, LA, NV, NM, TX, WA, WI), special rules apply: Non-borrowing spouse must typically sign the deed of trust (security instrument) — this acknowledges the lien on community property. The non-borrowing spouse is NOT personally liable for the debt — they\'re just acknowledging the lien. Joint applications: Both borrowers\' income and debts are considered for DTI. The LOWER of the two credit scores typically determines the rate tier. Strategy: If one spouse has a much lower credit score, consider a single-borrower application using only the stronger profile (if that borrower\'s income alone qualifies). Common-law states: Non-borrowing spouse generally does NOT need to sign. Tip: Always ask about marital status and property state to set expectations early.' },

            // ═══ DEFAULT, CONTRACTOR FINANCING, REFERRALS ═══
            { category: 'approval_process', title: 'Default Consequences & Foreclosure Risk', content: 'If a borrower defaults on a HELOC: Step 1: Missed payments trigger late fees and credit reporting (30/60/90 day marks). Step 2: Lender reaches out to discuss options — loan modification, forbearance, repayment plan. Step 3: After extended non-payment (typically 90-120 days), lender may initiate foreclosure proceedings. Step 4: HELOC is in second lien position, so first mortgage gets priority in any property sale. Key point: Foreclosure is a LAST RESORT — lenders prefer working with borrowers to find solutions. HELOC borrowers who communicate with their lender early have many options. Script for concerned borrowers: "Default is extremely rare, and lenders have multiple programs to help if you ever hit a rough patch. The key is communication — reach out early and there are always options."' },
            { category: 'competitive', title: 'HELOC vs Contractor Financing', content: 'Many contractors offer "0% financing for 12-18 months" — but there\'s a catch: After the promotional period, rates jump to 18-26% (deferred interest may apply retroactively). Often limited to that specific contractor (can\'t shop around). Contractor financing typically has lower limits ($10K-$50K). Dealer markup is often built into the project cost. HELOC advantages: Rate stays consistent (no promotional gimmick). Use ANY contractor you want. Much higher limits available ($50K-$500K+). Interest may be tax-deductible if used for home improvements. You control the timeline and spending. Script: "Contractor financing looks great on the surface, but once that 0% period ends, you\'re looking at credit card-level rates. With a HELOC at [RATE]%, you get predictable payments from day one and much more flexibility."' },
            { category: 'followup_nurture', title: 'Referral Program Scripts', content: 'Best time to ask for referrals: Right after funding (client is happiest). 30-day post-close check-in. 90-day relationship touchpoint. Annual "equity check-up" call. Script (post-close): "I\'m really glad we could help you access your equity. Quick question — do you know any other homeowners who might be sitting on equity they don\'t realize they have? I\'d love to help them the same way I helped you." Script (check-in): "Hey [Name], how\'s everything going with your HELOC? Any friends or family who\'ve mentioned wanting to do home improvements or consolidate debt? I\'d be happy to run numbers for them." Key stats: Referral leads close at 3-5x the rate of cold leads. Always send a thank-you regardless of whether the referral converts.' },
            { category: 'advanced_sales', title: 'Handling Multiple Decision Makers', content: 'When both spouses/partners need to agree: Step 1: Acknowledge it. "Absolutely — this is a decision you should make together." Step 2: Equip them. Send the quote link so BOTH can review independently. "I\'ll send you a link you can both look at whenever it\'s convenient." Step 3: Offer a couples call. "Would it be helpful if we did a quick 10-minute call with both of you? I can walk through the numbers together." Step 4: Follow up with BOTH. "Hey [Name], did you and [Spouse] get a chance to look at the numbers?" Never: Pressure one party to convince the other. Make the non-present spouse feel excluded. Rush the decision. Frame: "This is a smart financial move that works best when you\'re both on the same page."' },
            { category: 'client_intelligence', title: 'Common Client Misconceptions', content: 'Top 5 misconceptions that kill HELOC deals — and how to address them: 1) "A HELOC means I could lose my home" → Truth: A HELOC is secured by your property, but default protections exist. Lenders work with borrowers through modifications and forbearance. Foreclosure is an absolute last resort. 2) "Checking my rate will hurt my credit" → Truth: The initial check is a soft pull with ZERO impact on your score. A hard pull only happens if you formally apply. 3) "I need perfect credit to qualify" → Truth: Minimum score is 640. Many borrowers with 640-680 scores get approved with competitive rates. 4) "The process takes months" → Truth: AI underwriting and digital verification mean some loans fund in as fast as 5 days. 5) "There are hidden fees I won\'t see until closing" → Truth: The origination fee is disclosed upfront and built into the loan. No surprises. Full transparency is our standard.' }
        ],

        searchLocalKB(query) {
            if (!query) return '';
            const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
            if (terms.length === 0) return '';

            // Synonym expansion — improves recall for common HELOC terms
            const synonymMap = {
                'heloc': ['heloc', 'equity', 'home equity'],
                'rate': ['rate', 'interest', 'apr'],
                'payment': ['payment', 'monthly', 'cost'],
                'apply': ['apply', 'application', 'start', 'begin'],
                'refi': ['refi', 'refinance', 'cashout'],
                'credit': ['credit', 'fico', 'score'],
                'fast': ['fast', 'quick', 'speed', 'days'],
                'safe': ['safe', 'secure', 'trust', 'legit'],
                'debt': ['debt', 'consolidate', 'payoff'],
                'improve': ['improve', 'renovation', 'remodel', 'upgrade', 'repair'],
                'document': ['document', 'paperwork', 'submit'],
                'close': ['close', 'closing', 'fund', 'funding'],
                'prepay': ['prepay', 'early', 'payoff', 'penalty'],
                'variable': ['variable', 'adjustable', 'arm', 'floating'],
                'fixed': ['fixed', 'locked', 'stable'],
                'spouse': ['spouse', 'wife', 'husband', 'partner', 'married'],
                'bankrupt': ['bankrupt', 'bankruptcy', 'foreclosure', 'default'],
                'invest': ['invest', 'rental', 'property', 'investment'],
                'tax': ['tax', 'deduct', 'deductible', 'irs', 'write-off'],
                'income': ['income', 'employed', 'employment', 'salary', 'self-employed'],
            };
            // Expand terms with synonyms
            const expandedTerms = new Set(terms);
            terms.forEach(term => {
                for (const [key, synonyms] of Object.entries(synonymMap)) {
                    if (term === key || synonyms.includes(term)) {
                        synonyms.forEach(s => expandedTerms.add(s));
                        break;
                    }
                }
            });
            const searchTerms = Array.from(expandedTerms);

            const matches = this.localDocuments.map(doc => {
                const text = (doc.title + ' ' + doc.content).toLowerCase();
                let score = 0;
                let titleBonus = 0;
                searchTerms.forEach(term => {
                    if (text.includes(term)) score += 1;
                    // Boost score for title matches (more relevant)
                    if (doc.title.toLowerCase().includes(term)) titleBonus += 0.5;
                });
                // Normalize score: ratio of matched terms to total input terms (not expanded), plus title bonus
                const normalizedScore = terms.length > 0 ? ((score + titleBonus) / (terms.length + searchTerms.length) * 2) : 0;
                return { ...doc, score: Math.min(normalizedScore, 1.0) };
            }).filter(d => d.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 3); // top 3 matches

            if (matches.length === 0) return '';

            let context = '';
            matches.forEach(m => {
                context += `(score: ${m.score.toFixed(2)}) [${m.title}]: ${m.content}\n`;
            });

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
    // ============================================
    // AUTOMATED FOLLOW-UP SEQUENCES
    // ============================================
    const FOLLOW_UP_SEQUENCES = {
        new_lead: [
            {
                delay: 0, // Immediate
                channel: 'sms',
                subject: null,
                message: "Hi {{clientName}}! This is {{loName}} from {{company}}. I just prepared your personalized HELOC quote. Check it out here: {{quoteLink}} - Ezra, my AI assistant, can answer any questions 24/7. Talk soon!"
            },
            {
                delay: 24 * 60 * 60 * 1000, // 24 hours
                channel: 'email',
                subject: 'Your HELOC Quote + 3 Ways to Use Your Equity',
                message: "Hi {{clientName}},<br><br>I wanted to follow up on the HELOC quote I prepared for you. Here are 3 popular ways homeowners are using their ${{cashBack}} in available equity:<br><br>1. <strong>Debt Consolidation</strong> - Save ${{monthlySavings}}/month vs credit cards<br>2. <strong>Home Improvements</strong> - 75% average ROI<br>3. <strong>Emergency Fund</strong> - Only pay when you use it<br><br>Questions? Just reply or call me at {{loPhone}}.<br><br>Best,<br>{{loName}}"
            },
            {
                delay: 3 * 24 * 60 * 60 * 1000, // 3 days
                channel: 'sms',
                subject: null,
                message: "{{clientName}}, rates change daily. Your {{rate}}% rate is locked for 45 days. Want to discuss your options? Call/text {{loPhone}} or apply here: {{applyLink}} -{{loName}}"
            },
            {
                delay: 7 * 24 * 60 * 60 * 1000, // 7 days
                channel: 'email',
                subject: 'Last chance: Your HELOC quote expires soon',
                message: "Hi {{clientName}},<br><br>Your HELOC pre-qualification expires in 7 days. Based on your profile, you're approved for up to ${{cashBack}} at {{rate}}%.<br><br><strong>What happens next?</strong><br>1. Apply online (5 minutes)<br>2. Upload documents<br>3. Close in 14-21 days<br><br>Questions? I'm here to help.<br><br>{{loName}}<br>{{loPhone}} | {{loEmail}}"
            }
        ],
        quote_viewed: [
            {
                delay: 2 * 60 * 60 * 1000, // 2 hours after viewing
                channel: 'sms',
                subject: null,
                message: "Hi {{clientName}}! I saw you checked out your HELOC quote. Any questions I can answer? I'm here to help! -{{loName}} {{loPhone}}"
            },
            {
                delay: 24 * 60 * 60 * 1000, // 24 hours
                channel: 'email',
                subject: 'Quick question about your HELOC quote',
                message: "Hi {{clientName}},<br><br>I noticed you viewed your HELOC quote yesterday. I wanted to personally reach out and see if you have any questions.<br><br>Most borrowers ask about:<br>• How the rate compares to their current debt<br>• Tax benefits of HELOC interest<br>• How quickly they can access funds<br><br>I'm here to help! Just reply or call {{loPhone}}.<br><br>Best,<br>{{loName}}"
            }
        ],
        application_started: [
            {
                delay: 0, // Immediate
                channel: 'email',
                subject: 'Your application is in progress!',
                message: "Hi {{clientName}},<br><br>Great news! I've received your HELOC application. Here's what happens next:<br><br><strong>Step 1:</strong> Document review (1-2 business days)<br><strong>Step 2:</strong> Property appraisal ordered<br><strong>Step 3:</strong> Final approval & closing<br><br>Need to upload documents? Use our secure portal: {{portalLink}}<br><br>Questions? Call me anytime at {{loPhone}}.<br><br>{{loName}}"
            },
            {
                delay: 48 * 60 * 60 * 1000, // 48 hours
                channel: 'sms',
                subject: null,
                message: "{{clientName}}, just checking in on your application. Need help with any documents? I'm here to make this easy. Call/text {{loPhone}} -{{loName}}"
            }
        ],
        no_activity: [
            {
                delay: 14 * 24 * 60 * 60 * 1000, // 14 days
                channel: 'email',
                subject: 'Still interested in accessing your home equity?',
                message: "Hi {{clientName}},<br><br>I haven't heard from you in a couple weeks. I know life gets busy!<br><br>If you're still considering a HELOC, I'd love to chat. If the timing isn't right, I completely understand - just reply and let me know.<br><br>Your quote is still valid for 30 more days.<br><br>Best,<br>{{loName}}<br>{{loPhone}}"
            }
        ]
    };

    const EZRA_CONFIG = {
        widgetTitle: 'Ezra — AI Loan Structuring Assistant',
        placeholderText: 'Ask Ezra anything...',
        quickCommands: [
            { label: 'Quick Quote', icon: '🚀', action: 'quick_quote_wizard', prompt: '' },
            { label: 'Build Quote', icon: '💰', action: 'build_quote', prompt: 'Ezra build a quote for this borrower' },
            { label: 'Structure Deal', icon: '🏗️', action: 'structure_deal', prompt: 'Ezra structure this deal' },
            { label: 'Recommend Program', icon: '🎯', action: 'recommend_program', prompt: 'Which HELOC program is best for this borrower?' },
            { label: 'Tier 1', icon: '1️⃣', action: 'tier1', prompt: 'Go with tier 1' },
            { label: 'Tier 2', icon: '2️⃣', action: 'tier2', prompt: 'Go with tier 2' },
            { label: 'Tier 3', icon: '3️⃣', action: 'tier3', prompt: 'Go with tier 3' },
            { label: 'Handle Objection', icon: '🛡️', action: 'handle_objection', prompt: 'How do I handle common HELOC objections?' },
            { label: 'Client Script', icon: '📝', action: 'client_script', prompt: 'How should I explain this HELOC to my client?' },
            { label: 'Narrate Quote', icon: '🗣️', action: 'narrate_quote', prompt: 'Explain this quote in plain English for the client' },
            { label: 'Draft Message', icon: '✉️', action: 'draft_message', prompt: 'Draft a personalized SMS and email for this client' },
            { label: 'Compare Scenarios', icon: '⚖️', action: 'compare_scenarios', prompt: 'Compare the different rate and term scenarios in plain English' },
            { label: 'Lead Briefing', icon: '📋', action: 'lead_briefing', prompt: '' },
            { label: 'Compliance Check', icon: '⚠️', action: 'compliance_check', prompt: '' },
            { label: 'Predict Questions', icon: '❓', action: 'predict_questions', prompt: 'What questions will my client likely ask about this quote?' },
            { label: 'Upload Rate Sheet', icon: '📊', action: 'upload_rate_sheet', prompt: '' }
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
        activeTab: 'chat', // 'chat' | 'deal-radar'
        _upsellMode: false,
        _upsellMsgIndex: 0,
        _tokenBudget: null,
        _pendingComplianceCheck: false,
        pendingAttachment: null, // { file, base64, mimeType, previewUrl }
        rateSheetMatrix: null,   // Parsed rate sheet for auto-pricing
        autoPrePrice: false      // Toggle for auto-fill from rate sheet
    };

    // ============================================
    // INITIALIZATION
    // ============================================
    let _initAttempts = 0;
    let _initDelay = 500;
    function initEzra() {
        // Wait for the app's Supabase client to be available
        if (!window._supabase) {
            _initAttempts++;
            if (_initAttempts <= 10) { // exponential backoff: 500ms → 750 → 1125 → ... capped at 5000ms
                if (_initAttempts === 1) console.debug('Ezra: Waiting for Supabase client...');
                setTimeout(initEzra, _initDelay);
                _initDelay = Math.min(_initDelay * 1.5, 5000);
            } else {
                console.warn('Ezra: Supabase client not found after backoff — widget disabled');
            }
            return;
        }

        // Use the app's existing Supabase client
        EzraState.supabase = window._supabase;

        // Pick up tier from app globals
        if (window.currentUserTier) EzraState.userTier = window.currentUserTier;

        // Tier gate: Carbon users get upsell-only mode, Titanium+ gets full Ezra
        const tier = (EzraState.userTier || 'carbon').toLowerCase();
        const userLevel = TIER_LEVELS[tier] || 0;
        if (userLevel < 1 && window.currentUserRole !== 'super_admin') {
            EzraState._upsellMode = true;
            console.debug('Ezra: Carbon tier — upsell mode active');
        }

        // Create widget DOM first so elements exist
        createWidgetDOM();

        // Setup event listeners
        setupEventListeners();

        // Mark Platinum-only buttons for lower-tier users
        if (userLevel < 2 && window.currentUserRole !== 'super_admin') {
            const pasteBtn = document.getElementById('ezra-paste-rates');
            const voiceBtn = document.getElementById('ezra-voice');
            if (pasteBtn) {
                pasteBtn.title = 'Paste Rates — Platinum feature (click to learn more)';
                pasteBtn.style.position = 'relative';
                const lock = document.createElement('span');
                lock.style.cssText = 'position:absolute;top:-4px;right:-4px;font-size:8px;background:rgba(167,139,250,0.9);color:white;width:14px;height:14px;border-radius:50%;display:flex;align-items:center;justify-content:center;';
                lock.textContent = '\uD83D\uDD12';
                pasteBtn.appendChild(lock);
            }
            if (voiceBtn) {
                voiceBtn.title = 'Voice Input — Platinum feature (click to learn more)';
                voiceBtn.style.position = 'relative';
                voiceBtn.dataset.locked = 'true';
                const lock = document.createElement('span');
                lock.style.cssText = 'position:absolute;top:-4px;right:-4px;font-size:8px;background:rgba(167,139,250,0.9);color:white;width:14px;height:14px;border-radius:50%;display:flex;align-items:center;justify-content:center;';
                lock.textContent = '\uD83D\uDD12';
                voiceBtn.appendChild(lock);
            }
        }

        // Check auth state (async — loads conversation)
        bindVoiceSettingsListener();
        syncEzraVoiceSettings();
        checkAuthState();

        // Load user preferences
        loadUserPreferences();

        // Load saved rate sheet matrix
        loadSavedRateSheet();

        // Auto-price listeners: debounced re-fill when form fields change
        const autoPriceFields = ['in-client-credit', 'in-home-value', 'in-mortgage-balance', 'in-net-cash', 't1-orig', 't2-orig', 't3-orig'];
        let _autoPriceTimer = null;
        autoPriceFields.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => {
                    if (EzraState.autoPrePrice && EzraState.rateSheetMatrix) {
                        clearTimeout(_autoPriceTimer);
                        _autoPriceTimer = setTimeout(() => autoFillRatesFromMatrix(), 500);
                    }
                });
            }
        });

        console.debug('Ezra: Initialized successfully');
        
        // Check for new users and show onboarding
        setTimeout(showOnboardingIfNew, 1000);

        // Fetch token budget for display (non-blocking)
        setTimeout(fetchTokenBudget, 1500);
    }

    async function checkAuthState() {
        const { data: { session } } = await EzraState.supabase.auth.getSession();
        if (session?.user) {
            EzraState.user = session.user;
            loadOrCreateConversation();
        }
    }

    // ============================================
    // UPSELL MODE (Carbon tier)
    // ============================================
    const UPSELL_MESSAGES = [
        "I'm **Ezra**, your AI loan structuring co-pilot. I can build quotes in seconds, handle objections with smart counter-scripts, draft personalized messages, run compliance checks, and much more.\n\n**Upgrade to Titanium** to unlock me and start closing faster.",
        "Here's what I can do for you:\n\n\u2726 **Quick Quote** — Build a full quote in seconds\n\u2726 **Smart Objections** — Counter scripts using real numbers\n\u2726 **Draft Messages** — SMS & email templates with client data\n\u2726 **Compliance Check** — Auto-review for TILA/RESPA\n\u2726 **Compare Scenarios** — Side-by-side 5/10/15/30yr analysis\n\nUpgrade to **Titanium** to unlock all features.",
        "Loan officers using Ezra AI close **40% faster** with instant quote building, smart deal structuring, and automated follow-up coaching.\n\n**Titanium** gives you the full AI toolkit. **Platinum** adds lead briefings and follow-up timing intelligence.\n\nReady to upgrade?",
        "I can predict your client's questions before they ask, narrate quotes in plain English for easy conversations, and generate ready-to-send SMS and email drafts.\n\nAll of this is waiting for you at **Titanium** tier and above.",
    ];

    const UPSELL_QUICK_COMMANDS = [
        { label: 'Quick Quotes', icon: '\uD83D\uDE80', tier: 'Titanium', desc: 'Build quotes instantly with AI' },
        { label: 'Smart Objections', icon: '\uD83D\uDEE1\uFE0F', tier: 'Titanium', desc: 'AI-powered counter scripts' },
        { label: 'Draft Messages', icon: '\u2709\uFE0F', tier: 'Titanium', desc: 'SMS & email with client data' },
        { label: 'Compliance Check', icon: '\u26A0\uFE0F', tier: 'Titanium', desc: 'Auto TILA/RESPA review' },
        { label: 'Lead Briefings', icon: '\uD83D\uDCCB', tier: 'Platinum', desc: 'Daily lead priority digest' },
        { label: 'Follow-Up Coach', icon: '\u23F0', tier: 'Platinum', desc: 'AI timing recommendations' },
    ];

    function getUpsellResponse() {
        const msg = UPSELL_MESSAGES[EzraState._upsellMsgIndex % UPSELL_MESSAGES.length];
        EzraState._upsellMsgIndex++;
        return msg;
    }

    // Tier level mapping — IIFE-scoped so all functions can access it
    const TIER_LEVELS = { carbon: 0, titanium: 1, platinum: 2, obsidian: 3, diamond: 4 };

    // Intent-to-tier mapping for granular feature gating
    const INTENT_TIER_MAP = {
        // Local (zero cost) — Titanium+
        quote_narrator: 1,
        draft_message: 1,
        scenario_comparison: 1,
        question_predictor: 1,
        compliance_check: 1,
        objection_handling: 1,
        // API-calling — Titanium+
        deal_architect: 1,
        quote_creation: 1,
        program_recommendation: 1,
        simple_chat: 1,
        // Async local (DB queries) — Platinum+
        followup_coach: 2,
        lead_briefing: 2,
        // API-calling — Platinum+
        sales_coach: 2,
        complex_strategy: 2,
    };
    const TIER_NAMES = { 0: 'Carbon', 1: 'Titanium', 2: 'Platinum', 3: 'Obsidian', 4: 'Diamond' };

    // Token budget display
    async function fetchTokenBudget() {
        if (EzraState._upsellMode || !EzraState.supabase || !window.currentUserId) return;
        try {
            const { data } = await EzraState.supabase.rpc('get_or_create_token_budget', { p_user_id: window.currentUserId });
            if (data && data.length > 0) {
                const b = data[0];
                EzraState._tokenBudget = { tokens_used: b.budget_tokens_used, tokens_limit: b.budget_tokens_limit, tier: b.budget_tier };
                updateTokenDisplay();
            }
        } catch (e) {
            console.debug('Ezra: token budget fetch skipped', e.message);
        }
    }

    function updateTokenDisplay() {
        const el = document.getElementById('ezra-token-budget');
        const b = EzraState._tokenBudget;
        if (!el || !b) return;
        if (b.tokens_limit === -1) {
            el.textContent = '\u221E Unlimited tokens';
            el.style.color = '#4ade80';
            el.style.display = '';
            return;
        }
        if (b.tokens_limit === 0) { el.style.display = 'none'; return; }
        const pct = b.tokens_used / b.tokens_limit;
        el.textContent = `${b.tokens_used.toLocaleString()}/${b.tokens_limit.toLocaleString()} tokens`;
        el.style.color = pct < 0.5 ? '#4ade80' : pct < 0.8 ? '#facc15' : '#f87171';
        el.style.display = '';
    }

    function getIntentUpgradeMessage(intent) {
        const required = INTENT_TIER_MAP[intent] || 1;
        const tierName = TIER_NAMES[required] || 'Titanium';
        const descriptions = {
            followup_coach: 'Follow-Up Coach analyzes your leads and suggests the best time and channel to reach out.',
            lead_briefing: 'Lead Briefing gives you a daily digest of new, hot, and stale leads with action plans.',
            sales_coach: 'Sales Coach provides advanced AI-driven deal strategy and coaching.',
            complex_strategy: 'Complex Strategy handles multi-scenario deal structuring with deep analysis.',
        };
        const desc = descriptions[intent] || `This feature requires ${tierName}+ tier.`;
        return `\uD83D\uDD12 **${tierName}+ Feature**\n\n${desc}\n\nUpgrade to **${tierName}** to unlock this and more.`;
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
                <span class="ezra-orb-particles"></span>
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
                                <span class="ezra-status-text">${EzraState._upsellMode ? 'Locked — Upgrade to Unlock' : 'Online'}</span>
                            </span>
                            <span id="ezra-token-budget" class="ezra-token-budget" style="display:none;font-size:9px;color:#94a3b8;"></span>
                        </div>
                    </div>
                    <div class="ezra-header-actions">
                        <button id="ezra-position-btn" class="ezra-icon-btn" title="Move Widget">\u2726</button>
                        <button id="ezra-model-selector" class="ezra-model-btn" title="AI Mode">
                            <span class="ezra-model-name">Fast</span>
                        </button>
                        <button id="ezra-clear" class="ezra-icon-btn" title="Clear Chat" style="font-size:12px;">\u{1F5D1}</button>
                        <button id="ezra-minimize" class="ezra-icon-btn" title="Minimize">\u2212</button>
                        <button id="ezra-close" class="ezra-icon-btn" title="Close">\u00D7</button>
                    </div>
                </div>

                <!-- Quick Commands -->
                <div class="ezra-quick-commands-wrapper">
                    <button class="ezra-scroll-btn ezra-scroll-left" onclick="scrollQuickCommands('left')" title="Scroll left">‹</button>
                    <div class="ezra-quick-commands" id="ezra-quick-commands">
                        ${EzraState._upsellMode ? UPSELL_QUICK_COMMANDS.map(cmd => `
                            <button class="ezra-quick-btn ezra-upsell-cmd" data-action="upsell" title="${cmd.desc}" style="opacity:0.7;position:relative;">
                                <span>${cmd.icon}</span>
                                <span>${cmd.label}</span>
                                <span style="position:absolute;top:-4px;right:-4px;font-size:7px;background:rgba(167,139,250,0.9);color:white;padding:1px 4px;border-radius:6px;white-space:nowrap;">${cmd.tier}+</span>
                            </button>
                        `).join('') : EZRA_CONFIG.quickCommands.map(cmd => `
                            <button class="ezra-quick-btn" data-action="${cmd.action}" title="${cmd.label}">
                                <span>${cmd.icon}</span>
                                <span>${cmd.label}</span>
                            </button>
                        `).join('')}
                    </div>
                    <button class="ezra-scroll-btn ezra-scroll-right" onclick="scrollQuickCommands('right')" title="Scroll right">›</button>
                </div>

                <!-- Messages Area -->
                <div id="ezra-messages" class="ezra-messages">
                    <div class="ezra-welcome" id="ezra-welcome">
                        <div class="ezra-welcome-icon">${EzraState._upsellMode ? '\uD83D\uDD12' : '\u2726'}</div>
                        <h3>Hello, I'm Ezra</h3>
                        <p>${EzraState._upsellMode ? 'Your AI co-pilot is ready — upgrade to unlock.' : 'Your AI loan structuring co-pilot.'}</p>
                        <div class="ezra-welcome-capabilities">
                            ${EzraState._upsellMode ? `
                            <div class="ezra-welcome-cap"><span>\uD83D\uDE80</span> Build quotes in seconds</div>
                            <div class="ezra-welcome-cap"><span>\uD83D\uDEE1\uFE0F</span> Smart objection handling</div>
                            <div class="ezra-welcome-cap"><span>\u2709\uFE0F</span> Auto-draft SMS & emails</div>
                            <div class="ezra-welcome-cap"><span>\u26A0\uFE0F</span> Compliance auto-check</div>
                            <div style="margin-top:8px;text-align:center;font-size:11px;color:#a78bfa;">Upgrade to Titanium to unlock all features</div>
                            ` : `
                            <div class="ezra-welcome-cap"><span>\u2726</span> Build & auto-fill quotes</div>
                            <div class="ezra-welcome-cap"><span>\u2726</span> Structure deals instantly</div>
                            <div class="ezra-welcome-cap"><span>\u2726</span> Recommend best program</div>
                            <div class="ezra-welcome-cap"><span>\u2726</span> Client scripts & coaching</div>
                            `}
                        </div>
                        <!-- Onboarding Section for First-Time Users -->
                        <div class="ezra-onboarding" id="ezra-onboarding" style="display:none;">
                            <div class="ezra-onboarding-title">\ud83c\udf1f New here? Let me help you create your first quote!</div>
                            <button class="ezra-onboarding-btn" onclick="window.ezraStartOnboarding()">
                                <span>\ud83d\ude80</span> Start Quick Quote Wizard
                            </button>
                            <div class="ezra-onboarding-hint">Or just type naturally: "$800k home, $400k mortgage, need $100k cash"</div>
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
                    <div id="ezra-attachment-preview" class="ezra-attachment-preview" style="display:none;">
                        <img id="ezra-attachment-thumb" class="ezra-attach-thumb" src="" alt="preview">
                        <span id="ezra-attachment-name" class="ezra-attach-name"></span>
                        <button id="ezra-attachment-remove" class="ezra-attach-remove" title="Remove attachment">&times;</button>
                    </div>
                    <div class="ezra-input-wrapper">
                        <textarea
                            id="ezra-input"
                            class="ezra-input"
                            placeholder="${EzraState._upsellMode ? 'Upgrade to Titanium to unlock Ezra AI...' : EZRA_CONFIG.placeholderText}"
                            rows="1"
                            ${EzraState._upsellMode ? '' : ''}
                        ></textarea>
                        <button id="ezra-paste-rates" class="ezra-action-btn" title="Paste lender rates (Ctrl+A from Figure)">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="8" y="2" width="8" height="4" rx="1"/>
                                <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"/>
                                <path d="M9 14l2 2 4-4"/>
                            </svg>
                        </button>
                        <button id="ezra-upload-doc" class="ezra-action-btn" title="Upload document or image">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                            </svg>
                        </button>
                        <button id="ezra-voice" class="ezra-action-btn" title="Voice input">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="9" y="1" width="6" height="11" rx="3"/>
                                <path d="M5 10a7 7 0 0014 0"/>
                                <line x1="12" y1="17" x2="12" y2="21"/>
                                <line x1="8" y1="21" x2="16" y2="21"/>
                            </svg>
                        </button>
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

                    <!-- Paste Rates Modal -->
                    <div id="ezra-paste-modal" class="ezra-paste-modal" style="display:none;">
                        <div class="ezra-paste-modal-content">
                            <div class="ezra-paste-modal-header">
                                <span>Paste Lender Rates</span>
                                <button class="ezra-paste-close" onclick="document.getElementById('ezra-paste-modal').style.display='none'">&times;</button>
                            </div>
                            <p class="ezra-paste-hint">Go to the lender portal (Figure), press <strong>Ctrl+A</strong> to select all, <strong>Ctrl+C</strong> to copy, then <strong>Ctrl+V</strong> below.</p>
                            <textarea id="ezra-paste-area" class="ezra-paste-area" placeholder="Paste the full page here..." rows="8"></textarea>
                            <div class="ezra-paste-actions">
                                <button class="ezra-paste-submit" id="ezra-paste-submit">Import Rates</button>
                                <button class="ezra-paste-cancel" onclick="document.getElementById('ezra-paste-modal').style.display='none'">Cancel</button>
                            </div>
                        </div>
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

            <!-- Position Selector Modal -->
            <div id="ezra-position-modal" class="ezra-modal" style="display: none;">
                <div class="ezra-modal-content">
                    <h4>Move Ezra</h4>
                    <p style="font-size:12px;color:var(--ezra-text-muted);margin-bottom:12px;">Choose a corner or drag the orb anywhere</p>
                    <div class="ezra-position-options">
                        <button class="ezra-position-option" data-pos="bottom-right">
                            <span class="ezra-pos-icon">\u2198</span>
                            <span>Bottom Right</span>
                        </button>
                        <button class="ezra-position-option" data-pos="bottom-left">
                            <span class="ezra-pos-icon">\u2199</span>
                            <span>Bottom Left</span>
                        </button>
                        <button class="ezra-position-option" data-pos="top-right">
                            <span class="ezra-pos-icon">\u2197</span>
                            <span>Top Right</span>
                        </button>
                        <button class="ezra-position-option" data-pos="top-left">
                            <span class="ezra-pos-icon">\u2196</span>
                            <span>Top Left</span>
                        </button>
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

            /* ===== FLOATING ORB - ENHANCED ===== */
            .ezra-orb {
                width: 64px;
                height: 64px;
                border-radius: 50%;
                border: none;
                cursor: grab;
                background: 
                    radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4) 0%, transparent 50%),
                    linear-gradient(135deg, #c5a059 0%, #d4af37 25%, #f0d878 50%, #d4af37 75%, #c5a059 100%);
                background-size: 200% 200%;
                color: #1e293b;
                font-size: 26px;
                display: flex;
                align-items: center;
                justify-content: center;
                position: relative;
                box-shadow:
                    0 0 30px rgba(212,175,55,0.6),
                    0 0 60px rgba(212,175,55,0.3),
                    0 0 100px rgba(212,175,55,0.15),
                    0 8px 32px rgba(0,0,0,0.4),
                    inset 0 2px 4px rgba(255,255,255,0.3),
                    inset 0 -2px 4px rgba(0,0,0,0.2);
                transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.4s ease;
                z-index: 2;
                animation: ezra-orb-shimmer 3s ease-in-out infinite, ezra-orb-float 4s ease-in-out infinite;
                user-select: none;
                touch-action: none;
            }

            .ezra-orb.dragging {
                cursor: grabbing;
                animation: none;
                transform: scale(1.15);
                box-shadow:
                    0 0 50px rgba(212,175,55,0.9),
                    0 0 100px rgba(212,175,55,0.5),
                    0 0 160px rgba(212,175,55,0.25),
                    0 20px 60px rgba(0,0,0,0.5);
                transition: none;
            }

            .ezra-orb:hover {
                transform: translateY(-6px) scale(1.12) rotate(5deg);
                box-shadow:
                    0 0 40px rgba(212,175,55,0.8),
                    0 0 80px rgba(212,175,55,0.4),
                    0 0 140px rgba(212,175,55,0.2),
                    0 16px 48px rgba(0,0,0,0.5),
                    inset 0 2px 4px rgba(255,255,255,0.4);
                animation: ezra-orb-shimmer 1.5s ease-in-out infinite, ezra-orb-spin 0.5s ease-in-out;
            }

            .ezra-orb:active {
                transform: translateY(-2px) scale(1.05);
            }

            @keyframes ezra-orb-shimmer {
                0%, 100% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
            }

            @keyframes ezra-orb-float {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-8px); }
            }

            @keyframes ezra-orb-spin {
                0% { transform: translateY(-6px) scale(1.12) rotate(0deg); }
                100% { transform: translateY(-6px) scale(1.12) rotate(360deg); }
            }

            .ezra-orb-icon {
                font-size: 28px;
                filter: drop-shadow(0 0 8px rgba(212,175,55,0.8)) drop-shadow(0 2px 4px rgba(0,0,0,0.3));
                z-index: 1;
                animation: ezra-icon-glow 2s ease-in-out infinite alternate;
            }

            @keyframes ezra-icon-glow {
                from { filter: drop-shadow(0 0 8px rgba(212,175,55,0.6)) drop-shadow(0 2px 4px rgba(0,0,0,0.3)); }
                to { filter: drop-shadow(0 0 16px rgba(255,215,100,0.9)) drop-shadow(0 2px 4px rgba(0,0,0,0.3)); }
            }

            /* Multiple orb rings for enhanced effect */
            .ezra-orb-ring {
                position: absolute;
                inset: -6px;
                border-radius: 50%;
                border: 2px solid transparent;
                background: linear-gradient(135deg, rgba(212,175,55,0.6), rgba(212,175,55,0)) border-box;
                -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
                mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
                -webkit-mask-composite: xor;
                mask-composite: exclude;
                animation: ezra-orb-pulse 2s ease-in-out infinite;
                pointer-events: none;
            }

            .ezra-orb-ring::before {
                content: '';
                position: absolute;
                inset: -8px;
                border-radius: 50%;
                border: 1px solid rgba(212,175,55,0.3);
                animation: ezra-orb-pulse-2 2.5s ease-in-out infinite 0.5s;
            }

            .ezra-orb-ring::after {
                content: '';
                position: absolute;
                inset: -12px;
                border-radius: 50%;
                border: 1px dashed rgba(212,175,55,0.2);
                animation: ezra-orb-rotate 20s linear infinite;
            }

            @keyframes ezra-orb-pulse {
                0%, 100% { transform: scale(1); opacity: 0.8; }
                50% { transform: scale(1.2); opacity: 0; }
            }

            @keyframes ezra-orb-pulse-2 {
                0%, 100% { transform: scale(1); opacity: 0.6; }
                50% { transform: scale(1.3); opacity: 0; }
            }

            @keyframes ezra-orb-rotate {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            /* Particle effects container */
            .ezra-orb-particles {
                position: absolute;
                inset: -30px;
                pointer-events: none;
                overflow: visible;
            }

            .ezra-orb-particles::before,
            .ezra-orb-particles::after {
                content: '';
                position: absolute;
                width: 4px;
                height: 4px;
                background: radial-gradient(circle, rgba(212,175,55,0.8) 0%, transparent 70%);
                border-radius: 50%;
                animation: ezra-particle-1 3s ease-in-out infinite;
            }

            .ezra-orb-particles::before {
                top: 20%;
                left: 10%;
                animation-delay: 0s;
            }

            .ezra-orb-particles::after {
                top: 60%;
                right: 10%;
                animation-delay: 1.5s;
            }

            @keyframes ezra-particle-1 {
                0%, 100% { transform: translate(0, 0) scale(0); opacity: 0; }
                20% { opacity: 1; }
                80% { opacity: 1; }
                100% { transform: translate(20px, -30px) scale(1); opacity: 0; }
            }

            /* ===== CHAT PANEL - ENHANCED ===== */
            .ezra-container {
                position: absolute;
                bottom: 0;
                right: 0;
                width: 480px;
                height: 660px;
                background: 
                    linear-gradient(135deg, rgba(30,41,59,0.98) 0%, rgba(15,23,42,0.98) 100%),
                    radial-gradient(ellipse at top right, rgba(197,160,89,0.1) 0%, transparent 50%),
                    radial-gradient(ellipse at bottom left, rgba(139,92,246,0.05) 0%, transparent 40%);
                border-radius: var(--ezra-radius);
                border: 1px solid var(--ezra-glass-border);
                box-shadow:
                    0 0 60px rgba(197,160,89,0.2),
                    0 0 120px rgba(197,160,89,0.08),
                    0 25px 80px rgba(0,0,0,0.6),
                    inset 0 1px 0 rgba(255,255,255,0.08),
                    inset 0 -1px 0 rgba(0,0,0,0.3);
                display: none;
                flex-direction: column;
                overflow: hidden;
                backdrop-filter: blur(24px) saturate(180%);
            }

            .ezra-container::before {
                content: '';
                position: absolute;
                inset: 0;
                background: linear-gradient(180deg, 
                    rgba(197,160,89,0.03) 0%, 
                    transparent 20%,
                    transparent 80%,
                    rgba(139,92,246,0.02) 100%);
                pointer-events: none;
                border-radius: var(--ezra-radius);
            }

            .ezra-container.open {
                display: flex;
                animation: ezra-panel-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
            }

            @keyframes ezra-panel-in {
                0% {
                    opacity: 0;
                    transform: translateY(30px) scale(0.9) rotateX(5deg);
                    filter: blur(10px);
                }
                60% {
                    opacity: 1;
                    transform: translateY(-5px) scale(1.02) rotateX(0deg);
                    filter: blur(0);
                }
                100% {
                    opacity: 1;
                    transform: translateY(0) scale(1) rotateX(0deg);
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
                width: 40px;
                height: 40px;
                background: 
                    radial-gradient(circle at 30% 30%, rgba(255,255,255,0.5) 0%, transparent 50%),
                    linear-gradient(135deg, var(--ezra-gold) 0%, var(--ezra-gold-bright) 50%, #f0d878 100%);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                color: var(--ezra-dark-1);
                font-weight: 700;
                box-shadow: 
                    0 0 20px rgba(212,175,55,0.5),
                    0 0 40px rgba(212,175,55,0.2),
                    inset 0 2px 4px rgba(255,255,255,0.4),
                    inset 0 -2px 4px rgba(0,0,0,0.1);
                animation: ezra-avatar-pulse 3s ease-in-out infinite;
                position: relative;
            }

            .ezra-avatar::after {
                content: '';
                position: absolute;
                inset: -3px;
                border-radius: 50%;
                border: 2px solid transparent;
                background: linear-gradient(135deg, rgba(212,175,55,0.6), transparent 60%) border-box;
                -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
                mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
                -webkit-mask-composite: xor;
                mask-composite: exclude;
                animation: ezra-avatar-ring 2s ease-in-out infinite;
            }

            @keyframes ezra-avatar-pulse {
                0%, 100% { transform: scale(1); box-shadow: 0 0 20px rgba(212,175,55,0.5), 0 0 40px rgba(212,175,55,0.2); }
                50% { transform: scale(1.05); box-shadow: 0 0 30px rgba(212,175,55,0.7), 0 0 60px rgba(212,175,55,0.3); }
            }

            @keyframes ezra-avatar-ring {
                0%, 100% { transform: scale(1); opacity: 0.8; }
                50% { transform: scale(1.15); opacity: 0.3; }
            }

            .ezra-header-info {
                display: flex;
                flex-direction: column;
            }

            .ezra-title {
                font-family: 'DM Sans', 'Inter', sans-serif;
                font-weight: 800;
                font-size: 16px;
                letter-spacing: 3px;
                color: var(--ezra-gold);
                text-shadow: 0 0 20px rgba(197,160,89,0.5), 0 2px 4px rgba(0,0,0,0.3);
                background: linear-gradient(135deg, var(--ezra-gold) 0%, var(--ezra-gold-bright) 50%, #f0d878 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                position: relative;
            }

            .ezra-status {
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 11px;
                color: var(--ezra-text-muted);
                font-weight: 500;
            }

            .ezra-status-dot {
                width: 8px;
                height: 8px;
                background: linear-gradient(135deg, #22c55e, #4ade80);
                border-radius: 50%;
                box-shadow: 
                    0 0 8px rgba(34,197,94,0.8),
                    0 0 16px rgba(34,197,94,0.4);
                animation: ezra-status-pulse 2s ease-in-out infinite;
                position: relative;
            }

            .ezra-status-dot::after {
                content: '';
                position: absolute;
                inset: -4px;
                border-radius: 50%;
                border: 1px solid rgba(34,197,94,0.3);
                animation: ezra-status-ring 2s ease-in-out infinite;
            }

            @keyframes ezra-status-pulse {
                0%, 100% { transform: scale(1); opacity: 1; }
                50% { transform: scale(1.2); opacity: 0.7; }
            }

            @keyframes ezra-status-ring {
                0%, 100% { transform: scale(1); opacity: 0.6; }
                50% { transform: scale(1.5); opacity: 0; }
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

            /* ===== QUICK COMMANDS - ENHANCED WITH SLIDER ===== */
            .ezra-quick-commands-wrapper {
                position: relative;
                display: flex;
                align-items: center;
                border-bottom: 1px solid rgba(255,255,255,0.04);
                background: linear-gradient(180deg, rgba(15,23,42,0.5) 0%, rgba(15,23,42,0) 100%);
            }

            .ezra-quick-commands {
                display: flex;
                gap: 8px;
                padding: 12px 32px;
                overflow-x: auto;
                scrollbar-width: none;
                scroll-behavior: smooth;
                -webkit-overflow-scrolling: touch;
                flex: 1;
                mask-image: linear-gradient(90deg, transparent 0%, black 20px, black calc(100% - 20px), transparent 100%);
                -webkit-mask-image: linear-gradient(90deg, transparent 0%, black 20px, black calc(100% - 20px), transparent 100%);
            }

            .ezra-quick-commands::-webkit-scrollbar {
                display: none;
            }

            .ezra-scroll-btn {
                position: absolute;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: linear-gradient(135deg, rgba(197,160,89,0.9) 0%, rgba(197,160,89,0.7) 100%);
                border: none;
                color: #0f172a;
                font-size: 16px;
                font-weight: 700;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10;
                transition: all 0.2s ease;
                box-shadow: 0 2px 8px rgba(197,160,89,0.3);
                opacity: 0.85;
            }

            .ezra-scroll-btn:hover {
                opacity: 1;
                transform: scale(1.1);
                box-shadow: 0 4px 12px rgba(197,160,89,0.5);
            }

            .ezra-scroll-btn:active {
                transform: scale(0.95);
            }

            .ezra-scroll-left {
                left: 4px;
            }

            .ezra-scroll-right {
                right: 4px;
            }

            .ezra-scroll-btn.hidden {
                opacity: 0;
                pointer-events: none;
            }

            .ezra-quick-btn {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 8px 14px;
                background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 24px;
                font-size: 12px;
                font-weight: 600;
                color: var(--ezra-text-muted);
                cursor: pointer;
                white-space: nowrap;
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }

            .ezra-quick-btn:hover {
                background: linear-gradient(135deg, rgba(197,160,89,0.2) 0%, rgba(197,160,89,0.1) 100%);
                border-color: rgba(197,160,89,0.4);
                color: var(--ezra-gold);
                transform: translateY(-2px) scale(1.02);
                box-shadow: 
                    0 4px 16px rgba(197,160,89,0.2),
                    0 0 20px rgba(197,160,89,0.1);
            }

            .ezra-quick-btn:active {
                transform: translateY(0) scale(0.98);
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

            /* Welcome - Enhanced */
            .ezra-welcome {
                text-align: center;
                padding: 32px 20px;
                color: var(--ezra-text);
                position: relative;
            }

            .ezra-welcome::before {
                content: '';
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 200px;
                height: 200px;
                background: radial-gradient(circle, rgba(197,160,89,0.1) 0%, transparent 70%);
                pointer-events: none;
            }

            .ezra-welcome-icon {
                font-size: 48px;
                color: var(--ezra-gold);
                margin-bottom: 16px;
                filter: drop-shadow(0 0 20px rgba(212,175,55,0.6)) drop-shadow(0 0 40px rgba(212,175,55,0.3));
                animation: ezra-welcome-glow 2s ease-in-out infinite alternate;
            }

            @keyframes ezra-welcome-glow {
                from { filter: drop-shadow(0 0 20px rgba(212,175,55,0.6)) drop-shadow(0 0 40px rgba(212,175,55,0.3)); transform: scale(1); }
                to { filter: drop-shadow(0 0 30px rgba(255,215,100,0.8)) drop-shadow(0 0 60px rgba(212,175,55,0.4)); transform: scale(1.05); }
            }

            .ezra-welcome h3 {
                margin: 0 0 10px;
                font-family: 'DM Sans', 'Inter', sans-serif;
                font-size: 22px;
                font-weight: 700;
                background: linear-gradient(135deg, var(--ezra-gold) 0%, var(--ezra-gold-bright) 50%, #f0d878 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
                background-clip: text;
                text-shadow: 0 0 30px rgba(197,160,89,0.3);
            }

            .ezra-welcome p {
                margin: 0 0 20px;
                color: var(--ezra-text-muted);
                font-size: 14px;
                line-height: 1.6;
            }

            .ezra-welcome-capabilities {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                text-align: left;
            }

            .ezra-welcome-cap {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 12px;
                background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 10px;
                font-size: 12px;
                color: var(--ezra-text-muted);
                transition: all 0.3s ease;
                cursor: default;
            }

            .ezra-welcome-cap:hover {
                background: linear-gradient(135deg, rgba(197,160,89,0.1) 0%, rgba(197,160,89,0.05) 100%);
                border-color: rgba(197,160,89,0.2);
                transform: translateY(-2px);
            }

            .ezra-welcome-cap span {
                color: var(--ezra-gold);
                font-size: 12px;
                filter: drop-shadow(0 0 4px rgba(212,175,55,0.5));
            }

            /* Onboarding Section */
            .ezra-onboarding {
                margin-top: 20px;
                padding: 16px;
                background: linear-gradient(135deg, rgba(197,160,89,0.15) 0%, rgba(197,160,89,0.05) 100%);
                border: 1px solid rgba(197,160,89,0.3);
                border-radius: 12px;
                text-align: center;
                animation: ezra-onboarding-pulse 3s ease-in-out infinite;
            }

            @keyframes ezra-onboarding-pulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(197,160,89,0.2); }
                50% { box-shadow: 0 0 20px 5px rgba(197,160,89,0.1); }
            }

            .ezra-onboarding-title {
                font-size: 14px;
                font-weight: 600;
                color: var(--ezra-gold);
                margin-bottom: 12px;
            }

            .ezra-onboarding-btn {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 12px 24px;
                background: linear-gradient(135deg, var(--ezra-gold), var(--ezra-gold-bright));
                color: #0f172a;
                border: none;
                border-radius: 25px;
                font-size: 14px;
                font-weight: 700;
                cursor: pointer;
                transition: all 0.3s ease;
                box-shadow: 0 4px 15px rgba(197,160,89,0.3);
            }

            .ezra-onboarding-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(197,160,89,0.4);
            }

            .ezra-onboarding-hint {
                margin-top: 12px;
                font-size: 11px;
                color: var(--ezra-text-muted);
                font-style: italic;
            }

            /* Message Bubbles - Enhanced */
            .ezra-message {
                display: flex;
                gap: 12px;
                max-width: 88%;
                animation: ezra-message-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            }

            @keyframes ezra-message-in {
                0% { opacity: 0; transform: translateY(10px) scale(0.95); }
                100% { opacity: 1; transform: translateY(0) scale(1); }
            }

            .ezra-message.user {
                align-self: flex-end;
                flex-direction: row-reverse;
            }

            .ezra-message-avatar {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                flex-shrink: 0;
                box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            }

            .ezra-message.assistant .ezra-message-avatar {
                background: linear-gradient(135deg, var(--ezra-dark-3), var(--ezra-dark-2));
                border: 1px solid var(--ezra-glass-border);
                color: var(--ezra-gold);
                position: relative;
            }

            .ezra-message.assistant .ezra-message-avatar::after {
                content: '';
                position: absolute;
                inset: -2px;
                border-radius: 50%;
                border: 1px solid rgba(197,160,89,0.3);
                animation: ezra-avatar-glow 3s ease-in-out infinite;
            }

            @keyframes ezra-avatar-glow {
                0%, 100% { opacity: 0.5; transform: scale(1); }
                50% { opacity: 1; transform: scale(1.1); }
            }

            .ezra-message.user .ezra-message-avatar {
                background: linear-gradient(135deg, var(--ezra-gold), var(--ezra-gold-bright));
                color: var(--ezra-dark-1);
            }

            .ezra-message-content {
                padding: 12px 16px;
                border-radius: 16px;
                font-size: 13px;
                line-height: 1.6;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                transition: all 0.2s ease;
            }

            .ezra-message-content:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 30px rgba(0,0,0,0.2);
            }

            .ezra-message.assistant .ezra-message-content {
                background: linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%);
                border: 1px solid rgba(255,255,255,0.1);
                color: var(--ezra-text);
                border-bottom-left-radius: 4px;
            }

            .ezra-message.user .ezra-message-content {
                background: linear-gradient(135deg, rgba(197,160,89,0.25) 0%, rgba(212,175,55,0.15) 100%);
                border: 1px solid rgba(197,160,89,0.3);
                color: var(--ezra-text);
                border-bottom-right-radius: 4px;
                box-shadow: 
                    0 4px 20px rgba(0,0,0,0.15),
                    0 0 30px rgba(197,160,89,0.1);
            }

            .ezra-message-content code {
                background: rgba(0,0,0,0.4);
                padding: 3px 8px;
                border-radius: 6px;
                font-size: 12px;
                color: var(--ezra-gold);
                border: 1px solid rgba(197,160,89,0.2);
            }

            .ezra-message-time {
                font-size: 10px;
                color: var(--ezra-text-muted);
                margin-top: 6px;
                opacity: 0.7;
                font-weight: 500;
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

            /* ===== TYPING INDICATOR - ENHANCED ===== */
            .ezra-typing {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 16px 20px;
                background: rgba(255,255,255,0.02);
                border-radius: 12px;
                margin: 0 18px 10px;
                border: 1px solid rgba(197,160,89,0.1);
            }

            .ezra-typing-dot {
                width: 10px;
                height: 10px;
                background: linear-gradient(135deg, var(--ezra-gold), var(--ezra-gold-bright));
                border-radius: 50%;
                box-shadow: 0 0 10px rgba(197,160,89,0.6);
                animation: ezra-typing-bounce 1.4s infinite ease-in-out both;
            }

            .ezra-typing-dot:nth-child(1) { animation-delay: -0.32s; }
            .ezra-typing-dot:nth-child(2) { animation-delay: -0.16s; }

            @keyframes ezra-typing-bounce {
                0%, 80%, 100% { transform: scale(0.6) translateY(0); opacity: 0.4; }
                40% { transform: scale(1) translateY(-8px); opacity: 1; box-shadow: 0 0 20px rgba(197,160,89,0.9); }
            }

            /* ===== ATTACHMENT PREVIEW ===== */
            .ezra-attachment-preview {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 10px;
                margin-bottom: 6px;
                background: rgba(197,160,89,0.08);
                border: 1px solid rgba(197,160,89,0.2);
                border-radius: 12px;
            }
            .ezra-attach-thumb {
                width: 40px;
                height: 40px;
                border-radius: 6px;
                object-fit: cover;
                background: rgba(0,0,0,0.2);
            }
            .ezra-attach-name {
                flex: 1;
                font-size: 11px;
                color: rgba(255,255,255,0.7);
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            .ezra-attach-remove {
                background: none;
                border: none;
                color: rgba(255,255,255,0.5);
                font-size: 18px;
                cursor: pointer;
                padding: 0 4px;
                line-height: 1;
            }
            .ezra-attach-remove:hover { color: #ef4444; }

            /* ===== MESSAGE IMAGE ===== */
            .ezra-msg-image {
                max-width: 200px;
                border-radius: 8px;
                margin-bottom: 6px;
                display: block;
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

            .ezra-action-btn {
                width: 32px;
                height: 32px;
                background: transparent;
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 50%;
                color: var(--ezra-text-muted);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
                flex-shrink: 0;
            }
            .ezra-action-btn:hover {
                background: rgba(255,255,255,0.06);
                color: var(--ezra-gold);
                border-color: var(--ezra-gold-dim);
            }
            .ezra-action-btn svg { width: 15px; height: 15px; }
            .ezra-action-btn.recording {
                background: rgba(239,68,68,0.2);
                border-color: #ef4444;
                color: #ef4444;
                animation: ezra-pulse-record 1.2s ease-in-out infinite;
            }
            @keyframes ezra-pulse-record {
                0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); }
                50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
            }

            @keyframes ezra-voice-pulse {
                0%, 100% { 
                    transform: scale(1);
                    box-shadow: 0 0 0 0 rgba(239,68,68,0.4), inset 0 0 10px rgba(239,68,68,0.2);
                }
                50% { 
                    transform: scale(1.05);
                    box-shadow: 0 0 0 8px rgba(239,68,68,0), inset 0 0 15px rgba(239,68,68,0.3);
                }
            }

            .ezra-send-btn {
                width: 40px;
                height: 40px;
                background: linear-gradient(135deg, var(--ezra-gold) 0%, var(--ezra-gold-bright) 50%, #f0d878 100%);
                border: none;
                border-radius: 50%;
                color: var(--ezra-dark-1);
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                flex-shrink: 0;
                box-shadow: 
                    0 4px 15px rgba(197,160,89,0.4),
                    0 0 20px rgba(197,160,89,0.2),
                    inset 0 2px 4px rgba(255,255,255,0.3);
            }

            .ezra-send-btn:hover:not(:disabled) {
                transform: scale(1.1) rotate(-5deg);
                box-shadow: 
                    0 6px 25px rgba(197,160,89,0.6),
                    0 0 40px rgba(197,160,89,0.3),
                    inset 0 2px 4px rgba(255,255,255,0.4);
            }

            .ezra-send-btn:active:not(:disabled) {
                transform: scale(0.95);
            }

            .ezra-send-btn:disabled {
                opacity: 0.3;
                cursor: not-allowed;
                box-shadow: none;
            }

            .ezra-send-btn svg {
                width: 18px;
                height: 18px;
                filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
            }

            /* Paste Rates Modal */
            .ezra-paste-modal {
                position: absolute;
                bottom: 0; left: 0; right: 0; top: 0;
                background: rgba(0,0,0,0.7);
                backdrop-filter: blur(4px);
                z-index: 100;
                display: flex;
                align-items: flex-end;
                padding: 16px;
            }
            .ezra-paste-modal-content {
                background: var(--ezra-dark-2);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 12px;
                padding: 16px;
                width: 100%;
                max-height: 80%;
                overflow: auto;
            }
            .ezra-paste-modal-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 14px;
                font-weight: 600;
                color: var(--ezra-gold);
                margin-bottom: 8px;
            }
            .ezra-paste-close {
                background: none; border: none; color: var(--ezra-text-muted); font-size: 20px; cursor: pointer; padding: 0 4px;
            }
            .ezra-paste-close:hover { color: white; }
            .ezra-paste-hint {
                font-size: 11px;
                color: var(--ezra-text-muted);
                margin-bottom: 10px;
                line-height: 1.5;
            }
            .ezra-paste-hint strong { color: var(--ezra-text); }
            .ezra-paste-area {
                width: 100%;
                background: rgba(0,0,0,0.3);
                border: 1px solid rgba(255,255,255,0.1);
                border-radius: 8px;
                padding: 10px;
                color: var(--ezra-text);
                font-size: 11px;
                font-family: monospace;
                resize: vertical;
                min-height: 100px;
                max-height: 200px;
                outline: none;
            }
            .ezra-paste-area:focus {
                border-color: var(--ezra-gold-dim);
            }
            .ezra-paste-area::placeholder { color: var(--ezra-text-muted); opacity: 0.5; }
            .ezra-paste-actions {
                display: flex; gap: 8px; margin-top: 10px;
            }
            .ezra-paste-submit {
                flex: 1;
                padding: 8px 16px;
                background: linear-gradient(135deg, var(--ezra-gold), var(--ezra-gold-bright));
                border: none; border-radius: 8px;
                color: var(--ezra-dark-1);
                font-weight: 600; font-size: 12px;
                cursor: pointer; transition: all 0.2s;
            }
            .ezra-paste-submit:hover { box-shadow: 0 0 12px rgba(212,175,55,0.4); }
            .ezra-paste-cancel {
                padding: 8px 16px;
                background: transparent;
                border: 1px solid rgba(255,255,255,0.15);
                border-radius: 8px;
                color: var(--ezra-text-muted);
                font-size: 12px;
                cursor: pointer;
            }
            .ezra-paste-cancel:hover { border-color: rgba(255,255,255,0.3); color: var(--ezra-text); }

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

            /* ===== POSITION SELECTOR ===== */
            .ezra-position-options {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
            }

            .ezra-position-option {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                padding: 16px 12px;
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: var(--ezra-radius-sm);
                background: rgba(255,255,255,0.03);
                cursor: pointer;
                transition: all 0.2s;
                color: var(--ezra-text);
                font-size: 12px;
            }

            .ezra-position-option:hover {
                background: rgba(197,160,89,0.1);
                border-color: rgba(197,160,89,0.3);
            }

            .ezra-pos-icon {
                font-size: 24px;
                color: var(--ezra-gold);
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

                /* Mobile-optimized quick commands slider */
                .ezra-quick-commands-wrapper {
                    background: linear-gradient(180deg, rgba(15,23,42,0.8) 0%, rgba(15,23,42,0.3) 100%);
                }

                .ezra-quick-commands {
                    padding: 10px 28px;
                    gap: 6px;
                    -webkit-overflow-scrolling: touch;
                    scroll-snap-type: x mandatory;
                }

                .ezra-quick-btn {
                    padding: 6px 12px;
                    font-size: 11px;
                    border-radius: 20px;
                    scroll-snap-align: start;
                    -webkit-tap-highlight-color: transparent;
                }

                .ezra-quick-btn span:first-child {
                    font-size: 14px;
                }

                .ezra-scroll-btn {
                    width: 22px;
                    height: 22px;
                    font-size: 14px;
                    opacity: 0.9;
                }

                .ezra-scroll-left {
                    left: 2px;
                }

                .ezra-scroll-right {
                    right: 2px;
                }

                /* Ensure touch targets are large enough */
                .ezra-quick-btn,
                .ezra-scroll-btn {
                    min-height: 32px;
                    min-width: 32px;
                }
            }

            /* Extra small devices */
            @media (max-width: 375px) {
                .ezra-quick-commands {
                    padding: 8px 26px;
                }

                .ezra-quick-btn {
                    padding: 5px 10px;
                    font-size: 10px;
                }

                .ezra-scroll-btn {
                    width: 20px;
                    height: 20px;
                    font-size: 12px;
                }
            }

            /* Touch device optimizations */
            @media (hover: none) and (pointer: coarse) {
                .ezra-quick-commands {
                    overflow-x: scroll;
                    scrollbar-width: none;
                }

                .ezra-scroll-btn {
                    display: flex;
                    opacity: 0.95;
                }

                .ezra-quick-btn:active {
                    transform: scale(0.95);
                    background: linear-gradient(135deg, rgba(197,160,89,0.3) 0%, rgba(197,160,89,0.15) 100%);
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

        // Drag functionality
        initDragFunctionality();

        // Close button
        document.getElementById('ezra-close')?.addEventListener('click', closeWidget);

        // Clear chat button
        document.getElementById('ezra-clear')?.addEventListener('click', clearChat);

        // Minimize button
        document.getElementById('ezra-minimize')?.addEventListener('click', minimizeWidget);

        // Model selector
        document.getElementById('ezra-model-selector')?.addEventListener('click', showModelModal);

        // Position selector
        document.getElementById('ezra-position-btn')?.addEventListener('click', showPositionModal);

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

        // Paste Rates button
        document.getElementById('ezra-paste-rates')?.addEventListener('click', openPasteModal);

        // Paste modal submit
        document.getElementById('ezra-paste-submit')?.addEventListener('click', submitPastedRates);

        // Voice input button
        document.getElementById('ezra-voice')?.addEventListener('click', toggleVoiceInput);

        // Document upload button
        document.getElementById('ezra-upload-doc')?.addEventListener('click', handleDocUpload);

        // Attachment remove button
        document.getElementById('ezra-attachment-remove')?.addEventListener('click', clearAttachment);

        // Position selection
        document.querySelectorAll('.ezra-position-option').forEach(btn => {
            btn.addEventListener('click', () => moveWidgetToPosition(btn.dataset.pos));
        });

        // Close position modal on outside click
        document.getElementById('ezra-position-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'ezra-position-modal') {
                hidePositionModal();
            }
        });
    }

    // ============================================
    // WIDGET POSITION & DRAG
    // ============================================
    function initDragFunctionality() {
        const orb = document.getElementById('ezra-orb');
        const widget = document.getElementById('ezra-widget');
        if (!orb || !widget) return;

        let isDragging = false;
        let startX, startY, startLeft, startTop;
        let dragThreshold = 5;

        // Load saved position
        const savedPos = localStorage.getItem('ezraWidgetPosition');
        if (savedPos) {
            const pos = JSON.parse(savedPos);
            if (pos.custom) {
                widget.style.left = pos.x + 'px';
                widget.style.right = 'auto';
                widget.style.bottom = 'auto';
                widget.style.top = pos.y + 'px';
            }
        }

        function onMouseDown(e) {
            isDragging = false;
            startX = e.clientX || (e.touches && e.touches[0].clientX);
            startY = e.clientY || (e.touches && e.touches[0].clientY);
            
            const rect = widget.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            document.addEventListener('touchmove', onTouchMove, { passive: false });
            document.addEventListener('touchend', onMouseUp);
        }

        function onMouseMove(e) {
            const clientX = e.clientX;
            const clientY = e.clientY;
            const dx = clientX - startX;
            const dy = clientY - startY;

            if (!isDragging && (Math.abs(dx) > dragThreshold || Math.abs(dy) > dragThreshold)) {
                isDragging = true;
                orb.classList.add('dragging');
            }

            if (isDragging) {
                e.preventDefault();
                const newLeft = Math.max(0, Math.min(window.innerWidth - 64, startLeft + dx));
                const newTop = Math.max(0, Math.min(window.innerHeight - 64, startTop + dy));
                
                widget.style.left = newLeft + 'px';
                widget.style.top = newTop + 'px';
                widget.style.right = 'auto';
                widget.style.bottom = 'auto';
            }
        }

        function onTouchMove(e) {
            if (e.touches && e.touches[0]) {
                onMouseMove({
                    clientX: e.touches[0].clientX,
                    clientY: e.touches[0].clientY,
                    preventDefault: () => e.preventDefault()
                });
            }
        }

        function onMouseUp() {
            if (isDragging) {
                orb.classList.remove('dragging');
                // Save position
                const rect = widget.getBoundingClientRect();
                localStorage.setItem('ezraWidgetPosition', JSON.stringify({
                    custom: true,
                    x: rect.left,
                    y: rect.top
                }));
            }
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onMouseUp);
        }

        orb.addEventListener('mousedown', onMouseDown);
        orb.addEventListener('touchstart', onMouseDown, { passive: true });
    }

    function showPositionModal() {
        const modal = document.getElementById('ezra-position-modal');
        if (modal) modal.style.display = 'flex';
    }

    function hidePositionModal() {
        const modal = document.getElementById('ezra-position-modal');
        if (modal) modal.style.display = 'none';
    }

    function moveWidgetToPosition(position) {
        const widget = document.getElementById('ezra-widget');
        if (!widget) return;

        // Clear inline styles
        widget.style.left = widget.style.top = widget.style.right = widget.style.bottom = '';

        // Apply position
        switch (position) {
            case 'bottom-right':
                widget.style.right = '28px';
                widget.style.bottom = '28px';
                break;
            case 'bottom-left':
                widget.style.left = '28px';
                widget.style.bottom = '28px';
                break;
            case 'top-right':
                widget.style.right = '28px';
                widget.style.top = '28px';
                break;
            case 'top-left':
                widget.style.left = '28px';
                widget.style.top = '28px';
                break;
        }

        // Save preference
        localStorage.setItem('ezraWidgetPosition', JSON.stringify({ position }));
        hidePositionModal();
    }

    // ============================================
    // TIER GATING FOR PLATINUM+ FEATURES
    // ============================================
    function requirePlatinum(featureName) {
        const tiers = ['carbon', 'titanium', 'platinum', 'obsidian', 'diamond'];
        const tier = window.currentUserTier || 'carbon';
        const level = tiers.indexOf(tier);
        // super_admin always has access
        if (window.currentUserRole === 'super_admin') return true;
        if (level >= 2) return true; // platinum+

        // Show upgrade prompt
        const hooks = {
            'Paste Rates': 'Import Figure pricing in 10 seconds — stop typing rates manually for 15 minutes.',
            'Voice Input': 'Talk to Ezra hands-free between client calls. Describe the deal, get the quote.',
        };
        const msg = hooks[featureName] || 'This feature is available on Platinum and above.';
        addMessage('assistant', '**' + featureName + ' requires Platinum**\n\n' + msg + '\n\n*Upgrade to Platinum to unlock this and save 2+ hours every day.*');
        if (typeof showUpgradeModal === 'function') showUpgradeModal();
        return false;
    }

    // ============================================
    // PASTE RATES MODAL
    // ============================================
    function openPasteModal() {
        if (!requirePlatinum('Paste Rates')) return;
        const modal = document.getElementById('ezra-paste-modal');
        const area = document.getElementById('ezra-paste-area');
        if (modal) {
            modal.style.display = 'flex';
            if (area) { area.value = ''; area.focus(); }
        }
    }

    function submitPastedRates() {
        const area = document.getElementById('ezra-paste-area');
        const modal = document.getElementById('ezra-paste-modal');
        if (!area || !area.value.trim()) return;

        const pastedText = area.value.trim();
        modal.style.display = 'none';

        // Feed the pasted text through Ezra as a message
        const input = document.getElementById('ezra-input');
        if (input) {
            input.value = pastedText;
            sendMessage();
        }
    }

    function isEzraVoiceEnabled() {
        return localStorage.getItem('ezra_voice_enabled') !== 'false';
    }

    function getEzraVoiceLang() {
        return localStorage.getItem('carbon_voice_lang') || 'en-US';
    }

    function recordEzraVoiceTelemetry(eventType, data = {}) {
        const payload = {
            eventType,
            createdAt: new Date().toISOString(),
            userId: window.currentUserId || null,
            voiceEnabled: isEzraVoiceEnabled(),
            voiceLang: getEzraVoiceLang(),
            data,
        };

        try {
            const storageKey = `ezra_voice_telemetry_${window.currentUserId || 'anon'}`;
            const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
            existing.push(payload);
            localStorage.setItem(storageKey, JSON.stringify(existing.slice(-50)));
        } catch (e) {
            // Ignore storage issues; telemetry is best-effort only.
        }

        window.dispatchEvent(new CustomEvent('ezra:voice-telemetry', { detail: payload }));
    }

    function syncEzraVoiceButtonState() {
        const voiceBtn = document.getElementById('ezra-voice');
        if (!voiceBtn || voiceBtn.dataset.locked === 'true') return;

        const enabled = isEzraVoiceEnabled();
        voiceBtn.style.opacity = enabled ? '' : '0.55';
        voiceBtn.style.filter = enabled ? '' : 'grayscale(0.2)';
        voiceBtn.title = enabled ? 'Voice input' : 'Voice input disabled in Settings > Voice';
        voiceBtn.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    }

    function syncEzraVoiceSettings(settings = {}) {
        const changedKeys = [];
        if (typeof settings.enabled === 'boolean') {
            localStorage.setItem('ezra_voice_enabled', settings.enabled ? 'true' : 'false');
            changedKeys.push('enabled');
        }

        if (typeof settings.voiceLang === 'string' && settings.voiceLang.trim()) {
            localStorage.setItem('carbon_voice_lang', settings.voiceLang.trim());
            changedKeys.push('voiceLang');
        }

        if (_voiceRecognition) {
            if (!isEzraVoiceEnabled()) {
                stopVoiceInput();
            } else {
                _voiceRecognition.lang = getEzraVoiceLang();
            }
        }

        syncEzraVoiceButtonState();

        if (changedKeys.length) {
            recordEzraVoiceTelemetry('settings_changed', { changedKeys });
        }
    }

    let _voiceSettingsListenerBound = false;
    function bindVoiceSettingsListener() {
        if (_voiceSettingsListenerBound) return;
        window.addEventListener('carbon:voice-settings-changed', (event) => {
            syncEzraVoiceSettings(event.detail || {});
        });
        _voiceSettingsListenerBound = true;
    }

    // ============================================
    // VOICE INPUT (Web Speech API)
    // ============================================
    let _voiceRecognition = null;
    let _isRecording = false;

    function toggleVoiceInput() {
        if (_isRecording) {
            stopVoiceInput();
            return;
        }

        if (!requirePlatinum('Voice Input')) return;
        if (!isEzraVoiceEnabled()) {
            recordEzraVoiceTelemetry('blocked_disabled');
            if (typeof showToast === 'function') {
                showToast('Voice input is disabled in Settings > Voice.', 'info');
            }
            return;
        }

        // Check browser support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            recordEzraVoiceTelemetry('unsupported_browser');
            if (typeof showToast === 'function') {
                showToast('Voice input not supported in this browser. Try Chrome.', 'error');
            }
            return;
        }

        _voiceRecognition = new SpeechRecognition();
        // Mobile optimization: don't use continuous mode on touch devices to save battery
        const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
        _voiceRecognition.continuous = !isTouchDevice; // false on mobile, true on desktop
        _voiceRecognition.interimResults = true;
        _voiceRecognition.lang = getEzraVoiceLang();
        _voiceRecognition.maxAlternatives = 1;

        const voiceBtn = document.getElementById('ezra-voice');
        const input = document.getElementById('ezra-input');
        let finalTranscript = input.value || '';
        let startLength = finalTranscript.length;
        let _silenceTimer = null;
        const SILENCE_TIMEOUT = isTouchDevice ? 3000 : 5000; // 3s on mobile, 5s on desktop

        _voiceRecognition.onstart = () => {
            _isRecording = true;
            recordEzraVoiceTelemetry('started', { isTouchDevice });
            if (voiceBtn) {
                voiceBtn.classList.add('recording');
                // Mobile: add pulsing animation for better visibility
                if (isTouchDevice) {
                    voiceBtn.style.animation = 'ezra-voice-pulse 1s ease-in-out infinite';
                }
            }
            if (input) input.placeholder = isTouchDevice ? '🎤 Tap mic to stop...' : 'Listening...';
            
            // Auto-stop after silence timeout on mobile (saves battery)
            if (isTouchDevice) {
                _silenceTimer = setTimeout(() => {
                    if (_isRecording) {
                        stopVoiceInput();
                        if (typeof showToast === 'function') showToast('Voice input timed out', 'info');
                    }
                }, 15000); // Hard stop after 15s on mobile
            }
        };

        _voiceRecognition.onresult = (event) => {
            let interim = '';
            let newFinalText = '';
            let hasSpeech = false;
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    newFinalText += (newFinalText ? ' ' : '') + transcript;
                    finalTranscript += (finalTranscript.length > startLength ? ' ' : '') + transcript;
                    hasSpeech = true;
                    recordEzraVoiceTelemetry('transcript_captured', { length: transcript.trim().length });
                    
                    // Check for voice-to-quote command
                    if (window.processVoiceToQuote && window.processVoiceToQuote(transcript)) {
                        // Quote command detected and processed, clear input
                        stopVoiceInput();
                        if (input) input.value = '';
                        return;
                    }
                } else {
                    interim += transcript;
                    hasSpeech = true;
                }
            }
            if (input) {
                input.value = finalTranscript + (interim ? ' ' + interim : '');
                autoResizeTextarea();
            }
            
            // Reset silence timer on mobile when speech is detected
            if (isTouchDevice && hasSpeech && _silenceTimer) {
                clearTimeout(_silenceTimer);
                _silenceTimer = setTimeout(() => {
                    if (_isRecording) stopVoiceInput();
                }, 15000);
            }
        };

        _voiceRecognition.onerror = (event) => {
            console.warn('Voice input error:', event.error);
            recordEzraVoiceTelemetry('error', { error: event.error || 'unknown_error' });
            stopVoiceInput();
            if (event.error === 'not-allowed') {
                if (typeof showToast === 'function') showToast('Microphone access denied. Check browser permissions.', 'error');
            }
        };

        _voiceRecognition.onend = () => {
            stopVoiceInput();
            recordEzraVoiceTelemetry('completed', {
                chars: input && input.value ? input.value.trim().length : 0,
                autoEnabled: !!(input && input.value.trim().length > 10)
            });
            // Auto-send if we got substantial text
            if (input && input.value.trim().length > 10) {
                const sendBtn = document.getElementById('ezra-send');
                if (sendBtn) sendBtn.disabled = false;
            }
        };

        try {
            _voiceRecognition.start();
            recordEzraVoiceTelemetry('start_requested');
        } catch (error) {
            recordEzraVoiceTelemetry('start_failed', { message: error?.message || 'unknown_error' });
            stopVoiceInput();
            if (typeof showToast === 'function') {
                showToast('Could not start voice input. Please check microphone permissions.', 'error');
            }
        }
    }

    function stopVoiceInput() {
        _isRecording = false;
        if (_voiceRecognition) {
            try { _voiceRecognition.stop(); } catch (e) { }
            _voiceRecognition = null;
        }
        const voiceBtn = document.getElementById('ezra-voice');
        const input = document.getElementById('ezra-input');
        if (voiceBtn) {
            voiceBtn.classList.remove('recording');
            voiceBtn.style.animation = ''; // Clear mobile pulse animation
        }
        if (input) input.placeholder = EZRA_CONFIG.placeholderText;
        
        // Clear any pending silence timer
        if (window._silenceTimer) {
            clearTimeout(window._silenceTimer);
            window._silenceTimer = null;
        }

        syncEzraVoiceButtonState();
    }

    // ============================================
    // VOICE-TO-QUOTE - Auto-fill from voice dictation
    // ============================================
    function initVoiceToQuote() {
        // Add special voice command handler
        const originalOnResult = _voiceRecognition?.onresult;
        
        window.processVoiceToQuote = function(transcript) {
            const lower = transcript.toLowerCase();
            
            // Check if this is a "create quote" command
            const isQuoteCommand = /create quote|new quote|build quote|start quote|client|borrower/i.test(lower);
            
            if (!isQuoteCommand) return false;
            
            // Parse the dictation
            const parsed = parseVoiceQuoteCommand(transcript);
            
            if (parsed.hasData) {
                // Show confirmation before auto-filling
                showVoiceQuoteConfirmation(parsed);
                return true;
            }
            
            return false;
        };
    }

    function parseVoiceQuoteCommand(transcript) {
        const result = {
            hasData: false,
            clientName: null,
            creditScore: null,
            homeValue: 0,
            mortgageBalance: 0,
            helocAmount: 0,
            occupancy: 'Primary Residence',
            raw: transcript
        };
        
        // Parse name - handles various patterns
        const namePatterns = [
            /client\s+(?:is\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
            /borrower\s+(?:is\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
            /for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
            /name\s+(?:is\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
        ];
        
        for (const pattern of namePatterns) {
            const match = transcript.match(pattern);
            if (match) {
                result.clientName = match[1];
                break;
            }
        }
        
        // Parse dollar amounts with context
        // Property value patterns
        const propMatch = transcript.match(/\$?([\d,.]+)\s*(k|K|m|M)?\s*(?:property|home|house|value|worth)/i);
        if (propMatch) {
            result.homeValue = parseAmount(propMatch[1], propMatch[2]);
        }
        
        // Mortgage balance patterns
        const mortPatterns = [
            /(?:mortgage|owe|balance|1st)\s+(?:is\s+)?\$?([\d,.]+)\s*(k|K|m|M)?/i,
            /\$?([\d,.]+)\s*(k|K|m|M)?\s*(?:mortgage|owe|balance)/i
        ];
        for (const pattern of mortPatterns) {
            const match = transcript.match(pattern);
            if (match) {
                result.mortgageBalance = parseAmount(match[1], match[2]);
                break;
            }
        }
        
        // Handle "paid off", "no mortgage", "free and clear" scenarios
        if (/paid\s*off|no\s*mortgage|free\s+and\s+clear|no\s+balance|zero\s+balance|home\s+is\s+paid/i.test(transcript)) {
            result.mortgageBalance = 0;
        }
        
        // HELOC/cash amount patterns
        const cashPatterns = [
            /(?:wants?|needs?|looking for|requesting|cash|equity|heloc|draw)\s+(?:of\s+)?\$?([\d,.]+)\s*(k|K|m|M)?/i,
            /\$?([\d,.]+)\s*(k|K|m|M)?\s*(?:cash|equity|heloc|draw)/i
        ];
        for (const pattern of cashPatterns) {
            const match = transcript.match(pattern);
            if (match) {
                result.helocAmount = parseAmount(match[1], match[2]);
                break;
            }
        }
        
        // Credit score
        const scoreMatch = transcript.match(/(\d{3})\s*(?:score|credit|fico)/i);
        if (scoreMatch) {
            result.creditScore = scoreMatch[1];
        }
        
        // Occupancy
        if (/investment/i.test(transcript)) {
            result.occupancy = 'Investment Property';
        } else if (/second home|vacation/i.test(transcript)) {
            result.occupancy = 'Second Home';
        }
        
        result.hasData = result.clientName || result.homeValue > 0 || result.helocAmount > 0;
        return result;
    }

    function parseAmount(numberStr, suffix) {
        let val = parseFloat(numberStr.replace(/,/g, ''));
        if (suffix) {
            if (suffix.toLowerCase() === 'k') val *= 1000;
            if (suffix.toLowerCase() === 'm') val *= 1000000;
        }
        return val;
    }

    function showVoiceQuoteConfirmation(parsed) {
        const summary = [];
        if (parsed.clientName) summary.push(`<strong>Client:</strong> ${parsed.clientName}`);
        if (parsed.homeValue) summary.push(`<strong>Property Value:</strong> $${parsed.homeValue.toLocaleString()}`);
        if (parsed.mortgageBalance) summary.push(`<strong>Mortgage Balance:</strong> $${parsed.mortgageBalance.toLocaleString()}`);
        if (parsed.helocAmount) summary.push(`<strong>HELOC Amount:</strong> $${parsed.helocAmount.toLocaleString()}`);
        if (parsed.creditScore) summary.push(`<strong>Credit Score:</strong> ${parsed.creditScore}`);
        
        addMessage('assistant', `
\ud83c\udfa4 **Voice Quote Detected**

I heard:
${summary.join('\n')}

Would you like me to fill in the quote form with these details?`, { model: 'local' });

        // Add quick action buttons
        setTimeout(() => {
            const btnDiv = document.createElement('div');
            btnDiv.style.cssText = 'padding:4px 12px 12px;text-align:center;';
            btnDiv.innerHTML = `
                <button onclick="window.applyVoiceQuoteData()" style="background:linear-gradient(135deg,#c5a059,#a68543);color:#0f172a;border:none;padding:10px 20px;border-radius:8px;font-weight:700;cursor:pointer;margin-right:8px;">\u2705 Yes, Fill Form</button>
                <button onclick="window.discardVoiceQuote()" style="background:rgba(255,255,255,0.1);color:white;border:none;padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer;">\u274c No, Cancel</button>
            `;
            document.getElementById('ezra-messages').appendChild(btnDiv);
            document.getElementById('ezra-messages').scrollTop = document.getElementById('ezra-messages').scrollHeight;
        }, 100);
        
        // Store for later application
        window._pendingVoiceQuote = parsed;
    }

    window.applyVoiceQuoteData = function() {
        const data = window._pendingVoiceQuote;
        if (!data) return;
        
        function setField(id, value) {
            const field = document.getElementById(id);
            if (!field || !value) return;
            field.value = value;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            field.style.transition = 'background 0.3s';
            field.style.background = '#dcfce7';
            setTimeout(() => field.style.background = '', 1500);
        }
        
        if (data.clientName) setField('in-client-name', data.clientName);
        if (data.creditScore) setField('in-client-credit', data.creditScore);
        if (data.homeValue) setField('in-home-value', data.homeValue);
        if (data.mortgageBalance) setField('in-mortgage-balance', data.mortgageBalance);
        if (data.helocAmount) setField('in-net-cash', data.helocAmount);
        if (data.occupancy) setField('in-property-type', data.occupancy);
        
        // Trigger calculations
        if (typeof updateQuote === 'function') setTimeout(updateQuote, 100);
        if (typeof autoSave === 'function') setTimeout(autoSave, 300);
        
        addMessage('assistant', '\u2705 **Quote form filled!** I\'ve populated the fields with the details you dictated. You can now add rates or generate the client link.', { model: 'local' });
        
        window._pendingVoiceQuote = null;
    };

    window.discardVoiceQuote = function() {
        window._pendingVoiceQuote = null;
        addMessage('assistant', 'Quote data discarded. What would you like to do instead?', { model: 'local' });
    };

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
        const attachment = EzraState.pendingAttachment;

        if ((!message && !attachment) || EzraState.isTyping) return;

        // Upsell mode: always return promotional response
        if (EzraState._upsellMode) {
            input.value = '';
            input.style.height = 'auto';
            addMessage('user', message || 'Tell me more');
            showTypingIndicator();
            await new Promise(r => setTimeout(r, 600));
            hideTypingIndicator();
            addMessage('assistant', getUpsellResponse(), { model: 'local', intent: 'upsell' });
            return;
        }

        // Clear input and attachment
        input.value = '';
        input.style.height = 'auto';
        document.getElementById('ezra-send').disabled = true;
        clearAttachment();

        // Add user message (with image preview if attached)
        const displayMsg = attachment
            ? `<img src="${attachment.previewUrl}" class="ezra-msg-image" alt="${attachment.file.name}">\n${message || 'Analyze this document.'}`
            : message;
        addMessage('user', displayMsg);

        // Check if we're in onboarding mode
        if (EzraState.onboardingStep && EzraState.onboardingStep > 0) {
            showTypingIndicator();
            const onboardingResponse = processOnboardingStep(message);
            hideTypingIndicator();
            if (onboardingResponse) {
                addMessage('assistant', onboardingResponse, { model: 'local' });
                return;
            }
        }

        // Show typing indicator
        showTypingIndicator();

        try {
            let response;

            if (attachment) {
                // Document/image analysis via vision API
                const userMsg = message || 'Analyze this document and describe what you see. If it is an ID or driver\'s license, check if the image quality is good enough for verification.';
                const visionResult = await callAIVisionProxy(attachment.base64, attachment.mimeType, userMsg, 'document_analysis');
                if (visionResult && visionResult.text) {
                    response = {
                        content: visionResult.text,
                        metadata: { model: visionResult.provider, intent: 'document_analysis' }
                    };
                } else {
                    response = { content: 'I wasn\'t able to analyze that document. Please try a different image or check the file format.', metadata: { model: 'error', intent: 'document_analysis' } };
                }
            } else {
                // Normal text routing
                response = await routeToAI(message);
            }

            // Hide typing indicator
            hideTypingIndicator();

            // Some handlers (portal paste with tier buttons) handle their own messaging
            // and return null — skip the rest in that case
            if (!response) {
                saveMessageToSupabase('user', message);
                return;
            }

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

    // Handle document upload button click
    function handleDocUpload() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/jpeg,image/png,image/webp,application/pdf';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            document.body.removeChild(fileInput);
            if (!file) return;

            // Validate size (5MB max)
            if (file.size > 5 * 1024 * 1024) {
                addMessage('assistant', 'File is too large. Maximum size is 5MB.', { model: 'local' });
                return;
            }

            // Validate MIME type
            const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
            if (!allowedTypes.includes(file.type)) {
                addMessage('assistant', 'Unsupported file type. Please upload a JPEG, PNG, WebP, or PDF.', { model: 'local' });
                return;
            }

            // Convert to base64
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result;
                const base64 = dataUrl.split(',')[1];

                EzraState.pendingAttachment = {
                    file,
                    base64,
                    mimeType: file.type,
                    previewUrl: file.type.startsWith('image/') ? dataUrl : ''
                };

                // Show preview
                const preview = document.getElementById('ezra-attachment-preview');
                const thumb = document.getElementById('ezra-attachment-thumb');
                const name = document.getElementById('ezra-attachment-name');

                if (file.type.startsWith('image/')) {
                    thumb.src = dataUrl;
                    thumb.style.display = 'block';
                } else {
                    thumb.src = '';
                    thumb.style.display = 'none';
                }
                name.textContent = file.name;
                preview.style.display = 'flex';

                // Enable send button
                document.getElementById('ezra-send').disabled = false;
                document.getElementById('ezra-input').focus();
            };
            reader.readAsDataURL(file);
        });

        fileInput.click();
    }

    // Clear pending attachment
    function clearAttachment() {
        EzraState.pendingAttachment = null;
        const preview = document.getElementById('ezra-attachment-preview');
        if (preview) preview.style.display = 'none';
    }

    // ============================================
    // RATE SHEET UPLOAD + PRE-PRICING ENGINE
    // ============================================

    // Trigger file picker for rate sheet upload
    function handleRateSheetUpload() {
        addMessage('assistant', '**Rate Sheet Upload**\n\nUpload a lender rate sheet (PDF or image) and I\'ll extract the pricing grid for auto-pricing.\n\nSupported formats: PDF, JPEG, PNG, WebP (max 5MB)', { model: 'local' });

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/jpeg,image/png,image/webp,application/pdf';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            document.body.removeChild(fileInput);
            if (!file) return;

            if (file.size > 5 * 1024 * 1024) {
                addMessage('assistant', 'File too large. Max 5MB.', { model: 'local' });
                return;
            }

            addMessage('user', `Uploading rate sheet: ${file.name}`);
            showTypingIndicator();

            try {
                const reader = new FileReader();
                const dataUrl = await new Promise((resolve, reject) => {
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                const base64 = dataUrl.split(',')[1];
                const matrix = await parseRateSheet(base64, file.type, file.name);
                hideTypingIndicator();

                if (matrix) {
                    EzraState.rateSheetMatrix = matrix;
                    // Save to user_integrations
                    await saveRateSheetMatrix(matrix);

                    // Build confirmation message
                    const ficoRanges = Object.keys(matrix.baseRates || {});
                    const cltvRanges = ficoRanges.length > 0 ? Object.keys(matrix.baseRates[ficoRanges[0]] || {}) : [];
                    const termCount = Object.keys(matrix.termAdj || {}).length;

                    addMessage('assistant',
                        `**Rate Sheet Parsed Successfully!**\n\n` +
                        `**FICO Ranges:** ${ficoRanges.join(', ')}\n` +
                        `**CLTV Ranges:** ${cltvRanges.join(', ')}\n` +
                        `**Term Adjustments:** ${termCount} terms\n` +
                        (matrix.stateAdj ? `**State Adjustments:** ${Object.keys(matrix.stateAdj).length} states\n` : '') +
                        (matrix.autopayDiscount ? `**Autopay Discount:** ${matrix.autopayDiscount}%\n` : '') +
                        `\nThe rate sheet is saved. You can now use **auto-pricing** in Settings → AI → Rate Sheet Pre-Pricing, or say **"price this out"** to fill rates from the sheet.`,
                        { model: 'local', intent: 'rate_sheet_parse' }
                    );
                } else {
                    addMessage('assistant', 'I wasn\'t able to parse the rate sheet. Please try a clearer image or a different format.', { model: 'local' });
                }
            } catch (err) {
                hideTypingIndicator();
                console.error('Rate sheet parse error:', err);
                addMessage('assistant', `Error parsing rate sheet: ${err.message}`, { model: 'local' });
            }
        });

        fileInput.click();
    }

    // Parse rate sheet via AI vision
    async function parseRateSheet(imageBase64, mimeType, fileName) {
        const extractionPrompt = `You are a mortgage rate sheet parser. Extract the pricing grid from this lender rate sheet document.

Return ONLY a valid JSON object (no markdown, no explanation) with this exact structure:
{
  "baseRates": {
    "780+": { "0-50": 4.99, "50-60": 5.24, "60-70": 5.49, "70-80": 5.99 },
    "760-779": { "0-50": 5.24, "50-60": 5.49, "60-70": 5.74, "70-80": 6.24 },
    "740-759": { ... },
    "720-739": { ... },
    "700-719": { ... },
    "680-699": { ... }
  },
  "termAdj": { "5": -0.50, "10": -0.25, "15": 0.00, "20": 0.25, "30": 0.50 },
  "oFeeAdj": { "0": 1.50, "1": 0.75, "2": 0.00, "3": -0.50, "4": -0.75, "5": -1.00 },
  "stateAdj": { "TX": 0.25, "NY": 0.00 },
  "occupancyAdj": { "primary": 0.00, "secondary": 0.50, "investment": 1.00 },
  "autopayDiscount": 0.25,
  "baseTerm": "30",
  "baseOFee": "2"
}

Rules:
- baseRates keys are FICO ranges, values are objects with CLTV range keys and rate values
- termAdj: adjustment relative to the base term (positive = higher rate for longer terms)
- oFeeAdj: adjustment based on origination fee percentage
- If a field isn't in the document, omit it from the JSON
- Use the EXACT numbers from the document
- FICO ranges should be strings like "780+", "760-779"
- CLTV ranges should be strings like "0-50", "50-60"
- All rate values should be numbers (not strings)

File name: ${fileName}`;

        const result = await callAIVisionProxy(imageBase64, mimeType, extractionPrompt, 'rate_sheet_parse');
        if (!result || !result.text) return null;

        // Strip markdown fences if present
        let jsonStr = result.text.trim();
        jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

        try {
            const matrix = JSON.parse(jsonStr);
            // Basic validation
            if (!matrix.baseRates || typeof matrix.baseRates !== 'object') return null;
            return matrix;
        } catch (e) {
            console.error('Rate sheet JSON parse error:', e, jsonStr.substring(0, 200));
            return null;
        }
    }

    // Save rate sheet matrix to user_integrations
    async function saveRateSheetMatrix(matrix) {
        if (!EzraState.supabase) return;
        const session = await EzraState.supabase.auth.getSession();
        const userId = session?.data?.session?.user?.id;
        if (!userId) return;

        // Upsert into heloc_settings
        const { data: existing } = await EzraState.supabase
            .from('user_integrations')
            .select('id, metadata')
            .eq('user_id', userId)
            .eq('provider', 'heloc_settings')
            .maybeSingle();

        const metadata = existing?.metadata || {};
        metadata.rateSheetMatrix = matrix;
        metadata.rateSheetUpdatedAt = new Date().toISOString();

        if (existing) {
            await EzraState.supabase.from('user_integrations')
                .update({ metadata })
                .eq('id', existing.id);
        } else {
            await EzraState.supabase.from('user_integrations')
                .insert({ user_id: userId, provider: 'heloc_settings', metadata });
        }
    }

    // Calculate rate from the parsed matrix — pure local, zero API cost
    function calculateRateFromMatrix(matrix, fico, cltv, term, oFee) {
        if (!matrix || !matrix.baseRates) return null;

        // Find matching FICO range
        const ficoRange = findFicoRange(Object.keys(matrix.baseRates), fico);
        if (!ficoRange) return null;

        // Find matching CLTV range
        const cltvRanges = Object.keys(matrix.baseRates[ficoRange] || {});
        const cltvRange = findCltvRange(cltvRanges, cltv);
        if (!cltvRange) return null;

        let rate = matrix.baseRates[ficoRange][cltvRange];
        if (typeof rate !== 'number') return null;

        // Apply term adjustment
        if (matrix.termAdj && matrix.termAdj[String(term)] !== undefined) {
            rate += matrix.termAdj[String(term)];
        }

        // Apply origination fee adjustment
        if (matrix.oFeeAdj && matrix.oFeeAdj[String(oFee)] !== undefined) {
            rate += matrix.oFeeAdj[String(oFee)];
        }

        // Apply autopay discount if enabled
        if (matrix.autopayDiscount) {
            rate -= matrix.autopayDiscount;
        }

        return Math.max(0, parseFloat(rate.toFixed(3)));
    }

    function findFicoRange(ranges, fico) {
        // Sort ranges by lower bound descending
        const sorted = ranges.slice().sort((a, b) => {
            const aLow = parseInt(a.replace('+', ''));
            const bLow = parseInt(b.replace('+', ''));
            return bLow - aLow;
        });

        for (const range of sorted) {
            if (range.includes('+')) {
                const min = parseInt(range);
                if (fico >= min) return range;
            } else {
                const parts = range.split('-').map(Number);
                if (parts.length === 2 && fico >= parts[0] && fico <= parts[1]) return range;
            }
        }
        // Fall back to lowest range
        return sorted[sorted.length - 1] || null;
    }

    function findCltvRange(ranges, cltv) {
        for (const range of ranges) {
            const parts = range.split('-').map(Number);
            if (parts.length === 2) {
                if (cltv >= parts[0] && cltv < parts[1]) return range;
                // Handle "70-80" where 80 is inclusive upper bound
                if (cltv === parts[1] && parts[1] >= 80) return range;
            }
        }
        // Fall back to highest range
        const sorted = ranges.slice().sort((a, b) => parseInt(b.split('-')[0]) - parseInt(a.split('-')[0]));
        return sorted[0] || null;
    }

    // Auto-fill rate dropdowns from the parsed matrix
    function autoFillRatesFromMatrix() {
        const matrix = EzraState.rateSheetMatrix;
        if (!matrix) return;

        const fico = parseFloat(document.getElementById('in-client-credit')?.value) || 0;
        if (fico < 600) return; // Need valid FICO

        const homeValue = parseFloat(document.getElementById('in-home-value')?.value?.replace(/,/g, '')) || 0;
        const mortBalance = parseFloat(document.getElementById('in-mortgage-balance')?.value?.replace(/,/g, '')) || 0;
        const helocAmt = parseFloat(document.getElementById('in-net-cash')?.value?.replace(/,/g, '')) || 0;
        if (homeValue <= 0) return;

        const cltv = ((mortBalance + helocAmt) / homeValue) * 100;

        // Enable manual rates
        const toggle = document.getElementById('toggle-manual-rates');
        if (toggle && !toggle.classList.contains('active')) toggle.click();

        let filledCount = 0;
        const terms = [5, 10, 15, 20, 30];
        const tiers = ['t1', 't2', 't3'];

        for (const tier of tiers) {
            const origEl = document.getElementById(tier + '-orig');
            const oFee = parseFloat(origEl?.value) || 2;

            for (const term of terms) {
                const rate = calculateRateFromMatrix(matrix, fico, cltv, term, oFee);
                if (rate !== null && rate > 0) {
                    const baseId = `${tier}-${term}-rate`;
                    const manualEl = document.getElementById(baseId + '-manual');
                    if (manualEl) {
                        manualEl.value = rate.toFixed(2);
                        manualEl.style.display = 'block';
                        manualEl.dispatchEvent(new Event('input', { bubbles: true }));
                        filledCount++;
                        // Green flash
                        manualEl.style.transition = 'background 0.3s';
                        manualEl.style.background = '#dcfce7';
                        setTimeout(() => manualEl.style.background = '', 1500);
                    }
                    const selectEl = document.getElementById(baseId);
                    if (selectEl) selectEl.style.display = 'none';
                }
            }
        }

        if (filledCount > 0 && typeof updateQuote === 'function') {
            setTimeout(updateQuote, 100);
        }
        return filledCount;
    }

    // Load saved rate sheet matrix on init
    async function loadSavedRateSheet() {
        if (!EzraState.supabase) return;
        try {
            const session = await EzraState.supabase.auth.getSession();
            const userId = session?.data?.session?.user?.id;
            if (!userId) return;

            const { data } = await EzraState.supabase
                .from('user_integrations')
                .select('metadata')
                .eq('user_id', userId)
                .eq('provider', 'heloc_settings')
                .maybeSingle();

            if (data?.metadata?.rateSheetMatrix) {
                EzraState.rateSheetMatrix = data.metadata.rateSheetMatrix;
                EzraState.autoPrePrice = data.metadata.autoPrePrice || false;
                console.debug('Ezra: Rate sheet matrix loaded from DB');
            }
        } catch (e) {
            console.warn('Ezra: Failed to load rate sheet:', e);
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

    // Scroll quick commands left/right
    window.scrollQuickCommands = function(direction) {
        const container = document.getElementById('ezra-quick-commands');
        if (!container) return;
        
        const scrollAmount = 200;
        const currentScroll = container.scrollLeft;
        const maxScroll = container.scrollWidth - container.clientWidth;
        
        if (direction === 'left') {
            container.scrollTo({ left: Math.max(0, currentScroll - scrollAmount), behavior: 'smooth' });
        } else {
            container.scrollTo({ left: Math.min(maxScroll, currentScroll + scrollAmount), behavior: 'smooth' });
        }
        
        // Update button visibility after scroll
        setTimeout(updateScrollButtons, 300);
    };

    // Update scroll button visibility based on scroll position
    function updateScrollButtons() {
        const container = document.getElementById('ezra-quick-commands');
        if (!container) return;
        
        const leftBtn = document.querySelector('.ezra-scroll-left');
        const rightBtn = document.querySelector('.ezra-scroll-right');
        
        if (leftBtn) {
            leftBtn.classList.toggle('hidden', container.scrollLeft <= 5);
        }
        if (rightBtn) {
            const maxScroll = container.scrollWidth - container.clientWidth;
            rightBtn.classList.toggle('hidden', container.scrollLeft >= maxScroll - 5);
        }
    }

    // Initialize scroll button visibility
    setTimeout(updateScrollButtons, 100);

    // Update on scroll and setup touch swipe
    document.addEventListener('DOMContentLoaded', function() {
        const container = document.getElementById('ezra-quick-commands');
        if (container) {
            container.addEventListener('scroll', updateScrollButtons, { passive: true });
            
            // Touch swipe support for mobile
            let touchStartX = 0;
            let touchEndX = 0;
            
            container.addEventListener('touchstart', function(e) {
                touchStartX = e.changedTouches[0].screenX;
            }, { passive: true });
            
            container.addEventListener('touchend', function(e) {
                touchEndX = e.changedTouches[0].screenX;
                handleSwipe();
            }, { passive: true });
            
            function handleSwipe() {
                const swipeThreshold = 50;
                const diff = touchStartX - touchEndX;
                
                if (Math.abs(diff) > swipeThreshold) {
                    if (diff > 0) {
                        // Swiped left - scroll right
                        scrollQuickCommands('right');
                    } else {
                        // Swiped right - scroll left
                        scrollQuickCommands('left');
                    }
                }
            }
        }
    });

    function handleQuickCommand(action) {
        if (action === 'deal_radar') {
            showDealRadar();
            return;
        }

        // Lead briefing — runs directly (async, fetches from DB)
        if (action === 'lead_briefing') {
            runLeadBriefing();
            return;
        }

        // Compliance check — opens inline prompt for message text
        if (action === 'compliance_check') {
            const input = document.getElementById('ezra-input');
            input.value = '';
            input.placeholder = 'Paste the message you want to compliance-check...';
            input.focus();
            addMessage('assistant', '**Compliance Guardrails**\n\nPaste the SMS or email text you want me to review. I\'ll check for TILA/RESPA red flags, missing disclosures, and risky language before you send it.');
            // Set a flag so the next message gets routed to compliance
            EzraState._pendingComplianceCheck = true;
            return;
        }

        // Handle Quick Quote Wizard
        if (action === 'quick_quote_wizard') {
            window.ezraStartOnboarding();
            return;
        }

        // Upload Rate Sheet — trigger file picker for rate sheet PDF/image
        if (action === 'upload_rate_sheet') {
            handleRateSheetUpload();
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
        // Compliance check intercept — if user just pasted text to review
        if (EzraState._pendingComplianceCheck) {
            EzraState._pendingComplianceCheck = false;
            // Reset placeholder
            const input = document.getElementById('ezra-input');
            if (input) input.placeholder = EZRA_CONFIG.placeholderText;
            return {
                content: runComplianceCheck(message),
                metadata: { model: 'local', intent: 'compliance_check' }
            };
        }

        // Check for pasted lender portal data FIRST (Figure, etc.) — most specific
        const portalData = parseLenderPortalData(message);
        if (portalData) {
            showTypingIndicator();
            await new Promise(r => setTimeout(r, 400));
            hideTypingIndicator();

            const hasUnassignedRates = Object.keys(portalData.unassignedFixed || {}).length > 0
                || Object.keys(portalData.unassignedVariable || {}).length > 0;

            // --- First paste: initialize accumulator ---
            if (!_accumulatedPortalData) {
                snapshotForm();
                _accumulatedPortalData = {
                    cashAmount: portalData.cashAmount,
                    initialDrawAmount: portalData.initialDrawAmount,
                    totalLoanAmount: portalData.totalLoanAmount,
                    mortgagePayoff: portalData.mortgagePayoff,
                    hasVariableRates: portalData.hasVariableRates,
                    tiers: portalData.tiers.map(t => ({ ...t, fixed: { ...t.fixed }, variable: { ...t.variable } }))
                };
            } else {
                // Update summary values
                if (portalData.cashAmount) _accumulatedPortalData.cashAmount = portalData.cashAmount;
                if (portalData.initialDrawAmount) _accumulatedPortalData.initialDrawAmount = portalData.initialDrawAmount;
                if (portalData.totalLoanAmount) _accumulatedPortalData.totalLoanAmount = portalData.totalLoanAmount;
                if (portalData.mortgagePayoff) _accumulatedPortalData.mortgagePayoff = portalData.mortgagePayoff;
                if (portalData.hasVariableRates) _accumulatedPortalData.hasVariableRates = true;
            }

            // Apply origination fees to form (always safe — these don't change between pastes)
            applyAccumulatedToForm();

            // Summary values
            const merged = _accumulatedPortalData;
            const cashStr = merged.cashAmount ? `**Cash to Borrower:** $${merged.cashAmount.toLocaleString()}` : '';
            const drawStr = merged.initialDrawAmount ? `**Initial Draw:** $${merged.initialDrawAmount.toLocaleString()}` : '';
            const totalStr = merged.totalLoanAmount ? `**Total Loan Amount:** $${merged.totalLoanAmount.toLocaleString()}` : '';
            const payoffStr = merged.mortgagePayoff ? `**Payoff/Closing Costs:** $${merged.mortgagePayoff.toLocaleString()}` : '';
            const summaryParts = [cashStr, drawStr, totalStr, payoffStr].filter(Boolean).join('\n');

            // Rate summary for display
            const ratePreview = Object.entries(portalData.unassignedFixed || {})
                .sort((a, b) => parseInt(b[0]) - parseInt(a[0]))
                .map(([term, rate]) => `${term}yr @ ${rate}%`).join(', ');

            if (hasUnassignedRates && merged.tiers.length > 1) {
                // Multiple origination fees — need to ask which tier these rates belong to
                const tiersWithoutRates = merged.tiers.filter(t => Object.keys(t.fixed).length === 0);

                // Store pending rates
                _pendingPortalRates = {
                    fixed: { ...portalData.unassignedFixed },
                    variable: { ...portalData.unassignedVariable }
                };

                // If only one tier is empty, auto-assign to it
                if (tiersWithoutRates.length === 1) {
                    const autoTier = tiersWithoutRates[0];
                    Object.assign(autoTier.fixed, _pendingPortalRates.fixed);
                    Object.assign(autoTier.variable, _pendingPortalRates.variable);
                    _pendingPortalRates = null;
                    applyAccumulatedToForm();

                    // Check if all tiers done
                    const allDone = merged.tiers.every(t => Object.keys(t.fixed).length > 0);
                    const tierLines = merged.tiers.map(t => {
                        const fixedStr = Object.entries(t.fixed).map(([term, rate]) => `${term}yr @ ${rate}%`).join(', ');
                        const feeStr = t.origAmount ? `, $${t.origAmount.toLocaleString()} fee` : '';
                        return `**Tier ${t.tierNum}** (${t.origPct}% orig${feeStr}): ${fixedStr}`;
                    }).join('\n');

                    if (allDone) {
                        _accumulatedPortalData = null;
                        return {
                            content: `**All 3 tiers complete!**\n\n${summaryParts ? summaryParts + '\n\n' : ''}${tierLines}\n\nAll rates populated. Say **"undo"** to revert.`,
                            metadata: { model: 'local', intent: 'portal_import' }
                        };
                    }
                }

                // Show current status
                const tierLines = merged.tiers.map(t => {
                    const fixedStr = Object.entries(t.fixed).map(([term, rate]) => `${term}yr @ ${rate}%`).join(', ');
                    const feeStr = t.origAmount ? `, $${t.origAmount.toLocaleString()} fee` : '';
                    const hasRates = Object.keys(t.fixed).length > 0;
                    return hasRates
                        ? `**Tier ${t.tierNum}** (${t.origPct}% orig${feeStr}): ${fixedStr}`
                        : `**Tier ${t.tierNum}** (${t.origPct}% orig${feeStr}): *waiting*`;
                }).join('\n');

                // Build message with tier selection buttons
                const btnStyle = 'display:inline-block;padding:8px 16px;margin:4px;border-radius:8px;font-family:var(--font-heading,sans-serif);font-size:12px;font-weight:700;cursor:pointer;border:none;transition:transform 0.15s;';
                const availableTiers = _pendingPortalRates ? tiersWithoutRates : [];
                const buttons = availableTiers.map(t => {
                    const color = t.tierNum === 1 ? '#10b981' : t.tierNum === 2 ? '#3b82f6' : '#a78bfa';
                    return `<button style="${btnStyle}background:${color};color:white;" onclick="window._ezraAssignRatesToTier(${t.origPct})" onmouseenter="this.style.transform='scale(1.05)'" onmouseleave="this.style.transform=''">${t.origPct}% Origination</button>`;
                }).join('');

                addMessage('assistant', `**Figure Portal Data Detected**\n\n${summaryParts ? summaryParts + '\n\n' : ''}**Rates found:** ${ratePreview}\n\n${tierLines}\n\n**Which origination fee were these rates for?**`, { model: 'local' });

                // Add buttons after the message
                if (buttons) {
                    const btnDiv = document.createElement('div');
                    btnDiv.id = 'ezra-tier-select-btns';
                    btnDiv.style.cssText = 'padding:4px 12px 12px;text-align:center;';
                    btnDiv.innerHTML = buttons;
                    document.getElementById('ezra-messages').appendChild(btnDiv);
                    document.getElementById('ezra-messages').scrollTop = document.getElementById('ezra-messages').scrollHeight;
                }

                return null; // Already handled via addMessage + buttons
            }

            // Single tier or no origination fees — auto-assign
            if (hasUnassignedRates) {
                const targetTier = merged.tiers[0]; // Only tier
                Object.assign(targetTier.fixed, portalData.unassignedFixed);
                Object.assign(targetTier.variable, portalData.unassignedVariable);
                applyAccumulatedToForm();
            }

            const tierLines = merged.tiers.map(t => {
                const fixedStr = Object.entries(t.fixed).map(([term, rate]) => `${term}yr @ ${rate}%`).join(', ');
                return `**Tier ${t.tierNum}** (${t.origPct}% orig): ${fixedStr}`;
            }).join('\n');

            _accumulatedPortalData = null;
            return {
                content: `**Figure Portal Data Imported**\n\n${summaryParts ? summaryParts + '\n\n' : ''}${tierLines}\n\nAll rates populated. Say **"undo"** to revert.`,
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

        // ── INTENT TIER GATING — check if user has access to this feature ──
        const requiredLevel = INTENT_TIER_MAP[intent];
        if (requiredLevel !== undefined && window.currentUserRole !== 'super_admin') {
            const currentLevel = TIER_LEVELS[(EzraState.userTier || 'carbon').toLowerCase()] || 0;
            if (currentLevel < requiredLevel) {
                return { content: getIntentUpgradeMessage(intent), metadata: { model: 'local', intent: 'tier_gate' } };
            }
        }

        // ── LOCAL-ONLY INTELLIGENCE FEATURES (no API cost) ──
        const ctx = getFormContext();
        const localIntents = {
            quote_narrator: () => narrateQuote(ctx),
            draft_message: () => generateMessageDrafts(ctx),
            scenario_comparison: () => compareScenarios(ctx),
            question_predictor: () => predictClientQuestions(ctx),
            compliance_check: () => runComplianceCheck(message)
        };

        if (localIntents[intent]) {
            return { content: localIntents[intent](), metadata: { model: 'local', intent } };
        }

        // Follow-up coach and lead briefing are async (DB queries)
        if (intent === 'followup_coach') {
            const coachResult = await getFollowUpCoach();
            return { content: coachResult, metadata: { model: 'local', intent } };
        }
        if (intent === 'lead_briefing') {
            // Lead briefing handles its own messaging
            await runLeadBriefing();
            return null;
        }

        // Smart objection responses — use local when intent matches, enrich with quote data
        if (intent === 'objection_handling') {
            const objCtx = parseMessageContext(message, ctx);
            return { content: getSmartObjectionResponse(message, objCtx), metadata: { model: 'local', intent } };
        }

        // ── "Price this out" — auto-fill from rate sheet matrix (zero API cost) ──
        if (/price\s*(this|it)\s*out|auto.?price|fill.*rates.*sheet|pre.?price/i.test(message)) {
            if (EzraState.rateSheetMatrix) {
                const filled = autoFillRatesFromMatrix();
                if (filled > 0) {
                    return { content: `**Rate sheet auto-pricing applied!**\n\nFilled ${filled} rate fields from the uploaded rate sheet. All rates based on the current FICO, CLTV, origination fees, and term.`, metadata: { model: 'local', intent: 'rate_sheet_price' } };
                } else {
                    return { content: 'Couldn\'t auto-price — make sure FICO and home value are filled in.', metadata: { model: 'local', intent: 'rate_sheet_price' } };
                }
            } else {
                return { content: 'No rate sheet uploaded yet. Use the **Upload Rate Sheet** quick command or go to Settings → AI → Rate Sheet Pre-Pricing.', metadata: { model: 'local', intent: 'rate_sheet_price' } };
            }
        }

        // ── KB-FIRST: Try local knowledge base before any AI call ──
        const kbResults = EZRA_KNOWLEDGE.searchLocalKB(message);
        if (kbResults) {
            // Parse KB results — if top match score is high enough, use directly
            const kbLines = kbResults.split('\n').filter(l => l.trim());
            const scoreMatch = kbLines[0]?.match(/\(score:\s*([\d.]+)\)/);
            const topScore = scoreMatch ? parseFloat(scoreMatch[1]) : 0;
            if (topScore >= 0.55) {
                // KB match — respond without AI (saves API cost)
                let kbContent = kbLines.map(l => l.replace(/\(score:.*?\)/g, '').trim()).join('\n\n');
                // Lower-confidence matches get a follow-up prompt so users can dig deeper
                if (topScore < 0.7) {
                    kbContent += '\n\n*Need more detail? Just ask and I\'ll dig deeper.*';
                }
                return { content: kbContent, metadata: { model: 'local-kb', intent: intent || 'kb_match', score: topScore } };
            }
        }

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
            metadata: { model: response.metadata?.provider || model, intent },
            autoFillFields: response.autoFillFields,
            usage: response.usage
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
        const tierTableId = (value) => {
            const normalized = String(value || '').toLowerCase().replace(/^tier\s*/, '');
            if (normalized === '1' || normalized === 't1') return 't1';
            if (normalized === '2' || normalized === 't2') return 't2';
            if (normalized === '3' || normalized === 't3') return 't3';
            return 't2';
        };
        const tierSelectValue = (value) => tierTableId(value).replace('t', '');

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
                tier: tierTableId(document.getElementById('rec-tier-select')?.value || '2')
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
                if (sel) { sel.value = tierSelectValue(cmd.tier); sel.dispatchEvent(new Event('change', { bubbles: true })); }
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
                if (tierSel) { tierSel.value = tierSelectValue(cmd.tier); tierSel.dispatchEvent(new Event('change', { bubbles: true })); }
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
                const currentTier = tierTableId(document.getElementById('rec-tier-select')?.value || '2');
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
                    if (sel) { sel.value = '1'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
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
        // Objection handling (smart — context-aware)
        if (/objection|handle|respond|concern|pushback|too high|too expensive|not sure|hesitat/i.test(lower)) {
            return 'objection_handling';
        }
        // Quote narrator — plain English summary
        if (/narrate|narrator|plain english|explain.*quote|summarize.*quote|summary.*quote|break.*down.*quote/i.test(lower)) {
            return 'quote_narrator';
        }
        // Follow-up timing coach
        if (/follow.?up|when.*call|when.*text|when.*reach|timing|coach.*follow|re.?engage/i.test(lower)) {
            return 'followup_coach';
        }
        // SMS/Email draft generator
        if (/draft|write.*sms|write.*text|write.*email|compose.*message|message.*client|send.*text|send.*sms/i.test(lower)) {
            return 'draft_message';
        }
        // Scenario comparison
        if (/compare|scenario|what.*if|difference.*between|side.*by.*side|vs\b/i.test(lower)) {
            return 'scenario_comparison';
        }
        // Lead briefing
        if (/briefing|morning.*brief|lead.*digest|lead.*summary|hot.*leads|priority.*leads|daily.*brief/i.test(lower)) {
            return 'lead_briefing';
        }
        // Compliance guardrails
        if (/compliance|compliant|check.*message|review.*message|tila|respa|safe.*to.*send|risky.*language/i.test(lower)) {
            return 'compliance_check';
        }
        // Client question predictor
        if (/predict.*question|what.*will.*ask|client.*question|faq|anticipate|common.*question|likely.*ask/i.test(lower)) {
            return 'question_predictor';
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

        // ── Try real AI backend ──
        // The server-side proxy auto-detects super admin and routes accordingly
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

    // Get a fresh access token — always refreshes to avoid stale JWT 401s
    async function getFreshToken() {
        if (!EzraState.supabase) return null;
        try {
            // refreshSession() exchanges refresh token for a fresh access token
            const { data } = await EzraState.supabase.auth.refreshSession();
            if (data?.session?.access_token) return data.session.access_token;
            // Fallback to cached session if refresh fails
            const cached = await EzraState.supabase.auth.getSession();
            return cached?.data?.session?.access_token || null;
        } catch (e) { return null; }
    }

    // Call the ai-proxy Edge Function with provider cascade (cheapest first)
    // Call the ai-proxy edge function — server auto-detects super admin routing
    async function callAIProxy(message, model, intent, contextSummary) {
        if (!EzraState.supabase) return null;

        const token = await getFreshToken();
        if (!token) return null;

        const supabaseUrl = EzraState.supabase.supabaseUrl ||
            window.SUPABASE_URL || (window.__PUBLIC_CONFIG__ || {}).supabaseUrl || '';

        const systemPrompt = EZRA_KNOWLEDGE.buildSystemPrompt() + contextSummary;

        // Server-side proxy auto-detects super admin → routes Kimi→Claude
        // Regular users get feature-routed or cascade
        const response = await fetch(`${supabaseUrl}/functions/v1/ai-proxy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                action: 'generate',
                systemPrompt,
                userMessage: message,
                maxTokens: 1500,
                intent: intent || 'generate',
                feature: intent || 'ezra_copilot'
            })
        });

        if (response.status === 429) {
            const err = await response.json().catch(() => ({}));
            // Token budget exceeded — update display and return friendly message
            if (err.tokens_used !== undefined) {
                EzraState._tokenBudget = { tokens_used: err.tokens_used, tokens_limit: err.tokens_limit, tier: err.tier };
                updateTokenDisplay();
            }
            const nextTier = { carbon: 'Titanium', titanium: 'Platinum', platinum: 'Obsidian', obsidian: 'Diamond' };
            const upgrade = nextTier[err.tier] || 'a higher tier';
            return `\u26A0\uFE0F **Monthly AI token limit reached** (${(err.tokens_used || 0).toLocaleString()}/${(err.tokens_limit || 0).toLocaleString()})\n\nYou can still use **free local features**: Narrate Quote, Compare Scenarios, Draft Messages, Compliance Check, and Predict Questions.\n\nUpgrade to **${upgrade}** for more AI capacity.`;
        }

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `AI proxy ${response.status}`);
        }

        const data = await response.json();
        // Update token budget display after successful AI call
        if (data.tokens_used !== undefined) {
            EzraState._tokenBudget = { tokens_used: data.tokens_used, tokens_limit: data.tokens_limit, tier: data.tier };
            updateTokenDisplay();
        }
        return data.text || null;
    }

    // Call ai-proxy for image/document analysis (vision cascade: Gemini → OpenAI → Anthropic)
    async function callAIVisionProxy(imageBase64, imageMimeType, userMessage, intent) {
        if (!EzraState.supabase) return null;

        const token = await getFreshToken();
        if (!token) return null;

        const supabaseUrl = EzraState.supabase.supabaseUrl ||
            window.SUPABASE_URL || (window.__PUBLIC_CONFIG__ || {}).supabaseUrl || '';

        const response = await fetch(`${supabaseUrl}/functions/v1/ai-proxy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                action: 'analyze_image',
                imageBase64,
                imageMimeType,
                userMessage: userMessage || 'Analyze this document.',
                maxTokens: 2000,
                intent: intent || 'document_analysis'
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || `Vision proxy ${response.status}`);
        }

        const data = await response.json();
        return data;
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

        // ── NEW INTELLIGENCE SUITE RESPONSES ──
        responses.quote_narrator = narrateQuote(ctx);
        responses.draft_message = generateMessageDrafts(ctx);
        responses.scenario_comparison = compareScenarios(ctx);
        responses.compliance_check = '**Compliance Guardrails**\n\nPaste the SMS or email text you want me to review. I\'ll check for TILA/RESPA red flags, missing disclosures, and risky language.\n\n*Type or paste your message, then press Enter.*';
        responses.question_predictor = predictClientQuestions(ctx);

        // ── SIMPLE CHAT ──
        responses.simple_chat = `I'm Ezra, your AI loan structuring co-pilot.${hasData ? `\n\n**Current Quote**: ${ctx.clientName !== 'Borrower' ? ctx.clientName + ' — ' : ''}${ctx.helocAmount > 0 ? fmt(ctx.helocAmount) + ' HELOC' : 'No amount set'}${ctx.homeValue > 0 ? ' | ' + fmt(ctx.homeValue) + ' property' : ''}${ctx.cltv > 0 ? ' | ' + ctx.cltv + '% CLTV' : ''}` : ''}

Here's what I can do:
• **Build Quote** — auto-fill from borrower data
• **Structure Deal** — full deal analysis
• **Recommend Program** — best fit for goals
• **Handle Objections** — smart counters with real numbers
• **Narrate Quote** — plain-English quote summary
• **Draft Message** — personalized SMS & email
• **Compare Scenarios** — side-by-side term comparison
• **Lead Briefing** — your daily lead digest
• **Compliance Check** — review messages before sending
• **Predict Questions** — anticipate client FAQs

**Quick Commands** — talk to me like a colleague:
• "Go with tier 2" or "tier 1 at 30" — switch tiers/terms
• "Change cash to $150K" — adjust any field
• "Switch to interest only" — toggle IO mode
• **Paste lender portal data** — auto-parse rates

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
        } catch (e) { console.debug('Ezra: load conversation failed:', e?.message); }
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
        } catch (e) { console.debug('Ezra: create conversation failed:', e?.message); }
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
        } catch (e) { console.debug('Ezra: load history failed:', e?.message); }
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
        } catch (e) { console.debug('Ezra: save message failed:', e?.message); }
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
    // EZRA INTELLIGENCE SUITE — 8 Smart Features
    // ============================================

    // ── FEATURE 1: Smart Objection Responses ──
    function getSmartObjectionResponse(objectionText, ctx) {
        const lower = (objectionText || '').toLowerCase();
        const fmt = (n) => '$' + Number(n).toLocaleString();
        const hasData = ctx.hasFormData && ctx.helocAmount > 0;
        const bestRate = ctx.rates.fixed15 || ctx.rates.fixed30 || ctx.rates.fixed10 || 8.25;
        const payment15 = hasData ? calcAmortizedPayment(ctx.helocAmount, bestRate, 15) : 0;
        const payment30 = hasData ? calcAmortizedPayment(ctx.helocAmount, bestRate, 30) : 0;
        const ioPayment = hasData ? calcInterestOnlyPayment(ctx.helocAmount, ctx.rates.var10 || bestRate) : 0;
        const clientFirst = (ctx.clientName || 'Borrower').split(' ')[0];
        const responses = [];

        if (/rate|high|expensive|interest|too much/i.test(lower)) {
            responses.push({
                objection: '"The rate seems too high"',
                response: hasData
                    ? `"${clientFirst}, I hear you. At ${bestRate}%, your payment on ${fmt(ctx.helocAmount)} is ${fmt(payment30)}/mo on a 30-year — less than most car payments. Compare that to credit cards at 22-29%. Plus, a soft check lets you see offers with zero impact to your score."`
                    : '"A HELOC at 8-9% is significantly lower than credit cards at 22%+. See your actual offers with just a soft credit check — no commitment."',
                tip: 'Reframe against credit card rates. Anchor to the monthly payment, not the rate.'
            });
        }
        if (/payment|afford|monthly|budget|cash flow/i.test(lower)) {
            responses.push({
                objection: '"The payment is too high"',
                response: hasData
                    ? `"${clientFirst}, we have flexibility. The 30-year at ${fmt(payment30)}/mo is the lowest fixed option. The variable program is ${fmt(ioPayment)}/mo interest-only during draw. Which fits your budget?"`
                    : '"We offer structures from 5-year rapid payoff to 30-year low payment, plus interest-only variable options."',
                tip: 'Offer the 30yr or IO variable as a lower-payment alternative.'
            });
        }
        if (/wait|not.*now|think.*about|later|not ready|not sure/i.test(lower)) {
            responses.push({
                objection: '"I want to wait / I\'m not sure"',
                response: hasData
                    ? `"${clientFirst}, that's fine. At ${ctx.cltv}% CLTV, you have ${fmt(ctx.maxEquityAt85)} in accessible equity. A soft check today doesn't commit you — you'd just see what's available."`
                    : '"A soft credit check has zero impact on your score and zero commitment. Just shows you what\'s available."',
                tip: 'Create awareness of opportunity cost without pressure.'
            });
        }
        if (/safe|trust|scam|legit|data|privacy|information/i.test(lower)) {
            responses.push({
                objection: '"Is my information safe?"',
                response: '"Bank-grade security — same encryption as major financial institutions. We never sell your data. You maintain full control and see all options transparently."',
                tip: 'Lead with institutional security. Emphasize borrower control.'
            });
        }
        if (/refi|refinance|why.*not.*refi/i.test(lower)) {
            responses.push({
                objection: '"Why not just refinance?"',
                response: hasData
                    ? `"${clientFirst}, a refinance replaces your first mortgage — you'd give up your current rate on ${fmt(ctx.mortgageBalance)}. A HELOC accesses ${fmt(ctx.helocAmount)} without touching your first."`
                    : '"A refinance replaces your entire first mortgage. A HELOC adds a second lien, so your first mortgage stays untouched."',
                tip: 'Emphasize preserving their existing rate — #1 HELOC advantage.'
            });
        }
        if (responses.length === 0) {
            responses.push(
                { objection: '"The rate seems too high"', response: hasData ? `"At ${bestRate}%, your ${fmt(ctx.helocAmount)} HELOC is ${fmt(payment15)}/mo on 15 years. Credit cards would cost ${fmt(Math.round(ctx.helocAmount * 0.24 / 12))}/mo at 24%."` : '"Compare a HELOC at 8-9% to credit cards at 22%+."', tip: 'Reframe against what they\'re already paying.' },
                { objection: '"I need to think about it"', response: '"A soft check today — zero commitment, zero score impact — just shows you what\'s available."', tip: 'Remove friction.' },
                { objection: '"My bank offered me a better deal"', response: hasData ? `"Compare side by side. Our ${bestRate}% on ${fmt(ctx.helocAmount)} comes with ${ctx.origFee}% origination. Does their offer include closing costs?"` : '"Bring their offer and let\'s compare total cost — rate, fees, draw period, and terms."', tip: 'Compare total cost, not just rate.' }
            );
        }

        let output = '**Smart Objection Responses**\n';
        if (hasData) output += `*For ${ctx.clientName} — ${fmt(ctx.helocAmount)} at ${bestRate}%*\n`;
        output += '\n';
        responses.forEach(r => { output += `**${r.objection}**\n${r.response}\n*Tip: ${r.tip}*\n\n---\n\n`; });
        return output.trim();
    }

    // ── FEATURE 2: Quote Summary Narrator ──
    function narrateQuote(ctx) {
        const fmt = (n) => '$' + Number(n).toLocaleString();
        if (!ctx.hasFormData || ctx.helocAmount <= 0) return '**Quote Narrator**\n\nNo quote data. Fill in the form first.';
        const bestRate = ctx.rates.fixed15 || ctx.rates.fixed30 || ctx.rates.fixed10 || 8.25;
        const p15 = calcAmortizedPayment(ctx.helocAmount, bestRate, 15);
        const p30 = calcAmortizedPayment(ctx.helocAmount, bestRate, 30);
        const pio = calcInterestOnlyPayment(ctx.helocAmount, ctx.rates.var10 || bestRate);
        const ti15 = Math.round(p15 * 180 - ctx.helocAmount);
        const ti30 = Math.round(p30 * 360 - ctx.helocAmount);
        const eqPct = ctx.homeValue > 0 ? Math.round((1 - ctx.mortgageBalance / ctx.homeValue) * 100) : 0;
        const cf = (ctx.clientName || 'Borrower').split(' ')[0];

        let n = `**Quote Summary for ${ctx.clientName}**\n\n`;
        n += `"${cf}, here's what this means in plain English:\n\n`;
        n += `Your home is worth ${fmt(ctx.homeValue)}`;
        if (ctx.mortgageBalance > 0) n += `, and you owe ${fmt(ctx.mortgageBalance)} — about ${eqPct}% equity built up`;
        n += `.\n\nWe're looking at a ${fmt(ctx.helocAmount)} HELOC, bringing total borrowing to ${ctx.cltv}% of your home's value`;
        n += ctx.cltv <= 85 ? ' — well within guidelines.\n\n' : ' — above the typical 85% max, so we may adjust.\n\n';
        n += `**What does this cost?**\n`;
        n += `• 15-year: ${fmt(p15)}/mo — paid in 15 years (${fmt(ti15)} total interest)\n`;
        n += `• 30-year: ${fmt(p30)}/mo — lower payment, but ${fmt(ti30)} total interest\n`;
        n += `• Variable IO: ${fmt(pio)}/mo during draw — lowest but no principal paydown\n\n`;
        n += `**Bottom line:** `;
        n += ctx.helocAmount <= 100000
            ? `For less than ${fmt(Math.ceil(p15 / 10) * 10)}/mo, you unlock ${fmt(ctx.helocAmount)} in equity.`
            : `You're accessing ${fmt(ctx.helocAmount)} with payments as low as ${fmt(p30)}/mo.`;
        n += `"\n\n*Copy this script for your client conversation.*`;
        return n;
    }

    // ── FEATURE 3: Follow-Up Timing Coach ──
    async function getFollowUpCoach() {
        let output = '**Follow-Up Timing Coach**\n\n';
        let hotLeads = [], staleLeads = [], recentClicks = [];
        if (EzraState.supabase && EzraState.user) {
            try {
                const [hotRes, clickRes, staleRes] = await Promise.all([
                    EzraState.supabase.rpc('get_hot_leads', { score_threshold: 10, hours_window: 48 }).catch(() => ({ data: null })),
                    EzraState.supabase.from('clicks').select('link_id, clicked_at, device_type, links!inner(short_code, lead_id)').eq('links.user_id', EzraState.user.id).gte('clicked_at', new Date(Date.now() - 86400000).toISOString()).order('clicked_at', { ascending: false }).limit(20).catch(() => ({ data: null })),
                    EzraState.supabase.from('leads').select('id, first_name, last_name, email, updated_at, stage').eq('user_id', EzraState.user.id).lt('updated_at', new Date(Date.now() - 604800000).toISOString()).in('stage', ['new', 'contacted', 'nurturing']).order('updated_at', { ascending: true }).limit(10).catch(() => ({ data: null }))
                ]);
                hotLeads = hotRes?.data || []; recentClicks = clickRes?.data || []; staleLeads = staleRes?.data || [];
            } catch (e) { console.warn('Ezra: Follow-up data fetch failed', e.message); }
        }
        if (hotLeads.length > 0) {
            output += `**Hot Leads — Call NOW (${hotLeads.length})**\n`;
            hotLeads.slice(0, 5).forEach(l => { output += `• **${[l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || 'Unknown'}** — score: ${l.engagement_score || 'high'}\n`; });
            output += '*Call immediately. They\'re actively thinking about this.*\n\n---\n\n';
        } else output += '**Hot Leads** — None in the last 48 hours.\n\n';
        if (recentClicks.length > 0) {
            output += `**Quote Views Today (${recentClicks.length} clicks)**\n`;
            const mob = recentClicks.filter(c => c.device_type === 'mobile').length;
            if (mob > 0) output += `${mob} from mobile — text works best.\n`;
            output += '\n---\n\n';
        }
        if (staleLeads.length > 0) {
            output += `**Stale Leads — Re-Engage (${staleLeads.length})**\n`;
            staleLeads.slice(0, 5).forEach(l => { const d = Math.round((Date.now() - new Date(l.updated_at).getTime()) / 86400000); output += `• **${[l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || 'Unknown'}** — ${d} days silent\n`; });
            output += '*Send a check-in text or fresh quote link.*\n\n---\n\n';
        } else output += '**Stale Leads** — All leads have recent activity!\n\n';
        output += '**Best Practices**\n• **3+ opens today** — Call NOW\n• **Opened 2-3 days ago** — Check-in text\n• **7+ days silent** — Re-send with fresh angle\n• **Mobile opens** — Text first, then call\n• **Best call times**: Tue-Thu, 10am-12pm or 4-6pm\n• **Best text times**: Mon-Wed, 9-11am or after 5pm';
        return output;
    }

    // ── FEATURE 4: SMS/Email Draft Generator ──
    function generateMessageDrafts(ctx) {
        const fmt = (n) => '$' + Number(n).toLocaleString();
        if (!ctx.hasFormData || ctx.helocAmount <= 0) return '**Message Drafts**\n\nFill in the quote form first.';
        const bestRate = ctx.rates.fixed15 || ctx.rates.fixed30 || ctx.rates.fixed10 || 8.25;
        const p30 = calcAmortizedPayment(ctx.helocAmount, bestRate, 30);
        const p15 = calcAmortizedPayment(ctx.helocAmount, bestRate, 15);
        let cf = (ctx.clientName || 'there').split(' ')[0];
        if (cf === 'Borrower') cf = 'there';

        let o = `**Personalized Messages for ${ctx.clientName}**\n\n`;
        o += '**SMS 1 — Initial Outreach:**\n';
        o += `"Hi ${cf}! I put together a HELOC comparison — you could access ${fmt(ctx.helocAmount)} in equity with payments as low as ${fmt(p30)}/mo. Want the details? No hard credit pull needed."\n\n`;
        o += '**SMS 2 — Follow-Up:**\n';
        o += `"Hey ${cf}, I ran the numbers on your equity. At ${bestRate}%, the 15-year is ${fmt(p15)}/mo and pays off in full. Quick call?"\n\n`;
        o += '**SMS 3 — Re-Engagement:**\n';
        o += `"Hi ${cf}! Rates have been moving — your ${fmt(ctx.helocAmount)} HELOC quote is still available. Want me to refresh the numbers?"\n\n---\n\n`;
        o += '**Email Draft**\n\n';
        o += `**Subject:** ${cf}, your HELOC options are ready\n\n`;
        o += `Hi ${cf},\n\nI put together a personalized HELOC comparison. Quick snapshot:\n\n`;
        o += `• **Equity access:** ${fmt(ctx.helocAmount)}\n• **Rate:** ${bestRate}% fixed\n`;
        o += `• **Payment:** As low as ${fmt(p30)}/mo (30yr) or ${fmt(p15)}/mo (15yr)\n`;
        if (ctx.cltv > 0) o += `• **CLTV:** ${ctx.cltv}% — ${ctx.cltv <= 85 ? 'within guidelines' : 'we can discuss'}\n`;
        o += `\nView your offers with a **soft credit check** — no impact, no commitment.\n\nWould a quick 10-minute call work this week?\n\nBest,\n[Your Name]\n\n---\n\n*Ensure contact has opted in before sending SMS (TCPA).*`;
        return o;
    }

    // ── FEATURE 5: Scenario Comparison ──
    function compareScenarios(ctx) {
        const fmt = (n) => '$' + Number(n).toLocaleString();
        if (!ctx.hasFormData || ctx.helocAmount <= 0) return '**Scenario Comparison**\n\nFill in the quote form first.';
        const r = ctx.rates.fixed15 || ctx.rates.fixed30 || ctx.rates.fixed10 || 8.25;
        const vr = ctx.rates.var10 || r;
        const p5 = calcAmortizedPayment(ctx.helocAmount, r, 5), p10 = calcAmortizedPayment(ctx.helocAmount, r, 10);
        const p15 = calcAmortizedPayment(ctx.helocAmount, r, 15), p30 = calcAmortizedPayment(ctx.helocAmount, r, 30);
        const pio = calcInterestOnlyPayment(ctx.helocAmount, vr);
        const ti5 = Math.round(p5*60-ctx.helocAmount), ti10 = Math.round(p10*120-ctx.helocAmount);
        const ti15 = Math.round(p15*180-ctx.helocAmount), ti30 = Math.round(p30*360-ctx.helocAmount);
        const cf = (ctx.clientName || 'your client').split(' ')[0];

        let o = `**Scenario Comparison — ${fmt(ctx.helocAmount)} at ${r}%**\n*For ${ctx.clientName}*\n\n`;
        o += `**5-Year Fixed** — ${fmt(p5)}/mo\n"Fastest payoff. ${fmt(ti5)} total interest. Done in 5 years."\n\n`;
        o += `**10-Year Fixed** — ${fmt(p10)}/mo\n"Solid middle ground. ${fmt(ti10)} total interest."\n\n`;
        o += `**15-Year Fixed** — ${fmt(p15)}/mo\n"Most popular. ${fmt(p5-p15)} less than 5yr. ${fmt(ti15)} interest."\n\n`;
        o += `**30-Year Fixed** — ${fmt(p30)}/mo\n"Lowest fixed at ${fmt(p30)}. But ${fmt(ti30)} total interest."\n\n`;
        o += `**Variable IO** — ${fmt(pio)}/mo *(draw period)*\n"Interest-only. Cheapest monthly but no principal paydown."\n\n---\n\n`;
        o += `**Key Trade-Offs:**\n`;
        o += `• 30yr → 15yr: **saves ${fmt(ti30-ti15)}** interest, costs ${fmt(p15-p30)}/mo more\n`;
        o += `• 15yr → 10yr: **saves ${fmt(ti15-ti10)}** more, adds ${fmt(p10-p15)}/mo\n`;
        o += `• Variable IO is cheapest monthly but doesn't build equity\n`;
        o += `\n*Present all options. Let ${cf} choose.*`;
        return o;
    }

    // ── FEATURE 6: Lead Priority Briefing ──
    async function runLeadBriefing() {
        addMessage('user', 'Give me my lead briefing');
        showTypingIndicator();
        let output = '**Your Lead Briefing**\n\n';
        const now = new Date();
        output += `*${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} — ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}*\n\n`;

        if (!EzraState.supabase || !EzraState.user) { hideTypingIndicator(); addMessage('assistant', output + 'Not authenticated.'); return; }
        try {
            const uid = EzraState.user.id;
            const [newR, hotR, staleR, totalR] = await Promise.all([
                EzraState.supabase.from('leads').select('id, first_name, last_name, email, source, created_at').eq('user_id', uid).gte('created_at', new Date(Date.now()-86400000).toISOString()).order('created_at', { ascending: false }),
                EzraState.supabase.rpc('get_hot_leads', { score_threshold: 8, hours_window: 72 }).catch(() => ({ data: null })),
                EzraState.supabase.from('leads').select('id, first_name, last_name, email, updated_at, stage').eq('user_id', uid).lt('updated_at', new Date(Date.now()-604800000).toISOString()).in('stage', ['new','contacted','nurturing']).order('updated_at', { ascending: true }).limit(10),
                EzraState.supabase.from('leads').select('id', { count: 'exact', head: true }).eq('user_id', uid).in('stage', ['new','contacted','nurturing','qualified'])
            ]);
            const nl = newR.data||[], hl = hotR.data||[], sl = staleR.data||[], tot = totalR.count||0;
            output += `**Pipeline:** ${tot} active leads\n\n`;
            output += `**New (24h): ${nl.length}**\n`;
            if (nl.length > 0) { nl.slice(0,5).forEach(l => { output += `• **${[l.first_name,l.last_name].filter(Boolean).join(' ')||l.email||'Unknown'}** — ${l.source||'manual'} at ${new Date(l.created_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}\n`; }); if (nl.length > 5) output += `  *(+${nl.length-5} more)*\n`; output += '*Reach out within the first hour.*\n'; } else output += 'None.\n';
            output += '\n';
            output += `**Hot (High Engagement): ${hl.length}**\n`;
            if (hl.length > 0) { hl.slice(0,5).forEach(l => { output += `• **${[l.first_name,l.last_name].filter(Boolean).join(' ')||l.email||'Unknown'}** — score: ${l.engagement_score||'—'}\n`; }); output += '*Call or text today.*\n'; } else output += 'None right now.\n';
            output += '\n';
            output += `**Re-Engage: ${sl.length}**\n`;
            if (sl.length > 0) { sl.slice(0,5).forEach(l => { const d = Math.round((Date.now()-new Date(l.updated_at).getTime())/86400000); output += `• **${[l.first_name,l.last_name].filter(Boolean).join(' ')||l.email||'Unknown'}** — ${d} days silent\n`; }); output += '*Send a check-in text.*\n'; } else output += 'All active!\n';
            output += '\n---\n\n**Priorities:**\n';
            let s = 1;
            if (hl.length > 0) output += `${s++}. Call ${hl.length} hot lead(s)\n`;
            if (nl.length > 0) output += `${s++}. Follow up with ${nl.length} new lead(s)\n`;
            if (sl.length > 0) output += `${s++}. Re-engage ${Math.min(sl.length,3)} stale leads\n`;
            if (s === 1) output += 'Pipeline quiet — great time to prospect.\n';
        } catch (e) { output += `*Error: ${e.message}*`; }

        hideTypingIndicator();
        addMessage('assistant', output, { model: 'local', intent: 'lead_briefing' });
        saveMessageToSupabase('user', 'Give me my lead briefing');
        saveMessageToSupabase('assistant', output, { model: 'local' });
    }

    // ── FEATURE 7: Compliance Guardrails ──
    function runComplianceCheck(messageText) {
        const text = messageText || '', lower = text.toLowerCase();
        const issues = [], warnings = [], passed = [];

        if (/guarantee[d]?\s*(approval|approv|funding|loan|rate)/i.test(lower) || /100%\s*approv/i.test(lower))
            issues.push({ rule: 'No Guaranteed Outcomes', detail: 'Never guarantee approval/funding/rates.', fix: 'Use "potential" or "you may qualify"' });
        if (/\d+\.?\d*\s*%/.test(text) && !/apr|annual percentage|subject to|may vary|based on/i.test(lower))
            warnings.push({ rule: 'Rate Disclosure', detail: 'Rate without qualification context.', fix: 'Add: "Rate for illustration. Actual depends on credit/LTV."' });
        if (/no\s*(closing\s*)?fees|free\s*(loan|heloc|mortgage)|zero\s*cost/i.test(lower))
            issues.push({ rule: 'Fee Disclosure', detail: '"No fees"/"free" is misleading.', fix: 'Be specific: "No application fee"' });
        if (/no\s*credit\s*check|won\'?t\s*(check|pull|affect)\s*(your\s*)?credit/i.test(lower) && !/soft/i.test(lower))
            issues.push({ rule: 'Credit Check Disclosure', detail: '"No credit check" is misleading.', fix: '"Soft credit check with no score impact"' });
        if (/last\s*chance|act\s*now|offer\s*expires|limited\s*time|only\s*\d+\s*left|hurry/i.test(lower))
            warnings.push({ rule: 'Pressure Tactics', detail: 'High-pressure urgency.', fix: '"Rates can change, locking in sooner is beneficial"' });
        if (/no\s*(income|doc|documentation)\s*(needed|required|verification)/i.test(lower))
            issues.push({ rule: 'Documentation Requirements', detail: '"No doc" is misleading.', fix: '"Streamlined digital income verification"' });
        if (/worse\s*than|rip\s*off|scam|don\'?t\s*trust|avoid\s*(them|that|your\s*bank)/i.test(lower))
            warnings.push({ rule: 'Competitor Disparagement', detail: 'Negative competitor language.', fix: 'Focus on your own value.' });
        if (/tax\s*(deduct|benefit|write.?off|advantage|savings)/i.test(lower) && !/consult|advisor|accountant|may\s*be/i.test(lower))
            warnings.push({ rule: 'Tax Advice Disclaimer', detail: 'Tax benefits without disclaimer.', fix: '"Consult your tax advisor"' });

        if (/soft\s*(credit\s*)?check|soft\s*pull|no\s*impact/i.test(lower)) passed.push('Soft credit check mentioned');
        if (/subject\s*to|may\s*vary|based\s*on/i.test(lower)) passed.push('Qualification language');
        if (/no\s*(obligation|commitment)/i.test(lower)) passed.push('No obligation stated');
        if (/consult|advisor/i.test(lower)) passed.push('Professional advice referenced');

        let o = `**Compliance Check**\n\nReviewed ${text.length} characters.\n\n`;
        if (!issues.length && !warnings.length) o += '**ALL CLEAR** — No issues.\n\n';
        if (issues.length) { o += `**Issues (${issues.length})** — Fix before sending:\n\n`; issues.forEach((x,i) => { o += `${i+1}. **${x.rule}** — ${x.detail}\n   *Fix: ${x.fix}*\n\n`; }); }
        if (warnings.length) { o += `**Warnings (${warnings.length})** — Consider revising:\n\n`; warnings.forEach((x,i) => { o += `${i+1}. **${x.rule}** — ${x.detail}\n   *Fix: ${x.fix}*\n\n`; }); }
        if (passed.length) { o += '**Good Practices:**\n'; passed.forEach(p => { o += `• ${p}\n`; }); o += '\n'; }
        o += issues.length ? `---\n\n**DO NOT SEND** — Fix ${issues.length} issue(s).` : warnings.length ? `---\n\n**REVIEW** — ${warnings.length} warning(s).` : '---\n\n**SAFE TO SEND**';
        return o;
    }

    // ── FEATURE 8: Client Question Predictor ──
    function predictClientQuestions(ctx) {
        const fmt = (n) => '$' + Number(n).toLocaleString();
        if (!ctx.hasFormData || ctx.helocAmount <= 0) return '**Question Predictor**\n\nBuild a quote first.';
        const bestRate = ctx.rates.fixed15 || ctx.rates.fixed30 || ctx.rates.fixed10 || 8.25;
        const p15 = calcAmortizedPayment(ctx.helocAmount, bestRate, 15);
        const p30 = calcAmortizedPayment(ctx.helocAmount, bestRate, 30);
        const ti30 = Math.round(p30 * 360 - ctx.helocAmount);
        const cf = (ctx.clientName || 'the client').split(' ')[0];

        let o = `**Predicted Questions for ${ctx.clientName}**\n*${fmt(ctx.helocAmount)} at ${bestRate}%, ${ctx.cltv}% CLTV*\n\n`;
        const qs = [
            { q: '"What\'s my monthly payment?"', a: `"30-year: ${fmt(p30)}/mo (lowest). 15-year: ${fmt(p15)}/mo (pays off faster)."`, l: 'Very High' },
            { q: '"Will this hurt my credit?"', a: '"Soft pull only — zero score impact. Hard pull only if you proceed."', l: 'Very High' },
            { q: '"How long does it take?"', a: '"AI underwriting + digital verification. Some fund in as little as 5 days."', l: 'High' },
            { q: '"Can I pay it off early?"', a: `"Yes — no prepayment penalty. Extra ${fmt(Math.round(p30*0.25))}/mo on the 30yr shaves years off."`, l: 'High' },
            { q: '"What if rates go up?"', a: `"Fixed locks you at ${bestRate}% for the full term. Won't change."`, l: 'Medium' },
            { q: '"How much total?"', a: `"30yr: ${fmt(ti30)} total interest. 15yr: ${fmt(Math.round(p15*180-ctx.helocAmount))} — much less."`, l: 'Medium' }
        ];
        if (bestRate > 7) qs.splice(2, 0, { q: '"Can I get a lower rate?"', a: '"Higher origination tier = lower rate. I\'ll show you all three."', l: 'High' });
        if (ctx.cltv > 75) qs.push({ q: '"Am I borrowing too much?"', a: `"${ctx.cltv}% CLTV — ${ctx.cltv <= 85 ? 'within guidelines' : 'near limit'}. ${fmt(ctx.homeValue-ctx.mortgageBalance-ctx.helocAmount)} equity untouched."`, l: 'Medium' });
        if (ctx.helocAmount > 100000) qs.push({ q: `"Is ${fmt(ctx.helocAmount)} a lot?"`, a: `"Not for a ${fmt(ctx.homeValue)} property. HELOCs are the most cost-effective equity access."`, l: 'Medium' });

        const ord = { 'Very High': 0, 'High': 1, 'Medium': 2 };
        qs.sort((a, b) => ord[a.l] - ord[b.l]);
        qs.forEach((q, i) => { o += `**${i+1}. ${q.q}** *(${q.l})*\n**Answer:** ${q.a}\n\n`; });
        o += `---\n\n*Have these ready before calling ${cf}.*`;
        return o;
    }

    // ============================================
    // UTILITY FUNCTIONS
    // ============================================
    function showToast(message, type = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, type);
        } else {
            console.debug(`[${type}] ${message}`);
        }
    }

    // ============================================
    // CLEAR CHAT
    // ============================================
    async function clearChat() {
        // Clear UI messages
        const messagesContainer = document.getElementById('ezra-messages');
        if (messagesContainer) messagesContainer.innerHTML = '';

        // Clear state
        EzraState.messages = [];

        // Mark old conversation as ended and start fresh
        if (EZRA_TABLES_DEPLOYED && EzraState.conversationId && EzraState.supabase) {
            try {
                await EzraState.supabase
                    .from('ezra_conversations')
                    .update({ status: 'ended' })
                    .eq('id', EzraState.conversationId);
            } catch (e) { console.debug('Ezra: end conversation failed:', e?.message); }
            EzraState.conversationId = null;
            await createNewConversation();
        }

        // Show welcome state again
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="ezra-welcome" style="text-align:center;padding:40px 20px;color:var(--ezra-text-muted,#94a3b8);">
                    <div style="font-size:32px;margin-bottom:12px;filter:drop-shadow(0 0 8px rgba(212,175,55,0.4));">\u2726</div>
                    <div style="font-family:'DM Sans',sans-serif;font-weight:700;font-size:14px;color:var(--ezra-gold,#c5a059);letter-spacing:2px;margin-bottom:8px;">EZRA</div>
                    <div style="font-size:12px;line-height:1.6;">Chat cleared. Ask me anything about<br>HELOC structuring & strategy.</div>
                </div>`;
        }

        console.debug('Ezra: Chat cleared');
    }

    // ============================================
    // ONBOARDING & FIRST-TIME USER WIZARD
    // ============================================
    
    // Check if user is new (no quotes created yet)
    async function checkIfNewUser() {
        if (!EzraState.supabase) return false;
        try {
            const { data: { session } } = await EzraState.supabase.auth.getSession();
            if (!session?.user) return false;
            
            // Check if user has any quotes
            const { data: quotes, error } = await EzraState.supabase
                .from('quote_links')
                .select('id')
                .eq('user_id', session.user.id)
                .limit(1);
            
            if (error) return false;
            return !quotes || quotes.length === 0;
        } catch (e) {
            return false;
        }
    }

    // Show onboarding for new users
    async function showOnboardingIfNew() {
        const isNew = await checkIfNewUser();
        const onboardingEl = document.getElementById('ezra-onboarding');
        if (isNew && onboardingEl) {
            onboardingEl.style.display = 'block';
        }
    }

    // Start the onboarding wizard
    window.ezraStartOnboarding = function() {
        const messagesContainer = document.getElementById('ezra-messages');
        const welcomeEl = document.getElementById('ezra-welcome');
        
        if (welcomeEl) welcomeEl.style.display = 'none';
        
        // Add onboarding message
        addMessage('assistant', `
\ud83d\ude80 **Welcome to Above All Carbon!**

I'm Ezra, your AI loan structuring assistant. Let me help you create your first HELOC quote in just a few steps.

**Step 1 of 4: Client Information**

Tell me about your client. You can type naturally like:
• "Client is John Smith, credit score 740"
• "Borrower has $800k home, $400k mortgage, wants $100k cash"
• "Primary residence, 780 FICO, need $150k"

Or just paste what you know and I'll guide you!`, { model: 'local' });

        // Set onboarding mode
        EzraState.onboardingStep = 1;
        EzraState.onboardingData = {};
        
        // Focus input
        setTimeout(() => {
            const input = document.getElementById('ezra-input');
            if (input) {
                input.placeholder = "Describe your client's situation...";
                input.focus();
            }
        }, 100);
    };

    // Process onboarding step
    function processOnboardingStep(message) {
        const step = EzraState.onboardingStep || 1;
        const ctx = parseMessageContext(message, getFormContext());
        
        // Merge new data
        Object.assign(EzraState.onboardingData, ctx);
        const data = EzraState.onboardingData;
        
        switch (step) {
            case 1:
                // After getting client info
                if (data.clientName && data.homeValue > 0 && data.mortgageBalance > 0 && data.helocAmount > 0) {
                    // We have everything, auto-fill and move to rates
                    applyOnboardingData(data);
                    EzraState.onboardingStep = 3;
                    return `\u2705 **Great! I've filled in the client details.**

**Property Value:** $${data.homeValue.toLocaleString()}
**Mortgage Balance:** $${data.mortgageBalance.toLocaleString()}
**HELOC Amount:** $${data.helocAmount.toLocaleString()}
**CLTV:** ${data.cltv}%

**Step 3 of 4: Add Rates**

Now let's add your lender rates. You can:
• Paste from Figure portal (Ctrl+A, Ctrl+C, paste here)
• Type rates like "30yr at 7.5%, 20yr at 7.25%"
• Or paste any lender rate sheet`;
                } else {
                    // Missing some info, ask for it
                    const missing = [];
                    if (!data.clientName) missing.push("client name");
                    if (data.homeValue <= 0) missing.push("property value");
                    // Check if mortgageBalance is null/undefined (not provided) vs explicitly 0 (paid off)
                    if (data.mortgageBalance === null || data.mortgageBalance === undefined || data.mortgageBalance < 0) missing.push("mortgage balance (or say 'paid off' if no mortgage)");
                    if (data.helocAmount <= 0) missing.push("cash needed");
                    
                    return `Thanks! I have some information. To continue, I still need: **${missing.join(', ')}**.

Just tell me what you know, like "property is worth $750k" or "they owe $350k on their mortgage". If the home is paid off, just say "paid off".`;
                }
                
            case 3:
                // Handle rates input
                const portalData = parseLenderPortalData(message);
                if (portalData) {
                    applyMultiTierData(portalData);
                    EzraState.onboardingStep = 4;
                    return `\u2705 **Rates imported successfully!**

**Step 4 of 4: Generate Quote**

Your quote is ready! Click **"Generate Client Link"** in the Presentation section to create a shareable quote page for your client.

**What happens next:**
• Your client gets a beautiful, branded quote page
• They can ask me (Ezra) questions about the quote
• You get notified when they view it
• They can apply directly from the quote

**Need help?** Just ask me anything about the quote or HELOCs in general!`;
                }
                
                const convRates = parseConversationalRates(message);
                if (convRates.tiers.length > 0) {
                    applyMultiTierData(convRates);
                    EzraState.onboardingStep = 4;
                    return `\u2705 **Rates added!**

**Step 4 of 4: Generate Quote**

Your quote is ready! Click **"Generate Client Link"** in the Presentation section to create a shareable quote page.

**Pro tip:** The quote includes:
• Interactive rate comparison
• AI assistant (me!) to answer client questions
• Apply button for instant applications
• Analytics to track client engagement`;
                }
                
                return `I need to add rates to complete the quote. You can:

1. **Paste from Figure:** Go to Figure Lead Portal, press Ctrl+A, Ctrl+C, then paste here
2. **Type rates:** "For 1.5% orig, 30yr is 7.5%, 20yr is 7.25%..."
3. **Upload rate sheet:** Copy/paste from any lender portal

What would you like to do?`;
                
            default:
                return null; // Not in onboarding
        }
    }

    // Apply onboarding data to form
    function applyOnboardingData(data) {
        function setField(id, value) {
            const field = document.getElementById(id);
            if (!field || !value) return;
            field.value = value;
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            field.style.transition = 'background 0.3s';
            field.style.background = '#dcfce7';
            setTimeout(() => field.style.background = '', 1500);
        }
        
        if (data.clientName) setField('in-client-name', data.clientName);
        if (data.creditScore) setField('in-client-credit', data.creditScore);
        if (data.homeValue) setField('in-home-value', data.homeValue);
        if (data.mortgageBalance) setField('in-mortgage-balance', data.mortgageBalance);
        if (data.helocAmount) setField('in-net-cash', data.helocAmount);
        if (data.occupancy) setField('in-property-type', data.occupancy);
        
        // Trigger calculations
        if (typeof updateQuote === 'function') setTimeout(updateQuote, 100);
        if (typeof autoSave === 'function') setTimeout(autoSave, 300);
    }

    // ============================================
    // PUBLIC API
    // ============================================
    window.Ezra = {
        init: initEzra,
        toggle: toggleWidget,
        open: () => { if (!EzraState.isOpen) toggleWidget(); },
        close: closeWidget,
        clearChat: clearChat,
        syncVoiceSettings: syncEzraVoiceSettings,
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
        viewDealDetails: viewDealDetails,
        // Position API
        moveWidget: moveWidgetToPosition,
        showPositionSelector: showPositionModal,
        // Onboarding API
        startOnboarding: window.ezraStartOnboarding,
        checkIfNewUser: checkIfNewUser,
        // Intelligence Suite API
        narrateQuote: () => { const ctx = getFormContext(); addMessage('assistant', narrateQuote(ctx), { model: 'local' }); },
        draftMessage: () => { const ctx = getFormContext(); addMessage('assistant', generateMessageDrafts(ctx), { model: 'local' }); },
        compareScenarios: () => { const ctx = getFormContext(); addMessage('assistant', compareScenarios(ctx), { model: 'local' }); },
        leadBriefing: runLeadBriefing,
        complianceCheck: (text) => { addMessage('assistant', runComplianceCheck(text), { model: 'local' }); },
        predictQuestions: () => { const ctx = getFormContext(); addMessage('assistant', predictClientQuestions(ctx), { model: 'local' }); },
        followUpCoach: async () => { const r = await getFollowUpCoach(); addMessage('assistant', r, { model: 'local' }); },
        smartObjection: (text) => { const ctx = getFormContext(); addMessage('assistant', getSmartObjectionResponse(text, ctx), { model: 'local' }); },
        // Follow-Up Sequence API
        generateFollowUpSequence: generateFollowUpSequence,
        previewFollowUpMessage: previewFollowUpMessage,
        scheduleFollowUps: scheduleFollowUpSequence,
        // Document & Rate Sheet API
        uploadDocument: handleDocUpload,
        uploadRateSheet: handleRateSheetUpload,
        autoFillFromRateSheet: autoFillRatesFromMatrix,
    };

    // ============================================
    // FOLLOW-UP SEQUENCE FUNCTIONS
    // ============================================
    function generateFollowUpSequence(sequenceType, quoteData, loInfo) {
        const sequence = FOLLOW_UP_SEQUENCES[sequenceType];
        if (!sequence) {
            return { error: 'Unknown sequence type: ' + sequenceType };
        }

        // Calculate send times
        const now = Date.now();
        const scheduledMessages = sequence.map((step, index) => {
            const sendTime = now + step.delay;
            const message = populateTemplate(step.message, quoteData, loInfo);
            const subject = step.subject ? populateTemplate(step.subject, quoteData, loInfo) : null;
            
            return {
                id: `${sequenceType}_${index}`,
                channel: step.channel,
                subject: subject,
                message: message,
                scheduledFor: new Date(sendTime).toISOString(),
                status: 'pending'
            };
        });

        return {
            type: sequenceType,
            messages: scheduledMessages,
            totalMessages: scheduledMessages.length
        };
    }

    function populateTemplate(template, quoteData, loInfo) {
        if (!template) return '';
        
        const d = quoteData || {};
        const lo = loInfo || {};
        
        // Calculate monthly savings estimate
        const helocAmount = parseFloat(d.netCash) || 0;
        const monthlySavings = Math.round(helocAmount * 0.15 / 12); // Rough estimate: 15% avg CC rate vs HELOC
        
        return template
            .replace(/\{\{clientName\}\}/g, d.clientName || 'there')
            .replace(/\{\{loName\}\}/g, lo.name || 'Your Loan Officer')
            .replace(/\{\{company\}\}/g, lo.company || 'Our Company')
            .replace(/\{\{quoteLink\}\}/g, d.quoteLink || '[Quote Link]')
            .replace(/\{\{applyLink\}\}/g, lo.applyLink || '[Apply Link]')
            .replace(/\{\{portalLink\}\}/g, lo.applyLink || '[Portal Link]')
            .replace(/\{\{loPhone\}\}/g, lo.phone || '[Phone]')
            .replace(/\{\{loEmail\}\}/g, lo.email || '[Email]')
            .replace(/\{\{cashBack\}\}/g, helocAmount.toLocaleString())
            .replace(/\{\{rate\}\}/g, d.rate || '[Rate]')
            .replace(/\{\{monthlySavings\}\}/g, monthlySavings.toLocaleString())
            .replace(/\{\{payment\}\}/g, d.payment || '[Payment]');
    }

    function previewFollowUpMessage(sequenceType, stepIndex, quoteData, loInfo) {
        const sequence = FOLLOW_UP_SEQUENCES[sequenceType];
        if (!sequence || !sequence[stepIndex]) {
            return { error: 'Invalid sequence or step' };
        }
        
        const step = sequence[stepIndex];
        return {
            channel: step.channel,
            subject: step.subject ? populateTemplate(step.subject, quoteData, loInfo) : null,
            message: populateTemplate(step.message, quoteData, loInfo),
            delay: step.delay,
            sendTime: new Date(Date.now() + step.delay).toLocaleString()
        };
    }

    async function scheduleFollowUpSequence(sequenceType, quoteId, quoteData, loInfo) {
        const sequence = generateFollowUpSequence(sequenceType, quoteData, loInfo);
        
        if (sequence.error) {
            return sequence;
        }

        // Store in Supabase if available
        if (EzraState.supabase && EZRA_TABLES_DEPLOYED) {
            try {
                const { error } = await EzraState.supabase
                    .from('ezra_follow_up_schedules')
                    .insert(sequence.messages.map(msg => ({
                        quote_id: quoteId,
                        user_id: EzraState.user?.id,
                        sequence_type: sequenceType,
                        message_id: msg.id,
                        channel: msg.channel,
                        subject: msg.subject,
                        message: msg.message,
                        scheduled_for: msg.scheduledFor,
                        status: 'pending'
                    })));
                
                if (error) throw error;
            } catch (e) {
                console.warn('Failed to save follow-up schedule:', e);
            }
        }

        // Also store in localStorage as backup
        const existing = JSON.parse(localStorage.getItem('ezraFollowUpSchedules') || '[]');
        const newSchedule = {
            quoteId: quoteId,
            type: sequenceType,
            createdAt: new Date().toISOString(),
            messages: sequence.messages
        };
        existing.push(newSchedule);
        localStorage.setItem('ezraFollowUpSchedules', JSON.stringify(existing));

        return {
            success: true,
            message: `Scheduled ${sequence.totalMessages} follow-up messages`,
            schedule: sequence
        };
    }

    // Quick command for follow-up sequences
    function showFollowUpSequenceOptions() {
        const ctx = getFormContext();
        const hasClient = ctx.clientName !== 'Borrower';
        
        if (!hasClient) {
            addMessage('assistant', 'To set up follow-up sequences, please enter a client name first. Then I can help you schedule personalized messages.', { model: 'local' });
            return;
        }

        addMessage('assistant', `
**Automated Follow-Up Sequences**

I can schedule a series of messages to keep {{clientName}} engaged. Choose a sequence:

1. **New Lead** - 4 messages over 7 days (recommended)
2. **Quote Viewed** - 2 messages after they view the quote
3. **Application Started** - 2 messages during application
4. **No Activity** - Re-engagement after 14 days

Which sequence would you like to set up?`, { model: 'local' });

        // Add quick action buttons
        setTimeout(() => {
            const btnDiv = document.createElement('div');
            btnDiv.style.cssText = 'padding:4px 12px 12px;display:flex;flex-wrap:wrap;gap:8px;';
            btnDiv.innerHTML = `
                <button onclick="window.Ezra.generateFollowUpSequence('new_lead', getFormContext(), {}).then(s => window.Ezra.scheduleFollowUps('new_lead', 'temp', getFormContext(), {}))" style="background:linear-gradient(135deg,#c5a059,#a68543);color:#0f172a;border:none;padding:8px 16px;border-radius:8px;font-weight:700;cursor:pointer;font-size:11px;">\ud83d\ude80 New Lead</button>
                <button onclick="window.Ezra.generateFollowUpSequence('quote_viewed', getFormContext(), {})" style="background:rgba(255,255,255,0.1);color:white;border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:11px;">\ud83d\udc40 Quote Viewed</button>
                <button onclick="window.Ezra.generateFollowUpSequence('application_started', getFormContext(), {})" style="background:rgba(255,255,255,0.1);color:white;border:none;padding:8px 16px;border-radius:8px;font-weight:600;cursor:pointer;font-size:11px;">\ud83d\udccb Application</button>
            `;
            document.getElementById('ezra-messages').appendChild(btnDiv);
            document.getElementById('ezra-messages').scrollTop = document.getElementById('ezra-messages').scrollHeight;
        }, 100);
    }

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

    // ============================================
    // EZRA ENHANCEMENT ROADMAP - PHASE 1-5
    // ============================================

    // ============================================
    // PHASE 1: REAL-TIME QUOTE CONTEXT AWARENESS
    // ============================================
    
    const QuoteContextWatcher = {
        _watchers: [],
        _lastContext: null,
        _suggestionShown: false,
        
        init() {
            const formFields = ['in-home-value', 'in-mortgage-balance', 'in-net-cash', 'in-client-credit', 'in-client-name', 'in-occupancy'];
            formFields.forEach(id => {
                const field = document.getElementById(id);
                if (field) {
                    field.addEventListener('change', debounce(() => this.analyzeContext(), 800));
                    field.addEventListener('blur', () => this.analyzeContext());
                }
            });
            console.debug('[Ezra] Quote Context Watcher initialized');
        },
        
        analyzeContext() {
            const ctx = getFormContext();
            if (!ctx.hasFormData) return;
            
            const suggestions = [];
            
            // CLTV Warning
            if (ctx.cltv > 80 && ctx.cltv < 85) {
                const reduction = Math.round((ctx.cltv - 80) * ctx.homeValue / 100);
                suggestions.push({
                    type: 'warning',
                    icon: '⚠️',
                    title: 'CLTV Near Limit',
                    message: `CLTV is ${ctx.cltv}%. Reducing HELOC by $${reduction.toLocaleString()} would improve pricing.`,
                    action: () => {
                        const newHeloc = ctx.helocAmount - reduction;
                        const helocField = document.getElementById('in-net-cash');
                        if (helocField) {
                            helocField.value = newHeloc;
                            helocField.dispatchEvent(new Event('change'));
                            showToast('HELOC amount adjusted for better pricing', 'success');
                        }
                    },
                    actionLabel: 'Auto-Adjust'
                });
            }
            
            // High CLTV warning
            if (ctx.cltv >= 85) {
                suggestions.push({
                    type: 'error',
                    icon: '🚫',
                    title: 'CLTV Exceeds Maximum',
                    message: `CLTV of ${ctx.cltv}% exceeds the 85% limit. This deal may require exceptions.`,
                    action: null
                });
            }
            
            // Credit score opportunity
            if (ctx.creditScore >= 740 && ctx.rate > 8.0) {
                suggestions.push({
                    type: 'opportunity',
                    icon: '💡',
                    title: 'Tier 1 Rate Opportunity',
                    message: '740+ credit score qualifies for better rates. Consider negotiating or switching tiers.',
                    action: () => {
                        const tierSelect = document.getElementById('select-tier');
                        if (tierSelect) {
                            tierSelect.value = '1';
                            tierSelect.dispatchEvent(new Event('change'));
                        }
                    },
                    actionLabel: 'Switch to Tier 1'
                });
            }
            
            // Low credit warning
            if (ctx.creditScore < 640) {
                suggestions.push({
                    type: 'warning',
                    icon: '📉',
                    title: 'Below-Prime Credit',
                    message: `Credit score of ${ctx.creditScore} may result in higher rates or require additional documentation.`,
                    action: null
                });
            }
            
            // Large loan opportunity
            if (ctx.helocAmount > 500000) {
                suggestions.push({
                    type: 'opportunity',
                    icon: '💰',
                    title: 'Jumbo HELOC Opportunity',
                    message: 'Large loan amount may qualify for custom pricing. Consider reaching out to pricing desk.',
                    action: null
                });
            }
            
            // Investment property warning
            if (ctx.occupancy === 'investment') {
                suggestions.push({
                    type: 'info',
                    icon: '🏢',
                    title: 'Investment Property',
                    message: 'Investment properties have stricter LTV limits (70% max) and may require additional reserves.',
                    action: null
                });
            }
            
            // DTI warning (if calculated)
            if (ctx.dti > 43) {
                suggestions.push({
                    type: 'warning',
                    icon: '📊',
                    title: 'High DTI Ratio',
                    message: `DTI of ${ctx.dti}% exceeds typical 43% threshold. May require manual underwriting.`,
                    action: null
                });
            }
            
            if (suggestions.length > 0 && !this._suggestionShown) {
                this.showSuggestions(suggestions);
                this._suggestionShown = true;
                // Reset after 30 seconds
                setTimeout(() => { this._suggestionShown = false; }, 30000);
            }
            
            this._lastContext = ctx;
        },
        
        showSuggestions(suggestions) {
            // Only show if Ezra is open
            if (!EzraState.isOpen) return;
            
            let html = '**💡 Smart Suggestions**\n\n';
            suggestions.forEach((s, i) => {
                html += `${s.icon} **${s.title}**\n${s.message}\n`;
                if (s.action) {
                    html += `[Quick Fix: ${s.actionLabel}]\n`;
                }
                html += '\n';
            });
            
            addMessage('assistant', html);
            
            // Store actions for later
            EzraState._pendingSuggestions = suggestions;
        }
    };

    // ============================================
    // PHASE 1: VISUAL CONFIDENCE METER
    // ============================================
    
    const ConfidenceMeter = {
        calculate(ctx) {
            let score = 100;
            const factors = [];
            const warnings = [];
            
            // CLTV impact
            if (ctx.cltv > 80) {
                score -= 15;
                factors.push({ type: 'negative', label: 'High CLTV', impact: '-15' });
                warnings.push('CLTV above 80% reduces approval confidence');
            } else if (ctx.cltv < 70) {
                score += 5;
                factors.push({ type: 'positive', label: 'Low CLTV', impact: '+5' });
            }
            
            // Credit score impact
            if (ctx.creditScore < 640) {
                score -= 25;
                factors.push({ type: 'negative', label: 'Below-prime credit', impact: '-25' });
                warnings.push('Credit score below 640 may require manual review');
            } else if (ctx.creditScore >= 740) {
                score += 10;
                factors.push({ type: 'positive', label: 'Excellent credit', impact: '+10' });
            } else if (ctx.creditScore >= 680) {
                score += 5;
                factors.push({ type: 'positive', label: 'Good credit', impact: '+5' });
            }
            
            // DTI impact
            if (ctx.dti > 43) {
                score -= 15;
                factors.push({ type: 'negative', label: 'High DTI', impact: '-15' });
                warnings.push('DTI above 43% requires exception');
            } else if (ctx.dti < 36) {
                score += 5;
                factors.push({ type: 'positive', label: 'Low DTI', impact: '+5' });
            }
            
            // Property type impact
            if (ctx.occupancy === 'investment') {
                score -= 10;
                factors.push({ type: 'negative', label: 'Investment property', impact: '-10' });
                warnings.push('Investment properties have stricter requirements');
            } else if (ctx.occupancy === 'primary') {
                score += 5;
                factors.push({ type: 'positive', label: 'Primary residence', impact: '+5' });
            }
            
            // Loan amount impact
            if (ctx.helocAmount > 500000) {
                score -= 5;
                factors.push({ type: 'negative', label: 'Jumbo loan', impact: '-5' });
            }
            
            // Ensure score stays in bounds
            score = Math.max(0, Math.min(100, score));
            
            let recommendation;
            if (score >= 80) recommendation = { level: 'Strong', color: '#10b981', icon: '✅' };
            else if (score >= 60) recommendation = { level: 'Conditional', color: '#f59e0b', icon: '⚠️' };
            else recommendation = { level: 'Review Required', color: '#ef4444', icon: '🚫' };
            
            return { score, factors, warnings, recommendation };
        },
        
        generateReport() {
            const ctx = getFormContext();
            if (!ctx.hasFormData) {
                return '**Confidence Meter**\n\nFill in quote details to see approval confidence analysis.';
            }
            
            const analysis = this.calculate(ctx);
            
            let html = `**📊 Approval Confidence: ${analysis.score}%** ${analysis.recommendation.icon}\n\n`;
            
            // Progress bar visualization
            const filled = Math.round(analysis.score / 10);
            const empty = 10 - filled;
            html += `${'█'.repeat(filled)}${'░'.repeat(empty)}\n\n`;
            
            html += `**Recommendation: ${analysis.recommendation.level}**\n\n`;
            
            if (analysis.factors.length > 0) {
                html += '**Factors:**\n';
                analysis.factors.forEach(f => {
                    const emoji = f.type === 'positive' ? '✓' : '•';
                    html += `${emoji} ${f.label} (${f.impact})\n`;
                });
                html += '\n';
            }
            
            if (analysis.warnings.length > 0) {
                html += '**Notes:**\n';
                analysis.warnings.forEach(w => {
                    html += `• ${w}\n`;
                });
            }
            
            return html;
        }
    };

    // ============================================
    // PHASE 2: SMART FOLLOW-UP SCHEDULER
    // ============================================
    
    const FollowUpEngine = {
        async analyzeEngagement(quoteId) {
            if (!EzraState.supabase) return null;
            
            try {
                // Get quote views
                const { data: views } = await EzraState.supabase
                    .from('quote_views')
                    .select('*')
                    .eq('quote_id', quoteId)
                    .order('viewed_at', { ascending: false })
                    .limit(25);
                
                // Get quote data
                const { data: quote } = await EzraState.supabase
                    .from('quote_links')
                    .select('*, leads(*)')
                    .eq('id', quoteId)
                    .limit(1)
                    .single();
                
                if (!quote) return null;
                
                const viewCount = views?.length || 0;
                const lastView = views?.[0];
                const daysSinceView = lastView ? 
                    (Date.now() - new Date(lastView.viewed_at)) / (1000 * 60 * 60 * 24) : null;
                
                return {
                    viewCount,
                    lastView,
                    daysSinceView,
                    quote,
                    isHot: viewCount >= 3 && daysSinceView !== null && daysSinceView < 2,
                    isStale: daysSinceView !== null && daysSinceView > 7,
                    neverOpened: viewCount === 0
                };
            } catch (e) {
                console.error('[Ezra] Follow-up analysis error:', e);
                return null;
            }
        },
        
        async scheduleSmartFollowUp(quoteId) {
            const engagement = await this.analyzeEngagement(quoteId);
            if (!engagement) return null;
            
            let strategy;
            
            if (engagement.neverOpened) {
                strategy = {
                    type: 'email',
                    timing: '24_hours',
                    priority: 'medium',
                    subject: `Your HELOC quote is ready`,
                    template: 'no_open',
                    message: `Hi ${engagement.quote.leads?.first_name || 'there'},\n\nI prepared your HELOC quote. Check it out and let me know if you have questions!`
                };
            } else if (engagement.isHot) {
                strategy = {
                    type: 'call',
                    timing: '4_hours',
                    priority: 'high',
                    template: 'hot_lead',
                    script: `Hi ${engagement.quote.leads?.first_name}, this is ${window.currentUserName || 'your loan officer'}. I see you've been reviewing your HELOC quote. Do you have any questions I can answer?`,
                    message: `🔥 Hot lead! ${engagement.quote.leads?.first_name} has viewed the quote ${engagement.viewCount} times. Call within 4 hours for best results.`
                };
            } else if (engagement.isStale) {
                strategy = {
                    type: 'email',
                    timing: 'immediate',
                    priority: 'medium',
                    subject: 'Rates have changed - updated quote available',
                    template: 're_engagement',
                    message: `Hi ${engagement.quote.leads?.first_name},\n\nIt's been a while since you viewed your quote. Rates may have changed - let's get you an updated proposal.`
                };
            } else {
                strategy = {
                    type: 'email',
                    timing: '3_days',
                    priority: 'low',
                    template: 'standard_follow_up'
                };
            }
            
            // Store in database
            if (EzraState.supabase && strategy) {
                await EzraState.supabase.from('ezra_follow_up_schedules').insert({
                    quote_id: quoteId,
                    user_id: EzraState.user?.id,
                    strategy: strategy,
                    scheduled_for: new Date(Date.now() + this.parseTiming(strategy.timing)),
                    status: 'scheduled'
                });
            }
            
            return strategy;
        },
        
        parseTiming(timing) {
            const map = {
                'immediate': 0,
                '4_hours': 4 * 60 * 60 * 1000,
                '24_hours': 24 * 60 * 60 * 1000,
                '3_days': 3 * 24 * 60 * 60 * 1000,
                '7_days': 7 * 24 * 60 * 60 * 1000
            };
            return map[timing] || map['3_days'];
        },
        
        generateFollowUpBriefing() {
            // This would be called to show scheduled follow-ups in Ezra
            return '**📅 Follow-Up Schedule**\n\nSmart follow-up scheduling is active. Ezra will analyze quote engagement and recommend the best follow-up timing.';
        }
    };

    // ============================================
    // PHASE 3: VOICE COMMANDS FOR SETTINGS
    // ============================================
    
    const VoiceCommands = {
        patterns: {
            updateSetting: /(?:set|change|update)\s+(?:the\s+)?(\w+(?:\s+\w+)*)\s+(?:to|as|at)\s+(.+)/i,
            createQuote: /(?:create|make|build)\s+(?:a\s+)?quote\s+(?:for\s+)?(.+)/i,
            adjustField: /(?:increase|decrease|change|adjust)\s+(?:the\s+)?(\w+(?:\s+\w+)*)\s+(?:by\s+)?(.+)/i,
            sendQuote: /(?:send|email|text)\s+(?:the\s+)?quote\s+(?:to\s+)?(.+)/i,
            showConfidence: /(?:show|display|what\s+is)\s+(?:my\s+)?(?:confidence|approval|score)/i,
            analyzeDeal: /(?:analyze|review|check)\s+(?:this\s+)?deal/i,
            scheduleFollowUp: /(?:schedule|set\s+up)\s+(?:a\s+)?follow[-\s]?up/i
        },
        
        handlers: {
            updateSetting(match) {
                const [_, setting, value] = match;
                return EzraSettings.update(setting.trim(), value.trim());
            },
            
            createQuote(match) {
                const [_, params] = match;
                return EzraQuoteBuilder.fromVoice(params.trim());
            },
            
            adjustField(match) {
                const [_, field, adjustment] = match;
                return EzraFormController.adjust(field.trim(), adjustment.trim());
            },
            
            sendQuote(match) {
                const [_, recipient] = match;
                return { success: true, action: 'send_quote', recipient: recipient.trim() };
            },
            
            showConfidence() {
                return { success: true, action: 'show_confidence', content: ConfidenceMeter.generateReport() };
            },
            
            analyzeDeal() {
                QuoteContextWatcher.analyzeContext();
                return { success: true, action: 'analyze_deal' };
            },
            
            scheduleFollowUp() {
                return { success: true, action: 'schedule_followup', content: FollowUpEngine.generateFollowUpBriefing() };
            }
        },
        
        process(transcript) {
            for (const [command, pattern] of Object.entries(this.patterns)) {
                const match = transcript.match(pattern);
                if (match) {
                    console.debug('[Ezra] Voice command detected:', command);
                    return this.handlers[command](match);
                }
            }
            return null;
        }
    };

    // Settings Controller
    const EzraSettings = {
        settingMap: {
            'origination fee': { field: 'default-origination-fee', type: 'number', section: 'pricing' },
            'tier': { field: 'default-tier', type: 'select', section: 'pricing' },
            'draw period': { field: 'default-draw-period', type: 'number', section: 'pricing' },
            'company name': { field: 'lo-company', type: 'text', section: 'profile' },
            'lender name': { field: 'wl-lender-name', type: 'text', section: 'white-label' },
            'logo': { field: 'company-logo-url', type: 'url', section: 'white-label' },
            'review link': { field: 'lo-review-link', type: 'url', section: 'profile' },
            'calendar link': { field: 'lo-calendar', type: 'url', section: 'profile' },
            'apply link': { field: 'lo-apply', type: 'url', section: 'profile' }
        },
        
        update(setting, value) {
            const config = this.settingMap[setting.toLowerCase()];
            if (!config) {
                return { success: false, error: `Unknown setting: "${setting}". Try: origination fee, tier, company name, etc.` };
            }
            
            const field = document.getElementById(config.field);
            if (!field) {
                return { success: false, error: `Setting field not found: ${config.field}` };
            }
            
            // Validate and convert value
            let processedValue = value;
            if (config.type === 'number') {
                processedValue = parseFloat(value.replace(/[^0-9.]/g, ''));
                if (isNaN(processedValue)) {
                    return { success: false, error: `Invalid number: ${value}` };
                }
            }
            
            // Update field
            field.value = processedValue;
            field.dispatchEvent(new Event('change'));
            
            // Auto-save if function exists
            if (typeof autoSave === 'function') {
                autoSave();
            }
            
            return { success: true, message: `Updated ${setting} to ${processedValue}`, setting: config };
        },
        
        getCurrentSettings() {
            const settings = {};
            Object.entries(this.settingMap).forEach(([key, config]) => {
                const field = document.getElementById(config.field);
                if (field) {
                    settings[key] = field.value;
                }
            });
            return settings;
        }
    };

    // Quote Builder from Voice
    const EzraQuoteBuilder = {
        fromVoice(params) {
            // Parse natural language like "John Smith 500k house 200k mortgage"
            const nameMatch = params.match(/([A-Z][a-z]+\s+[A-Z][a-z]+)/);
            const homeValueMatch = params.match(/(\d+(?:\.\d+)?)\s*(k|K|000)?\s*(?:house|home|property|value)/i);
            const mortgageMatch = params.match(/(\d+(?:\.\d+)?)\s*(k|K|000)?\s*(?:mortgage|balance|owe)/i);
            const helocMatch = params.match(/(\d+(?:\.\d+)?)\s*(k|K|000)?\s*(?:heloc|cash|equity|line)/i);
            
            const result = {
                success: true,
                action: 'create_quote',
                fields: {}
            };
            
            if (nameMatch) {
                result.fields.clientName = nameMatch[1];
            }
            
            if (homeValueMatch) {
                let val = parseFloat(homeValueMatch[1]);
                if (homeValueMatch[2] || homeValueMatch[0].toLowerCase().includes('k')) {
                    val *= 1000;
                }
                result.fields.homeValue = val;
            }
            
            if (mortgageMatch) {
                let val = parseFloat(mortgageMatch[1]);
                if (mortgageMatch[2] || mortgageMatch[0].toLowerCase().includes('k')) {
                    val *= 1000;
                }
                result.fields.mortgageBalance = val;
            }
            
            if (helocMatch) {
                let val = parseFloat(helocMatch[1]);
                if (helocMatch[2] || helocMatch[0].toLowerCase().includes('k')) {
                    val *= 1000;
                }
                result.fields.helocAmount = val;
            }
            
            // Apply to form
            this.applyToForm(result.fields);
            
            result.message = `Created quote for ${result.fields.clientName || 'new client'}`;
            return result;
        },
        
        applyToForm(fields) {
            if (fields.clientName) {
                const field = document.getElementById('in-client-name');
                if (field) field.value = fields.clientName;
            }
            if (fields.homeValue) {
                const field = document.getElementById('in-home-value');
                if (field) field.value = fields.homeValue;
            }
            if (fields.mortgageBalance) {
                const field = document.getElementById('in-mortgage-balance');
                if (field) field.value = fields.mortgageBalance;
            }
            if (fields.helocAmount) {
                const field = document.getElementById('in-net-cash');
                if (field) field.value = fields.helocAmount;
            }
            
            // Trigger change events
            Object.keys(fields).forEach(key => {
                const fieldId = {
                    clientName: 'in-client-name',
                    homeValue: 'in-home-value',
                    mortgageBalance: 'in-mortgage-balance',
                    helocAmount: 'in-net-cash'
                }[key];
                
                if (fieldId) {
                    const field = document.getElementById(fieldId);
                    if (field) field.dispatchEvent(new Event('change'));
                }
            });
            
            if (typeof autoSave === 'function') autoSave();
        }
    };

    // Form Controller
    const EzraFormController = {
        adjust(field, adjustment) {
            const fieldMap = {
                'heloc': 'in-net-cash',
                'heloc amount': 'in-net-cash',
                'cash': 'in-net-cash',
                'home value': 'in-home-value',
                'property value': 'in-home-value',
                'mortgage': 'in-mortgage-balance',
                'mortgage balance': 'in-mortgage-balance'
            };
            
            const fieldId = fieldMap[field.toLowerCase()];
            if (!fieldId) {
                return { success: false, error: `Unknown field: ${field}` };
            }
            
            const fieldEl = document.getElementById(fieldId);
            if (!fieldEl) {
                return { success: false, error: `Field not found: ${fieldId}` };
            }
            
            const currentValue = parseFloat(fieldEl.value) || 0;
            let adjustmentValue = parseFloat(adjustment.replace(/[^0-9.-]/g, ''));
            
            if (adjustment.toLowerCase().includes('k')) {
                adjustmentValue *= 1000;
            }
            
            const isIncrease = /increase|raise|add|more/i.test(adjustment);
            const isDecrease = /decrease|lower|reduce|less/i.test(adjustment);
            
            let newValue;
            if (isIncrease) {
                newValue = currentValue + adjustmentValue;
            } else if (isDecrease) {
                newValue = currentValue - adjustmentValue;
            } else {
                // Just set the value
                newValue = adjustmentValue;
            }
            
            fieldEl.value = Math.max(0, newValue);
            fieldEl.dispatchEvent(new Event('change'));
            
            if (typeof autoSave === 'function') autoSave();
            
            return { success: true, message: `Adjusted ${field} to ${newValue.toLocaleString()}` };
        }
    };

    // ============================================
    // PHASE 4: PREDICTIVE DEAL SCORING
    // ============================================
    
    const DealIntelligence = {
        async scoreDeal(quoteData) {
            if (!EzraState.supabase) {
                return { error: 'Supabase not connected' };
            }
            
            try {
                // Get similar closed deals
                const { data: similarDeals } = await EzraState.supabase
                    .from('quote_links')
                    .select('*, leads(credit_score)')
                    .eq('user_id', EzraState.user?.id)
                    .eq('status', 'closed')
                    .gte('heloc_amount', quoteData.helocAmount * 0.8)
                    .lte('heloc_amount', quoteData.helocAmount * 1.2)
                    .limit(50);
                
                const closedDeals = similarDeals?.filter(d => d.status === 'closed') || [];
                const closeRate = closedDeals.length / (similarDeals?.length || 1);
                
                // Calculate average time to close
                const avgTimeToClose = this.calculateAverageTime(closedDeals);
                
                // Generate recommendations
                const recommendations = this.generateRecommendations(quoteData, closedDeals);
                
                return {
                    closeProbability: Math.round(closeRate * 100),
                    avgTimeToClose,
                    similarDealsCount: similarDeals?.length || 0,
                    recommendations,
                    confidence: ConfidenceMeter.calculate(quoteData)
                };
            } catch (e) {
                console.error('[Ezra] Deal scoring error:', e);
                return { error: e.message };
            }
        },
        
        calculateAverageTime(deals) {
            if (!deals || deals.length === 0) return null;
            
            const times = deals.map(d => {
                const created = new Date(d.created_at);
                const closed = d.closed_at ? new Date(d.closed_at) : new Date();
                return closed - created;
            });
            
            const avg = times.reduce((a, b) => a + b, 0) / times.length;
            return Math.round(avg / (1000 * 60 * 60 * 24)); // Convert to days
        },
        
        generateRecommendations(quoteData, similarDeals) {
            const recommendations = [];
            
            // Rate recommendation
            const avgRate = similarDeals.reduce((sum, d) => sum + (d.rate || 0), 0) / (similarDeals.length || 1);
            if (quoteData.rate > avgRate + 0.5) {
                recommendations.push({
                    priority: 'high',
                    action: 'Price Match',
                    message: `Your rate is ${(quoteData.rate - avgRate).toFixed(2)}% above average for similar deals. Consider matching.`
                });
            }
            
            // Best day to contact
            const dayCounts = {};
            similarDeals.forEach(d => {
                const day = new Date(d.created_at).getDay();
                dayCounts[day] = (dayCounts[day] || 0) + 1;
            });
            const bestDay = Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0];
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            if (bestDay) {
                recommendations.push({
                    priority: 'low',
                    action: 'Timing',
                    message: `Best day to follow up: ${days[bestDay[0]]} (based on your closed deals)`
                });
            }
            
            return recommendations;
        },
        
        async generateReport() {
            const ctx = getFormContext();
            if (!ctx.hasFormData) {
                return '**Deal Intelligence**\n\nFill in quote details to see predictive analytics.';
            }
            
            const score = await this.scoreDeal(ctx);
            if (score.error) {
                return `**Deal Intelligence**\n\nUnable to load analytics: ${score.error}`;
            }
            
            let html = '**🎯 Deal Intelligence Report**\n\n';
            html += `**Close Probability: ${score.closeProbability}%**\n`;
            html += `Based on ${score.similarDealsCount} similar deals\n\n`;
            
            if (score.avgTimeToClose) {
                html += `**Avg Time to Close: ${score.avgTimeToClose} days**\n\n`;
            }
            
            if (score.recommendations?.length > 0) {
                html += '**Recommendations:**\n';
                score.recommendations.forEach(r => {
                    const priorityEmoji = r.priority === 'high' ? '🔴' : r.priority === 'medium' ? '🟡' : '🟢';
                    html += `${priorityEmoji} **${r.action}:** ${r.message}\n`;
                });
            }
            
            return html;
        }
    };

    // Learning Engine
    const EzraLearning = {
        async analyzeSuccessPatterns() {
            if (!EzraState.supabase) return null;
            
            try {
                const { data: myDeals } = await EzraState.supabase
                    .from('quote_links')
                    .select('*')
                    .eq('user_id', EzraState.user?.id)
                    .eq('status', 'closed')
                    .limit(100);
                
                if (!myDeals || myDeals.length === 0) {
                    return { message: 'No closed deals yet to analyze.' };
                }
                
                // Find patterns
                const patterns = {
                    totalClosed: myDeals.length,
                    avgHelocAmount: myDeals.reduce((sum, d) => sum + (d.heloc_amount || 0), 0) / myDeals.length,
                    avgRate: myDeals.reduce((sum, d) => sum + (d.rate || 0), 0) / myDeals.length,
                    commonTerms: this.findMostCommon(myDeals.map(d => d.term)),
                    bestDays: this.findBestDays(myDeals)
                };
                
                return patterns;
            } catch (e) {
                console.error('[Ezra] Learning analysis error:', e);
                return null;
            }
        },
        
        findMostCommon(arr) {
            const counts = {};
            arr.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
            return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([v]) => v);
        },
        
        findBestDays(deals) {
            const dayCounts = {};
            deals.forEach(d => {
                const day = new Date(d.created_at).getDay();
                dayCounts[day] = (dayCounts[day] || 0) + 1;
            });
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            return Object.entries(dayCounts)
                .sort((a, b) => b[1] - a[1])
                .map(([day, count]) => ({ day: days[day], count }));
        },
        
        async personalizeForLO() {
            const patterns = await this.analyzeSuccessPatterns();
            if (!patterns) return null;
            
            if (patterns.message) {
                return patterns.message;
            }
            
            let html = '**📈 Your Performance Insights**\n\n';
            html += `**${patterns.totalClosed} deals closed**\n`;
            html += `Average loan: $${Math.round(patterns.avgHelocAmount).toLocaleString()}\n`;
            html += `Average rate: ${patterns.avgRate.toFixed(2)}%\n\n`;
            
            if (patterns.commonTerms?.length > 0) {
                html += `**Most common terms:** ${patterns.commonTerms.slice(0, 3).join(', ')} years\n`;
            }
            
            if (patterns.bestDays?.length > 0) {
                html += `**Best days:** ${patterns.bestDays.slice(0, 3).map(d => d.day).join(', ')}\n`;
            }
            
            return html;
        }
    };

    // ============================================
    // PHASE 5: TEAM INTELLIGENCE
    // ============================================
    
    const TeamIntelligence = {
        async getWinningStrategies(dealType) {
            if (!EzraState.supabase) return null;
            
            try {
                // This would need a team/company ID - using user_id as proxy for now
                const { data: teamDeals } = await EzraState.supabase
                    .from('quote_links')
                    .select('*, user_id, leads(credit_score)')
                    .eq('status', 'closed')
                    .limit(50);
                
                if (!teamDeals || teamDeals.length === 0) {
                    return { message: 'No team data available yet.' };
                }
                
                // Group by LO
                const byLO = {};
                teamDeals.forEach(d => {
                    if (!byLO[d.user_id]) byLO[d.user_id] = [];
                    byLO[d.user_id].push(d);
                });
                
                // Find top performer
                const topPerformer = Object.entries(byLO)
                    .sort((a, b) => b[1].length - a[1].length)[0];
                
                return {
                    topPerformer: topPerformer ? { id: topPerformer[0], deals: topPerformer[1].length } : null,
                    totalTeamDeals: teamDeals.length,
                    avgDealSize: teamDeals.reduce((sum, d) => sum + (d.heloc_amount || 0), 0) / teamDeals.length
                };
            } catch (e) {
                console.error('[Ezra] Team intelligence error:', e);
                return null;
            }
        },
        
        async generateTeamReport() {
            const intel = await this.getWinningStrategies();
            if (!intel) return 'Team intelligence not available.';
            if (intel.message) return intel.message;
            
            let html = '**👥 Team Intelligence**\n\n';
            html += `**${intel.totalTeamDeals} total team deals**\n`;
            html += `Average deal size: $${Math.round(intel.avgDealSize).toLocaleString()}\n\n`;
            
            if (intel.topPerformer) {
                html += `Top performer: ${intel.topPerformer.deals} deals closed\n`;
            }
            
            return html;
        }
    };

    // ============================================
    // PHASE 5: WORKFLOW AUTOMATION
    // ============================================
    
    const EzraAutomation = {
        triggers: {
            async 'new_lead_from_facebook'(lead) {
                // Auto-create quote template
                const quote = await EzraQuoteBuilder.fromVoice(`${lead.first_name} ${lead.last_name} Facebook lead`);
                
                // Send intro email
                return {
                    action: 'facebook_lead_auto',
                    quote,
                    message: `Auto-created quote for Facebook lead: ${lead.first_name} ${lead.last_name}`
                };
            },
            
            async 'quote_viewed_3_times'(quote) {
                // Alert LO
                return {
                    action: 'hot_lead_alert',
                    priority: 'high',
                    message: `🔥 Hot lead! ${quote.borrowerName} viewed quote 3 times. Call now!`
                };
            },
            
            async 'rate_drop'(newRate) {
                return {
                    action: 'rate_drop_alert',
                    message: `Rates dropped to ${newRate}%. Check eligible quotes for rate updates.`
                };
            }
        },
        
        async processTrigger(triggerName, data) {
            const handler = this.triggers[triggerName];
            if (!handler) {
                console.warn('[Ezra] Unknown automation trigger:', triggerName);
                return null;
            }
            
            try {
                const result = await handler(data);
                console.debug('[Ezra] Automation triggered:', triggerName, result);
                return result;
            } catch (e) {
                console.error('[Ezra] Automation error:', e);
                return null;
            }
        }
    };

    // ============================================
    // UTILITY: Debounce function
    // ============================================
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // ============================================
    // INITIALIZE ENHANCEMENTS
    // ============================================
    
    // Initialize quote context watcher after a delay
    setTimeout(() => {
        QuoteContextWatcher.init();
    }, 3000);
    
    // Add new quick commands for the enhancements
    const ENHANCED_COMMANDS = [
        { label: 'Confidence', icon: '📊', action: 'show_confidence', prompt: 'Show my approval confidence meter' },
        { label: 'Deal Intel', icon: '🎯', action: 'deal_intelligence', prompt: 'Generate deal intelligence report' },
        { label: 'My Stats', icon: '📈', action: 'my_stats', prompt: 'Show my performance insights' },
        { label: 'Team Stats', icon: '👥', action: 'team_stats', prompt: 'Show team intelligence' }
    ];
    
    // Merge with existing commands
    if (typeof EZRA_CONFIG !== 'undefined') {
        EZRA_CONFIG.quickCommands.push(...ENHANCED_COMMANDS);
    }
    
    // Handle new quick commands — guard against undefined modules
    const originalHandleQuickCommand = typeof handleQuickCommand === 'function' ? handleQuickCommand : null;
    handleQuickCommand = function(action) {
        switch (action) {
            case 'show_confidence':
                if (typeof ConfidenceMeter !== 'undefined' && ConfidenceMeter.generateReport) {
                    addMessage('assistant', ConfidenceMeter.generateReport());
                } else {
                    addMessage('assistant', '**Confidence Meter** is coming soon! This feature will analyze your quote\'s approval probability based on CLTV, credit score, DTI, and program fit.');
                }
                return;
            case 'deal_intelligence':
                if (typeof DealIntelligence !== 'undefined' && DealIntelligence.generateReport) {
                    DealIntelligence.generateReport().then(report => addMessage('assistant', report));
                } else {
                    addMessage('assistant', '**Deal Intelligence** is coming soon! This feature will provide AI-driven insights on deal structure optimization and competitive positioning.');
                }
                return;
            case 'my_stats':
                if (typeof EzraLearning !== 'undefined' && EzraLearning.personalizeForLO) {
                    EzraLearning.personalizeForLO().then(report => addMessage('assistant', report));
                } else {
                    addMessage('assistant', '**Performance Insights** is coming soon! This feature will show your quote conversion rates, average deal size, and closing patterns.');
                }
                return;
            case 'team_stats':
                if (typeof TeamIntelligence !== 'undefined' && TeamIntelligence.generateTeamReport) {
                    TeamIntelligence.generateTeamReport().then(report => addMessage('assistant', report));
                } else {
                    addMessage('assistant', '**Team Intelligence** is coming soon! This feature will show team-level metrics and performance benchmarks.');
                }
                return;
        }
        if (originalHandleQuickCommand) return originalHandleQuickCommand(action);
    };
    
    // Enhance voice recognition with command processing
    const originalVoiceOnResult = _voiceRecognition?.onresult;
    
    console.debug('[Ezra] Enhancement Suite loaded - Phases 1-5 active');

})();
