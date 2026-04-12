/**
 * Quote Builder Presentation Mode
 * Phase 3: Full-screen client-facing presentation for screen sharing
 */

(function() {
    'use strict';

    // Presentation State
    let presState = {
        isActive: false,
        currentSlide: 0,
        totalSlides: 6,
        quoteData: null,
        clientData: null
    };

    // Slide definitions
    const SLIDES = [
        { id: 'welcome', title: 'Welcome', render: renderWelcomeSlide },
        { id: 'property', title: 'Your Property', render: renderPropertySlide },
        { id: 'recommendation', title: 'Our Recommendation', render: renderRecommendationSlide },
        { id: 'comparison', title: 'Comparison', render: renderComparisonSlide },
        { id: 'nextsteps', title: 'Next Steps', render: renderNextStepsSlide },
        { id: 'contact', title: 'Contact', render: renderContactSlide }
    ];

    // Initialize presentation system
    function initPresentation() {
        console.log('📺 Presentation Mode initialized');
        addKeyboardListeners();
    }

    // Add keyboard listeners
    function addKeyboardListeners() {
        document.addEventListener('keydown', (e) => {
            if (!presState.isActive) return;
            
            switch (e.key) {
                case 'ArrowRight':
                case 'ArrowDown':
                case ' ':
                    e.preventDefault();
                    nextSlide();
                    break;
                case 'ArrowLeft':
                case 'ArrowUp':
                    e.preventDefault();
                    prevSlide();
                    break;
                case 'Escape':
                    e.preventDefault();
                    closePresentation();
                    break;
                case 'f':
                case 'F':
                    e.preventDefault();
                    toggleFullscreen();
                    break;
            }
        });
    }

    // Start presentation
    function startPresentation(quoteData, clientData) {
        presState.quoteData = quoteData || getQuoteDataFromBuilder();
        presState.clientData = clientData || getClientDataFromBuilder();
        presState.currentSlide = 0;
        presState.isActive = true;
        
        renderPresentation();
        enterFullscreen();
    }

    // Get quote data from QuoteBuilderV2
    function getQuoteDataFromBuilder() {
        if (window.QuoteBuilderV2?.getState) {
            const state = window.QuoteBuilderV2.getState();
            const rec = window.QuoteBuilderV2.calculateRecommendation?.() || {};
            return {
                amount: state.cashNeeded || 75000,
                tier: rec.tier || '2',
                rate: rec.rate || '6.375',
                term: rec.term || 20,
                payment: rec.payment || 400,
                orig: rec.orig || '1.5',
                totalCost: rec.totalCost || 1125
            };
        }
        
        // Fallback: get from form
        const cashField = document.getElementById('in-net-cash');
        return {
            amount: parseFloat(cashField?.value) || 75000,
            tier: '2',
            rate: '6.375',
            term: 20,
            payment: 400,
            orig: '1.5',
            totalCost: 1125
        };
    }

    // Get client data from QuoteBuilderV2
    function getClientDataFromBuilder() {
        if (window.QuoteBuilderV2?.getState) {
            const state = window.QuoteBuilderV2.getState();
            return state.clientData || {};
        }
        
        // Fallback: get from form
        const nameField = document.getElementById('in-client-name');
        return {
            name: nameField?.value || 'Valued Client',
            purpose: 'Home Improvement'
        };
    }

    // Render presentation container
    function renderPresentation() {
        // Remove existing
        const existing = document.getElementById('qb-presentation');
        if (existing) existing.remove();
        
        const container = document.createElement('div');
        container.id = 'qb-presentation';
        container.className = 'qb-presentation';
        
        container.innerHTML = `
            <div class="qb-presentation-inner">
                ${renderCurrentSlide()}
                
                <!-- Navigation -->
                <div class="qb-pres-nav">
                    <button class="qb-pres-nav-btn" onclick="window.QuoteBuilderPresentation.prevSlide()" title="Previous (Left Arrow)">
                        ←
                    </button>
                    <div class="qb-pres-progress">
                        <div class="qb-pres-progress-bar" style="width: ${((presState.currentSlide + 1) / SLIDES.length) * 100}%"></div>
                    </div>
                    <span class="qb-pres-slide-num">${presState.currentSlide + 1} / ${SLIDES.length}</span>
                    <button class="qb-pres-nav-btn" onclick="window.QuoteBuilderPresentation.nextSlide()" title="Next (Right Arrow or Space)">
                        →
                    </button>
                </div>
                
                <!-- Controls -->
                <div class="qb-pres-controls">
                    <button class="qb-pres-control" onclick="window.QuoteBuilderPresentation.toggleFullscreen()" title="Fullscreen (F)">
                        ⛶
                    </button>
                    <button class="qb-pres-control" onclick="window.QuoteBuilderPresentation.closePresentation()" title="Close (Esc)">
                        ✕
                    </button>
                </div>
                
                <!-- Hints -->
                <div class="qb-pres-hints">
                    <span>← → Navigate</span>
                    <span>F Fullscreen</span>
                    <span>Esc Close</span>
                </div>
            </div>
        `;
        
        document.body.appendChild(container);
        
        // Animate in
        requestAnimationFrame(() => {
            container.classList.add('active');
        });
    }

    // Render current slide
    function renderCurrentSlide() {
        const slide = SLIDES[presState.currentSlide];
        if (!slide) return '';
        
        return `
            <div class="qb-pres-slide" data-slide="${slide.id}">
                ${slide.render()}
            </div>
        `;
    }

    // Slide 1: Welcome
    function renderWelcomeSlide() {
        const client = presState.clientData;
        const quote = presState.quoteData;
        const firstName = client.name?.split(' ')[0] || 'there';
        
        return `
            <div class="qb-pres-welcome">
                <div class="qb-pres-logo">
                    <img src="/above-all-crm-logo.svg" alt="Above All">
                </div>
                <h1>Hi ${firstName}!</h1>
                <p class="qb-pres-subtitle">Your Personalized HELOC Proposal</p>
                <div class="qb-pres-purpose">
                    <span class="qb-pres-purpose-icon">🏠</span>
                    <span>For: ${client.purpose || 'Your Project'}</span>
                </div>
                <div class="qb-pres-amount-preview">
                    <span class="qb-pres-label">Access up to</span>
                    <span class="qb-pres-big-number">$${quote.amount.toLocaleString()}</span>
                </div>
                <p class="qb-pres-hint">Press space or click → to continue</p>
            </div>
        `;
    }

    // Slide 2: Property
    function renderPropertySlide() {
        const client = presState.clientData;
        const value = client.propertyValue || 650000;
        const mortgage = client.mortgageBalance || 320000;
        const equity = value - mortgage;
        const ltv = ((mortgage / value) * 100).toFixed(1);
        
        return `
            <div class="qb-pres-property">
                <h2>Your Property</h2>
                <div class="qb-pres-address">${client.propertyAddress || 'Your Home'}</div>
                
                <div class="qb-pres-property-grid">
                    <div class="qb-pres-property-card">
                        <span class="qb-pres-card-label">Estimated Value</span>
                        <span class="qb-pres-card-value">$${value.toLocaleString()}</span>
                    </div>
                    <div class="qb-pres-property-card">
                        <span class="qb-pres-card-label">Current Mortgage</span>
                        <span class="qb-pres-card-value">$${mortgage.toLocaleString()}</span>
                    </div>
                    <div class="qb-pres-property-card highlight">
                        <span class="qb-pres-card-label">Available Equity</span>
                        <span class="qb-pres-card-value">$${equity.toLocaleString()}</span>
                    </div>
                    <div class="qb-pres-property-card">
                        <span class="qb-pres-card-label">Current LTV</span>
                        <span class="qb-pres-card-value">${ltv}%</span>
                    </div>
                </div>
                
                <div class="qb-pres-equity-bar">
                    <div class="qb-pres-equity-mortgage" style="width: ${ltv}%"></div>
                    <div class="qb-pres-equity-available" style="width: ${Math.min(85 - parseFloat(ltv), 100 - parseFloat(ltv))}%"></div>
                </div>
                <div class="qb-pres-equity-legend">
                    <span><span class="qb-pres-legend-dot mortgage"></span> Mortgage (${ltv}%)</span>
                    <span><span class="qb-pres-legend-dot available"></span> Available Equity</span>
                    <span><span class="qb-pres-legend-dot remaining"></span> Remaining</span>
                </div>
            </div>
        `;
    }

    // Slide 3: Recommendation
    function renderRecommendationSlide() {
        const quote = presState.quoteData;
        const client = presState.clientData;
        const firstName = client.name?.split(' ')[0] || 'you';
        
        return `
            <div class="qb-pres-recommendation">
                <div class="qb-pres-rec-badge">Recommended for ${firstName}</div>
                
                <h2>Tier ${quote.tier} ${quote.term}-Year Fixed Rate</h2>
                
                <div class="qb-pres-rate-display">
                    <span class="qb-pres-rate-number">${quote.rate}%</span>
                    <span class="qb-pres-rate-label">Fixed Rate</span>
                </div>
                
                <div class="qb-pres-payment-highlight">
                    <span class="qb-pres-payment-label">Your Monthly Payment</span>
                    <span class="qb-pres-payment-amount">$${quote.payment}/mo</span>
                    <span class="qb-pres-payment-note">During the ${quote.term}-year draw period</span>
                </div>
                
                <div class="qb-pres-rec-details">
                    <div class="qb-pres-rec-item">
                        <span class="qb-pres-rec-label">Loan Amount</span>
                        <span class="qb-pres-rec-value">$${quote.amount.toLocaleString()}</span>
                    </div>
                    <div class="qb-pres-rec-item">
                        <span class="qb-pres-rec-label">Origination Fee</span>
                        <span class="qb-pres-rec-value">${quote.orig}% ($${quote.totalCost.toLocaleString()})</span>
                    </div>
                    <div class="qb-pres-rec-item">
                        <span class="qb-pres-rec-label">Rate Type</span>
                        <span class="qb-pres-rec-value">Fixed - Never Changes</span>
                    </div>
                </div>
                
                <div class="qb-pres-rec-why">
                    <h3>Why this works for you:</h3>
                    <ul>
                        <li>✓ Fixed rate = payment never changes</li>
                        <li>✓ ${quote.term}-year term builds equity faster</li>
                        <li>✓ Only pay interest on what you use</li>
                        <li>✓ No prepayment penalties</li>
                    </ul>
                </div>
            </div>
        `;
    }

    // Slide 4: Comparison
    function renderComparisonSlide() {
        const quote = presState.quoteData;
        
        // Calculate comparison scenarios
        const scenarios = [
            { name: 'This Quote', tier: quote.tier, rate: quote.rate, term: quote.term, payment: quote.payment, totalCost: quote.totalCost },
            { name: 'Tier 1 Option', tier: '1', rate: (parseFloat(quote.rate) - 1.25).toFixed(3), term: quote.term, payment: Math.round(quote.payment * 0.85), totalCost: Math.round(quote.amount * 0.02) },
            { name: '30-Year Term', tier: quote.tier, rate: (parseFloat(quote.rate) + 0.5).toFixed(3), term: 30, payment: Math.round(quote.payment * 0.75), totalCost: quote.totalCost }
        ];
        
        return `
            <div class="qb-pres-comparison">
                <h2>How This Compares</h2>
                
                <div class="qb-pres-compare-table">
                    <div class="qb-pres-compare-header">
                        <span>Option</span>
                        <span>Rate</span>
                        <span>Term</span>
                        <span>Payment</span>
                        <span>Total Cost</span>
                    </div>
                    ${scenarios.map((s, i) => `
                        <div class="qb-pres-compare-row ${i === 0 ? 'recommended' : ''}">
                            <span class="qb-pres-compare-name">
                                ${i === 0 ? '✓ ' : ''}${s.name}
                            </span>
                            <span class="qb-pres-compare-rate">${s.rate}%</span>
                            <span class="qb-pres-compare-term">${s.term} yr</span>
                            <span class="qb-pres-compare-payment">$${s.payment}/mo</span>
                            <span class="qb-pres-compare-cost">$${s.totalCost.toLocaleString()}</span>
                        </div>
                    `).join('')}
                </div>
                
                <div class="qb-pres-vs-alternatives">
                    <h3>Compared to Alternatives:</h3>
                    <div class="qb-pres-alt-grid">
                        <div class="qb-pres-alt-card">
                            <span class="qb-pres-alt-icon">💳</span>
                            <span class="qb-pres-alt-name">Credit Cards</span>
                            <span class="qb-pres-alt-rate">22-29%</span>
                            <span class="qb-pres-alt-savings">Save $${Math.round(quote.amount * 0.2)}/yr</span>
                        </div>
                        <div class="qb-pres-alt-card">
                            <span class="qb-pres-alt-icon">🏦</span>
                            <span class="qb-pres-alt-name">Personal Loan</span>
                            <span class="qb-pres-alt-rate">12-18%</span>
                            <span class="qb-pres-alt-savings">Save $${Math.round(quote.amount * 0.1)}/yr</span>
                        </div>
                        <div class="qb-pres-alt-card">
                            <span class="qb-pres-alt-icon">🔄</span>
                            <span class="qb-pres-alt-name">Cash-Out Refi</span>
                            <span class="qb-pres-alt-rate">Higher fees</span>
                            <span class="qb-pres-alt-savings">Save $${Math.round(quote.totalCost * 2).toLocaleString()} in fees</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Slide 5: Next Steps
    function renderNextStepsSlide() {
        return `
            <div class="qb-pres-nextsteps">
                <h2>What Happens Next?</h2>
                
                <div class="qb-pres-timeline">
                    <div class="qb-pres-timeline-item">
                        <div class="qb-pres-timeline-number">1</div>
                        <div class="qb-pres-timeline-content">
                            <h3>Apply Today</h3>
                            <p>Simple 10-minute online application</p>
                            <span class="qb-pres-timeline-time">→ 10 min</span>
                        </div>
                    </div>
                    <div class="qb-pres-timeline-item">
                        <div class="qb-pres-timeline-number">2</div>
                        <div class="qb-pres-timeline-content">
                            <h3>We Review</h3>
                            <p>Credit check and income verification</p>
                            <span class="qb-pres-timeline-time">→ 1-2 days</span>
                        </div>
                    </div>
                    <div class="qb-pres-timeline-item">
                        <div class="qb-pres-timeline-number">3</div>
                        <div class="qb-pres-timeline-content">
                            <h3>Appraisal</h3>
                            <p>Professional home valuation</p>
                            <span class="qb-pres-timeline-time">→ 3-5 days</span>
                        </div>
                    </div>
                    <div class="qb-pres-timeline-item">
                        <div class="qb-pres-timeline-number">4</div>
                        <div class="qb-pres-timeline-content">
                            <h3>Closing</h3>
                            <p>Sign documents and access funds</p>
                            <span class="qb-pres-timeline-time">→ 2-3 weeks total</span>
                        </div>
                    </div>
                </div>
                
                <div class="qb-pres-cta">
                    <p>Ready to get started? Let's make this happen!</p>
                </div>
            </div>
        `;
    }

    // Slide 6: Contact
    function renderContactSlide() {
        const client = presState.clientData;
        const quote = presState.quoteData;
        
        // Generate QR code data
        const qrData = JSON.stringify({
            name: client.name,
            amount: quote.amount,
            rate: quote.rate,
            payment: quote.payment
        });
        
        return `
            <div class="qb-pres-contact">
                <h2>Your Quote Summary</h2>
                
                <div class="qb-pres-summary-card">
                    <div class="qb-pres-summary-row">
                        <span>Amount</span>
                        <strong>$${quote.amount.toLocaleString()}</strong>
                    </div>
                    <div class="qb-pres-summary-row">
                        <span>Rate</span>
                        <strong>${quote.rate}% Fixed</strong>
                    </div>
                    <div class="qb-pres-summary-row">
                        <span>Payment</span>
                        <strong>$${quote.payment}/mo</strong>
                    </div>
                    <div class="qb-pres-summary-row">
                        <span>Term</span>
                        <strong>${quote.term} Years</strong>
                    </div>
                </div>
                
                <div class="qb-pres-qr-section">
                    <div class="qb-pres-qr-code" data-qr="${encodeURIComponent(qrData)}">
                        <!-- QR code will be generated here -->
                        <div class="qb-pres-qr-placeholder">📱</div>
                    </div>
                    <p>Scan to save this quote on your phone</p>
                </div>
                
                <div class="qb-pres-contact-info">
                    <p>Questions? Call or text anytime:</p>
                    <a href="tel:555-123-4567" class="qb-pres-phone">(555) 123-4567</a>
                    <p class="qb-pres-email">loans@aboveallcrm.com</p>
                </div>
                
                <div class="qb-pres-thanks">
                    <p>Thank you for considering Above All!</p>
                </div>
            </div>
        `;
    }

    // Navigation functions
    function nextSlide() {
        if (presState.currentSlide < SLIDES.length - 1) {
            presState.currentSlide++;
            updateSlide();
        }
    }

    function prevSlide() {
        if (presState.currentSlide > 0) {
            presState.currentSlide--;
            updateSlide();
        }
    }

    function updateSlide() {
        const slideContainer = document.querySelector('.qb-pres-slide');
        if (slideContainer) {
            slideContainer.style.opacity = '0';
            setTimeout(() => {
                slideContainer.innerHTML = renderCurrentSlide();
                slideContainer.style.opacity = '1';
                updateProgress();
            }, 200);
        }
    }

    function updateProgress() {
        const progressBar = document.querySelector('.qb-pres-progress-bar');
        const slideNum = document.querySelector('.qb-pres-slide-num');
        
        if (progressBar) {
            progressBar.style.width = `${((presState.currentSlide + 1) / SLIDES.length) * 100}%`;
        }
        if (slideNum) {
            slideNum.textContent = `${presState.currentSlide + 1} / ${SLIDES.length}`;
        }
    }

    // Fullscreen functions
    function enterFullscreen() {
        const elem = document.getElementById('qb-presentation');
        if (!elem) return;
        
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
        }
    }

    function exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }

    function toggleFullscreen() {
        if (document.fullscreenElement) {
            exitFullscreen();
        } else {
            enterFullscreen();
        }
    }

    // Close presentation
    function closePresentation() {
        presState.isActive = false;
        exitFullscreen();
        
        const container = document.getElementById('qb-presentation');
        if (container) {
            container.classList.remove('active');
            setTimeout(() => container.remove(), 300);
        }
    }

    // Expose globally
    window.QuoteBuilderPresentation = {
        init: initPresentation,
        start: startPresentation,
        nextSlide,
        prevSlide,
        closePresentation,
        toggleFullscreen,
        isActive: () => presState.isActive
    };

    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPresentation);
    } else {
        initPresentation();
    }
})();
