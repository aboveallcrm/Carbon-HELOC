/**
 * Quote Builder Deal Comparison Tool
 * Phase 3: Side-by-side scenario comparison and competitor analysis
 */

(function() {
    'use strict';

    // Comparison State
    let compareState = {
        scenarios: [],
        baseAmount: 75000,
        basePropertyValue: 650000,
        baseMortgage: 320000,
        activeComparison: 'tiers' // tiers, terms, competitors
    };

    // Rate data for calculations
    const RATE_DATA = {
        t1: { fixed30: 5.625, fixed20: 5.125, fixed15: 4.875, fixed10: 4.625, orig: 2.0 },
        t2: { fixed30: 6.875, fixed20: 6.375, fixed15: 6.125, fixed10: 5.875, orig: 1.5 },
        t3: { fixed30: 8.125, fixed20: 7.625, fixed15: 7.375, fixed10: 7.125, orig: 0.0 }
    };

    // Initialize comparison tool
    function initComparisonTool() {
        console.log('⚖️ Deal Comparison Tool initialized');
    }

    // Open comparison modal
    function openComparison(baseData) {
        // Get base data from quote builder or form
        compareState.baseAmount = baseData?.amount || getFormValue('in-net-cash', 75000);
        compareState.basePropertyValue = baseData?.propertyValue || getFormValue('in-home-value', 650000);
        compareState.baseMortgage = baseData?.mortgageBalance || getFormValue('in-mortgage-balance', 320000);
        
        // Generate default scenarios
        generateScenarios();
        
        renderComparisonModal();
    }

    // Get value from form
    function getFormValue(id, defaultValue) {
        const el = document.getElementById(id);
        return el ? parseFloat(el.value) || defaultValue : defaultValue;
    }

    // Generate comparison scenarios
    function generateScenarios() {
        const amount = compareState.baseAmount;
        
        compareState.scenarios = [
            // Tier comparison
            {
                id: 't1-20',
                name: 'Tier 1 - 20 Year',
                tier: '1',
                term: 20,
                rate: RATE_DATA.t1.fixed20,
                orig: RATE_DATA.t1.orig,
                payment: calculatePayment(amount, RATE_DATA.t1.fixed20, 20),
                totalCost: Math.round(amount * RATE_DATA.t1.orig / 100),
                totalInterest5yr: calculateTotalInterest(amount, RATE_DATA.t1.fixed20, 5),
                totalInterest10yr: calculateTotalInterest(amount, RATE_DATA.t1.fixed20, 10),
                apr: calculateAPR(amount, RATE_DATA.t1.fixed20, RATE_DATA.t1.orig)
            },
            {
                id: 't2-20',
                name: 'Tier 2 - 20 Year',
                tier: '2',
                term: 20,
                rate: RATE_DATA.t2.fixed20,
                orig: RATE_DATA.t2.orig,
                payment: calculatePayment(amount, RATE_DATA.t2.fixed20, 20),
                totalCost: Math.round(amount * RATE_DATA.t2.orig / 100),
                totalInterest5yr: calculateTotalInterest(amount, RATE_DATA.t2.fixed20, 5),
                totalInterest10yr: calculateTotalInterest(amount, RATE_DATA.t2.fixed20, 10),
                apr: calculateAPR(amount, RATE_DATA.t2.fixed20, RATE_DATA.t2.orig),
                recommended: true
            },
            {
                id: 't3-20',
                name: 'Tier 3 - 20 Year',
                tier: '3',
                term: 20,
                rate: RATE_DATA.t3.fixed20,
                orig: RATE_DATA.t3.orig,
                payment: calculatePayment(amount, RATE_DATA.t3.fixed20, 20),
                totalCost: Math.round(amount * RATE_DATA.t3.orig / 100),
                totalInterest5yr: calculateTotalInterest(amount, RATE_DATA.t3.fixed20, 5),
                totalInterest10yr: calculateTotalInterest(amount, RATE_DATA.t3.fixed20, 10),
                apr: calculateAPR(amount, RATE_DATA.t3.fixed20, RATE_DATA.t3.orig)
            }
        ];
    }

    // Calculate monthly payment
    function calculatePayment(amount, rate, term) {
        const monthlyRate = rate / 100 / 12;
        const numPayments = term * 12;
        if (monthlyRate === 0) return Math.round(amount / numPayments);
        const payment = amount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
        return Math.round(payment);
    }

    // Calculate total interest over years
    function calculateTotalInterest(amount, rate, years) {
        const annualInterest = amount * (rate / 100);
        return Math.round(annualInterest * years);
    }

    // Calculate APR (simplified)
    function calculateAPR(amount, rate, origFee) {
        const totalFees = amount * origFee / 100;
        const apr = rate + (totalFees / amount * 100);
        return apr.toFixed(3);
    }

    // Render comparison modal
    function renderComparisonModal() {
        const existing = document.getElementById('qb-comparison-modal');
        if (existing) existing.remove();
        
        const modal = document.createElement('div');
        modal.id = 'qb-comparison-modal';
        modal.className = 'quote-builder-overlay qb-comparison-overlay';
        
        modal.innerHTML = `
            <div class="quote-builder-modal qb-comparison-modal">
                <div class="qb-header">
                    <div class="qb-title">
                        <span class="qb-icon">⚖️</span>
                        <div>
                            <h3>Deal Comparison</h3>
                            <span class="qb-subtitle">Compare scenarios side-by-side</span>
                        </div>
                    </div>
                    <button class="qb-close" onclick="window.QuoteBuilderCompare.close()">×</button>
                </div>
                
                <div class="qb-comparison-tabs">
                    <button class="qb-tab active" onclick="window.QuoteBuilderCompare.switchTab('tiers')">
                        Compare Tiers
                    </button>
                    <button class="qb-tab" onclick="window.QuoteBuilderCompare.switchTab('terms')">
                        Compare Terms
                    </button>
                    <button class="qb-tab" onclick="window.QuoteBuilderCompare.switchTab('competitors')">
                        vs Competitors
                    </button>
                </div>
                
                <div class="qb-comparison-content">
                    ${renderComparisonTable()}
                    ${renderComparisonChart()}
                </div>
                
                <div class="qb-comparison-footer">
                    <button class="qb-btn-secondary" onclick="window.QuoteBuilderCompare.close()">Close</button>
                    <button class="qb-btn-primary" onclick="window.QuoteBuilderCompare.exportPDF()">
                        📄 Export PDF
                    </button>
                    <button class="qb-btn-primary" onclick="window.QuoteBuilderCompare.saveComparison()">
                        💾 Save Comparison
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Render chart after DOM insertion
        setTimeout(() => renderChart(), 100);
    }

    // Render comparison table
    function renderComparisonTable() {
        const scenarios = compareState.scenarios;
        
        return `
            <div class="qb-compare-table-container">
                <table class="qb-compare-table">
                    <thead>
                        <tr>
                            <th>Scenario</th>
                            ${scenarios.map(s => `
                                <th class="${s.recommended ? 'recommended' : ''}">
                                    ${s.recommended ? '✓ ' : ''}${s.name}
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Interest Rate</td>
                            ${scenarios.map(s => `
                                <td class="${s.recommended ? 'recommended' : ''}">
                                    <span class="qb-compare-rate">${s.rate}%</span>
                                </td>
                            `).join('')}
                        </tr>
                        <tr>
                            <td>Monthly Payment</td>
                            ${scenarios.map(s => `
                                <td class="${s.recommended ? 'recommended' : ''}">
                                    <span class="qb-compare-payment">$${s.payment}</span>
                                </td>
                            `).join('')}
                        </tr>
                        <tr>
                            <td>Origination Fee</td>
                            ${scenarios.map(s => `
                                <td class="${s.recommended ? 'recommended' : ''}">
                                    ${s.orig}% ($${s.totalCost.toLocaleString()})
                                </td>
                            `).join('')}
                        </tr>
                        <tr>
                            <td>APR</td>
                            ${scenarios.map(s => `
                                <td class="${s.recommended ? 'recommended' : ''}">
                                    ${s.apr}%
                                </td>
                            `).join('')}
                        </tr>
                        <tr class="qb-compare-highlight">
                            <td>5-Year Interest Cost</td>
                            ${scenarios.map(s => `
                                <td class="${s.recommended ? 'recommended' : ''}">
                                    $${s.totalInterest5yr.toLocaleString()}
                                </td>
                            `).join('')}
                        </tr>
                        <tr class="qb-compare-highlight">
                            <td>10-Year Interest Cost</td>
                            ${scenarios.map(s => `
                                <td class="${s.recommended ? 'recommended' : ''}">
                                    $${s.totalInterest10yr.toLocaleString()}
                                </td>
                            `).join('')}
                        </tr>
                    </tbody>
                </table>
                
                ${renderSavingsAnalysis()}
            </div>
        `;
    }

    // Render savings analysis
    function renderSavingsAnalysis() {
        const scenarios = compareState.scenarios;
        const base = scenarios.find(s => s.recommended) || scenarios[0];
        
        return `
            <div class="qb-savings-analysis">
                <h4>Savings vs Other Options</h4>
                <div class="qb-savings-grid">
                    ${scenarios.filter(s => s.id !== base.id).map(s => {
                        const paymentDiff = s.payment - base.payment;
                        const interestDiff5 = s.totalInterest5yr - base.totalInterest5yr;
                        const interestDiff10 = s.totalInterest10yr - base.totalInterest10yr;
                        
                        return `
                            <div class="qb-savings-card">
                                <span class="qb-savings-vs">vs ${s.name}</span>
                                <div class="qb-savings-row">
                                    <span>Monthly payment:</span>
                                    <span class="${paymentDiff > 0 ? 'positive' : 'negative'}">
                                        ${paymentDiff > 0 ? '+' : ''}$${paymentDiff}/mo
                                    </span>
                                </div>
                                <div class="qb-savings-row">
                                    <span>5-year interest:</span>
                                    <span class="${interestDiff5 > 0 ? 'positive' : 'negative'}">
                                        ${interestDiff5 > 0 ? '+' : ''}$${interestDiff5.toLocaleString()}
                                    </span>
                                </div>
                                <div class="qb-savings-row">
                                    <span>10-year interest:</span>
                                    <span class="${interestDiff10 > 0 ? 'positive' : 'negative'}">
                                        ${interestDiff10 > 0 ? '+' : ''}$${interestDiff10.toLocaleString()}
                                    </span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    // Render comparison chart
    function renderComparisonChart() {
        return `
            <div class="qb-compare-chart-container">
                <h4>Payment Comparison</h4>
                <div class="qb-compare-chart" id="qb-compare-chart">
                    <!-- Chart rendered via CSS bars -->
                    ${renderCSSChart()}
                </div>
            </div>
        `;
    }

    // Render CSS-based chart
    function renderCSSChart() {
        const scenarios = compareState.scenarios;
        const maxPayment = Math.max(...scenarios.map(s => s.payment));
        
        return `
            <div class="qb-chart-bars">
                ${scenarios.map(s => {
                    const height = (s.payment / maxPayment) * 100;
                    return `
                        <div class="qb-chart-bar-wrapper">
                            <div class="qb-chart-bar ${s.recommended ? 'recommended' : ''}" style="height: ${height}%"></div>
                            <span class="qb-chart-label">${s.name}</span>
                            <span class="qb-chart-value">$${s.payment}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    // Switch comparison tab
    function switchTab(tab) {
        compareState.activeComparison = tab;
        
        // Update tab UI
        document.querySelectorAll('.qb-comparison-tabs .qb-tab').forEach(t => {
            t.classList.remove('active');
        });
        event.target.classList.add('active');
        
        // Regenerate scenarios based on tab
        const amount = compareState.baseAmount;
        
        switch(tab) {
            case 'tiers':
                compareState.scenarios = [
                    createScenario('t1', 20, amount),
                    { ...createScenario('t2', 20, amount), recommended: true },
                    createScenario('t3', 20, amount)
                ];
                break;
            case 'terms':
                compareState.scenarios = [
                    createScenario('t2', 10, amount),
                    { ...createScenario('t2', 20, amount), recommended: true },
                    createScenario('t2', 30, amount)
                ];
                break;
            case 'competitors':
                compareState.scenarios = [
                    { ...createScenario('t2', 20, amount), recommended: true },
                    createCompetitorScenario('Cash-Out Refi', 6.5, 2.5, amount, 30),
                    createCompetitorScenario('Personal Loan', 12.0, 0, amount, 5),
                    createCompetitorScenario('Credit Cards', 24.0, 0, amount, 10)
                ];
                break;
        }
        
        // Re-render
        const content = document.querySelector('.qb-comparison-content');
        if (content) {
            content.innerHTML = renderComparisonTable() + renderComparisonChart();
            setTimeout(() => renderChart(), 100);
        }
    }

    // Create scenario helper
    function createScenario(tier, term, amount) {
        const rateData = RATE_DATA['t' + tier];
        const rate = rateData['fixed' + term];
        return {
            id: `t${tier}-${term}`,
            name: `Tier ${tier} - ${term} Year`,
            tier: tier,
            term: term,
            rate: rate,
            orig: rateData.orig,
            payment: calculatePayment(amount, rate, term),
            totalCost: Math.round(amount * rateData.orig / 100),
            totalInterest5yr: calculateTotalInterest(amount, rate, 5),
            totalInterest10yr: calculateTotalInterest(amount, rate, 10),
            apr: calculateAPR(amount, rate, rateData.orig)
        };
    }

    // Create competitor scenario
    function createCompetitorScenario(name, rate, orig, amount, term) {
        return {
            id: name.toLowerCase().replace(/\s+/g, '-'),
            name: name,
            tier: '-',
            term: term,
            rate: rate,
            orig: orig,
            payment: calculatePayment(amount, rate, term),
            totalCost: Math.round(amount * orig / 100),
            totalInterest5yr: calculateTotalInterest(amount, rate, 5),
            totalInterest10yr: calculateTotalInterest(amount, rate, 10),
            apr: calculateAPR(amount, rate, orig)
        };
    }

    // Render chart (placeholder for Chart.js integration)
    function renderChart() {
        // Could integrate Chart.js here for more advanced charts
        // For now, using CSS-based chart
    }

    // Export to PDF
    function exportPDF() {
        const modal = document.querySelector('.qb-comparison-modal');
        if (!modal) return;
        
        // Use html2canvas + jsPDF if available
        if (window.html2canvas && window.jspdf) {
            html2canvas(modal.querySelector('.qb-comparison-content')).then(canvas => {
                const imgData = canvas.toDataURL('image/png');
                const pdf = new jspdf.jsPDF('l', 'mm', 'a4');
                const pdfWidth = pdf.internal.pageSize.getWidth();
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
                pdf.save('deal-comparison.pdf');
            });
        } else {
            // Fallback: print to PDF
            window.print();
        }
    }

    // Save comparison
    function saveComparison() {
        const saved = JSON.parse(localStorage.getItem('qb_saved_comparisons') || '[]');
        const comparison = {
            id: 'comp_' + Date.now(),
            timestamp: Date.now(),
            amount: compareState.baseAmount,
            scenarios: compareState.scenarios,
            type: compareState.activeComparison
        };
        saved.push(comparison);
        localStorage.setItem('qb_saved_comparisons', JSON.stringify(saved.slice(-10))); // Keep last 10
        
        showToast('Comparison saved! 💾');
    }

    // Load saved comparison
    function loadComparison(id) {
        const saved = JSON.parse(localStorage.getItem('qb_saved_comparisons') || '[]');
        const comparison = saved.find(c => c.id === id);
        if (comparison) {
            compareState.baseAmount = comparison.amount;
            compareState.scenarios = comparison.scenarios;
            compareState.activeComparison = comparison.type;
            renderComparisonModal();
        }
    }

    // Show saved comparisons
    function showSavedComparisons() {
        const saved = JSON.parse(localStorage.getItem('qb_saved_comparisons') || '[]');
        
        if (saved.length === 0) {
            alert('No saved comparisons yet.');
            return;
        }
        
        const modal = document.createElement('div');
        modal.className = 'quote-builder-overlay';
        modal.innerHTML = `
            <div class="quote-builder-modal qb-saved-comparisons">
                <div class="qb-header">
                    <h3>Saved Comparisons</h3>
                    <button class="qb-close" onclick="this.closest('.quote-builder-overlay').remove()">×</button>
                </div>
                <div class="qb-saved-list">
                    ${saved.map(c => `
                        <div class="qb-saved-item" onclick="window.QuoteBuilderCompare.loadComparison('${c.id}')">
                            <span class="qb-saved-date">${new Date(c.timestamp).toLocaleDateString()}</span>
                            <span class="qb-saved-amount">$${c.amount.toLocaleString()}</span>
                            <span class="qb-saved-type">${c.type}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Close comparison
    function close() {
        const modal = document.getElementById('qb-comparison-modal');
        if (modal) modal.remove();
    }

    // Show toast
    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'qb-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // Expose globally
    window.QuoteBuilderCompare = {
        init: initComparisonTool,
        open: openComparison,
        close,
        switchTab,
        exportPDF,
        saveComparison,
        loadComparison,
        showSavedComparisons,
        getSaved: () => JSON.parse(localStorage.getItem('qb_saved_comparisons') || '[]')
    };

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initComparisonTool);
    } else {
        initComparisonTool();
    }
})();
