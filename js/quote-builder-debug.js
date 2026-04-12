/**
 * Quote Builder Debug Helper
 * Run these commands in browser console to test auto-fill
 */

// Test lead data
const testLead = {
    id: 999,
    name: 'Test Client',
    phone: '(555) 999-8888',
    email: 'test@example.com',
    creditScore: 760,
    amount: 100000,
    purpose: 'Kitchen remodel',
    address: '123 Test St, Los Angeles, CA 90210',
    propertyValue: 750000,
    mortgageBalance: 350000
};

// Debug function to check field values
function checkFieldValues() {
    console.log('=== Field Values ===');
    console.log('Step 1:');
    console.log('  Name:', document.getElementById('qb-client-name')?.value);
    console.log('  Phone:', document.getElementById('qb-client-phone')?.value);
    console.log('  Credit:', document.getElementById('qb-client-credit')?.value);
    console.log('  Cash:', document.getElementById('qb-cash-needed')?.value);
    
    console.log('Step 2:');
    console.log('  Address:', document.getElementById('qb-property-address')?.value);
    console.log('  Value:', document.getElementById('qb-property-value')?.value);
    console.log('  Mortgage:', document.getElementById('qb-mortgage-balance')?.value);
    
    console.log('State:');
    console.log('  preFilledProperty:', window.QuoteBuilderV2?.getState()?.preFilledProperty);
}

// Test auto-fill manually
function testAutoFill() {
    console.log('Testing auto-fill with:', testLead);
    
    // Set pre-filled data
    const state = window.QuoteBuilderV2?.getState();
    if (state) {
        state.preFilledProperty = {
            address: testLead.address,
            value: testLead.propertyValue,
            mortgage: testLead.mortgageBalance
        };
    }
    
    // Try to fill fields
    window.QuoteBuilderV2?.fillStep2Fields?.(testLead);
    
    // Check results
    setTimeout(checkFieldValues, 200);
}

// Force fill Step 2
function forceFillStep2() {
    const preFilled = window.QuoteBuilderV2?.getState()?.preFilledProperty;
    if (!preFilled) {
        console.log('No pre-filled data found');
        return;
    }
    
    console.log('Force filling Step 2 with:', preFilled);
    
    const addressField = document.getElementById('qb-property-address');
    if (addressField && preFilled.address) {
        addressField.value = preFilled.address;
        console.log('Filled address:', preFilled.address);
    }
    
    const valueField = document.getElementById('qb-property-value');
    if (valueField && preFilled.value) {
        valueField.value = preFilled.value;
        console.log('Filled value:', preFilled.value);
    }
    
    const mortgageField = document.getElementById('qb-mortgage-balance');
    if (mortgageField && preFilled.mortgage !== undefined) {
        mortgageField.value = preFilled.mortgage;
        console.log('Filled mortgage:', preFilled.mortgage);
    }
}

// Expose debug functions
window.QBDebug = {
    testLead,
    checkFieldValues,
    testAutoFill,
    forceFillStep2
};

console.log('QBDebug loaded. Run:');
console.log('  QBDebug.checkFieldValues() - Check current field values');
console.log('  QBDebug.testAutoFill() - Test auto-fill with sample lead');
console.log('  QBDebug.forceFillStep2() - Force fill Step 2 fields');
