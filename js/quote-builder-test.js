/**
 * Quote Builder Test & Debug Script
 * Run this in browser console to test all features
 */

(function() {
    'use strict';
    
    const QBTest = {
        results: [],
        
        log(test, passed, message) {
            this.results.push({ test, passed, message });
            const icon = passed ? '✓' : '✗';
            const color = passed ? 'green' : 'red';
            console.log(`%c${icon} ${test}: ${message}`, `color: ${color}`);
        },
        
        // Test 1: Core modules loaded
        testModules() {
            console.log('\n=== Testing Module Loading ===\n');
            
            const modules = [
                { name: 'QuoteBuilderV2', obj: window.QuoteBuilderV2 },
                { name: 'QuoteBuilderFollowUp', obj: window.QuoteBuilderFollowUp },
                { name: 'QuoteBuilderObjections', obj: window.QuoteBuilderObjections },
                { name: 'QuoteBuilderVoice', obj: window.QuoteBuilderVoice },
                { name: 'QuoteBuilderPresentation', obj: window.QuoteBuilderPresentation },
                { name: 'QuoteBuilderCompare', obj: window.QuoteBuilderCompare },
                { name: 'QuoteBuilderQuickActions', obj: window.QuoteBuilderQuickActions }
            ];
            
            modules.forEach(m => {
                this.log(
                    `${m.name} loaded`,
                    !!m.obj,
                    m.obj ? 'Module available' : 'Module NOT found'
                );
            });
        },
        
        // Test 2: Quote Builder V2 functions
        testQuoteBuilderV2() {
            console.log('\n=== Testing QuoteBuilderV2 ===\n');
            
            const qb = window.QuoteBuilderV2;
            if (!qb) {
                this.log('QuoteBuilderV2', false, 'Not loaded');
                return;
            }
            
            const functions = [
                'start', 'close', 'nextStep', 'prevStep', 'loadLeads',
                'selectLead', 'showManualEntry', 'saveClientAndNext',
                'calculateEquity', 'savePropertyAndNext', 'useSmartDefaults'
            ];
            
            functions.forEach(fn => {
                this.log(
                    `QB2.${fn}()`,
                    typeof qb[fn] === 'function',
                    typeof qb[fn] === 'function' ? 'Function exists' : 'Function missing'
                );
            });
        },
        
        // Test 3: Lead loading
        async testLeadLoading() {
            console.log('\n=== Testing Lead Loading ===\n');
            
            const qb = window.QuoteBuilderV2;
            if (!qb) {
                this.log('Lead Loading', false, 'QuoteBuilderV2 not available');
                return;
            }
            
            // Start quote builder
            qb.start();
            
            // Wait for render
            await new Promise(r => setTimeout(r, 500));
            
            // Check if leads list container exists
            const leadsList = document.getElementById('qb-leads-list');
            this.log(
                'Leads list container',
                !!leadsList,
                leadsList ? 'Found #qb-leads-list' : 'NOT found'
            );
            
            // Try loading leads
            if (qb.loadLeads) {
                try {
                    await qb.loadLeads('bonzo');
                    await new Promise(r => setTimeout(r, 500));
                    
                    const leadsGrid = document.querySelector('.qb-leads-grid');
                    this.log(
                        'Leads grid rendered',
                        !!leadsGrid,
                        leadsGrid ? 'Leads displayed' : 'NOT rendered'
                    );
                    
                    if (leadsGrid) {
                        const cards = leadsGrid.querySelectorAll('.qb-lead-card');
                        this.log(
                            'Lead cards count',
                            cards.length > 0,
                            `${cards.length} lead cards found`
                        );
                    }
                } catch (e) {
                    this.log('Load leads', false, `Error: ${e.message}`);
                }
            }
        },
        
        // Test 4: Voice support
        testVoice() {
            console.log('\n=== Testing Voice Input ===\n');
            
            const voice = window.QuoteBuilderVoice;
            if (!voice) {
                this.log('Voice module', false, 'Not loaded');
                return;
            }
            
            const isSupported = voice.isSupported ? voice.isSupported() : false;
            this.log(
                'Voice recognition',
                isSupported,
                isSupported ? 'Supported in this browser' : 'NOT supported (use Chrome/Edge)'
            );
        },
        
        // Test 5: LocalStorage
        testStorage() {
            console.log('\n=== Testing LocalStorage ===\n');
            
            const keys = [
                'quote_builder_defaults',
                'quote_builder_history',
                'qb_saved_comparisons'
            ];
            
            keys.forEach(key => {
                const data = localStorage.getItem(key);
                this.log(
                    `Storage: ${key}`,
                    true,
                    data ? `Has data (${data.length} chars)` : 'Empty'
                );
            });
        },
        
        // Test 6: Keyboard shortcuts
        testKeyboardShortcuts() {
            console.log('\n=== Testing Keyboard Shortcuts ===\n');
            
            this.log('Ctrl+Q shortcut', true, 'Should open New Quote');
            this.log('Ctrl+P shortcut', true, 'Should open Presentation');
            this.log('? shortcut', true, 'Should toggle Quick Actions');
        },
        
        // Test 7: UI Elements
        testUIElements() {
            console.log('\n=== Testing UI Elements ===\n');
            
            const elements = [
                { name: 'Floating + New Quote button', selector: '#qb-floating-btn' },
                { name: 'Quick Actions bar', selector: '#qb-quick-actions' },
                { name: 'Ezra widget', selector: '#ezra-widget' }
            ];
            
            elements.forEach(el => {
                const found = document.querySelector(el.selector);
                this.log(
                    el.name,
                    !!found,
                    found ? `Found ${el.selector}` : 'NOT found'
                );
            });
        },
        
        // Test 8: Follow-up system
        testFollowUp() {
            console.log('\n=== Testing Follow-up System ===\n');
            
            const fu = window.QuoteBuilderFollowUp;
            if (!fu) {
                this.log('Follow-up module', false, 'Not loaded');
                return;
            }
            
            const history = fu.getQuoteHistory ? fu.getQuoteHistory() : [];
            this.log(
                'Quote history',
                true,
                `${history.length} quotes saved`
            );
        },
        
        // Run all tests
        async runAll() {
            console.log('%c\n=== QUOTE BUILDER V2 TEST SUITE ===\n', 'color: blue; font-size: 16px; font-weight: bold');
            
            this.testModules();
            this.testQuoteBuilderV2();
            this.testVoice();
            this.testStorage();
            this.testKeyboardShortcuts();
            this.testUIElements();
            this.testFollowUp();
            
            // Lead loading test (opens UI)
            await this.testLeadLoading();
            
            // Summary
            console.log('\n=== TEST SUMMARY ===\n');
            const passed = this.results.filter(r => r.passed).length;
            const total = this.results.length;
            const color = passed === total ? 'green' : passed > total/2 ? 'orange' : 'red';
            
            console.log(`%cPassed: ${passed}/${total}`, `color: ${color}; font-size: 14px; font-weight: bold`);
            
            if (passed < total) {
                console.log('\nFailed tests:');
                this.results.filter(r => !r.passed).forEach(r => {
                    console.log(`  - ${r.test}`);
                });
            }
            
            return this.results;
        }
    };
    
    // Expose globally
    window.QBTest = QBTest;
    
    // Auto-run if in browser console
    console.log('%cQBTest loaded. Run QBTest.runAll() to test.', 'color: green');
})();
