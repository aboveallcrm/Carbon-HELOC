# Auto-Fill Fix Summary

## Problem
When selecting a lead, Step 2 fields (address, property value, mortgage) were not populating.

## Root Cause
The `autoFillLeadData` function only filled Step 1 fields directly. Step 2 fields were stored in `preFilledProperty` but not applied when advancing to Step 2.

## Fixes Applied

### 1. Enhanced `autoFillLeadData()` Function
- Added `fillStep2Fields()` call to immediately try filling Step 2 fields
- Added console logging for debugging
- Added event dispatching (`input` and `change`) to trigger calculations

### 2. New `fillStep2Fields()` Function
- Fills address, property value, and mortgage fields
- Dispatches events to trigger equity calculation
- Can be called manually if needed

### 3. Enhanced `nextStep()` Function
- Added special handling when advancing to Step 2
- Applies `preFilledProperty` data after Step 2 renders
- Triggers equity calculation automatically

### 4. Added Debug Helper (`quote-builder-debug.js`)
Console commands for testing:
```javascript
// Check current field values
QBDebug.checkFieldValues()

// Test auto-fill with sample lead
QBDebug.testAutoFill()

// Force fill Step 2 fields
QBDebug.forceFillStep2()
```

## How It Works Now

### When Lead is Selected:
1. Lead data stored in `qbState.clientData` and `qbState.preFilledProperty`
2. `autoFillLeadData()` fills Step 1 fields immediately
3. `fillStep2Fields()` tries to fill Step 2 fields (if visible)
4. User clicks OK to continue

### When Advancing to Step 2:
1. `nextStep()` increments step and renders Step 2
2. After render, checks for `preFilledProperty` data
3. Fills address, value, mortgage fields
4. Triggers `calculateEquity()` to show equity preview

## Testing Steps

1. Open Quote Builder (Ctrl+Q)
2. Click "Bonzo"
3. Select "John Smith"
4. **Verify Step 1 filled:**
   - Name: John Smith
   - Phone: (555) 123-4567
   - Credit: 760+
   - Cash: 75000
   - Purpose: Home Improvement
5. Click OK to continue
6. **Verify Step 2 filled:**
   - Address: 123 Main St, Los Angeles, CA 90210
   - Property Value: 650000
   - Mortgage Balance: 320000
   - Equity calculation visible

## Console Debugging

If fields still don't populate:
```javascript
// Check current state
QuoteBuilderV2.getState()

// Check pre-filled data
QuoteBuilderV2.getState().preFilledProperty

// Force fill Step 2
QBDebug.forceFillStep2()

// Check field values
QBDebug.checkFieldValues()
```

## Files Modified
- `js/quote-builder-v2.js` - Auto-fill logic, nextStep enhancement
- `js/quote-builder-debug.js` - Debug helper (new)
- `AboveAllCarbon_HELOC_v12_FIXED.html` - Added debug script
