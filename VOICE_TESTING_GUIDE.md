# Voice Input Testing Guide

## Browser Support
- **Chrome**: ✓ Full support
- **Edge**: ✓ Full support  
- **Safari**: ✗ Not supported
- **Firefox**: ✗ Not supported

## How to Test Voice Input

### Method 1: Using the Microphone Button
1. Open Quote Builder (Ctrl+Q)
2. Look for 🎤 button in top right of modal
3. **Hold down** the button and speak
4. Release to execute command
5. Watch for toast confirmation

### Method 2: Console Testing (No Microphone Needed)
Open browser console and run:
```javascript
// Test amount entry
QuoteBuilderVoice.test('Cash needed is 75000')

// Test property value
QuoteBuilderVoice.test('Property value is 650000')

// Test mortgage
QuoteBuilderVoice.test('Mortgage balance is 320000')

// Test name
QuoteBuilderVoice.test('Client name is John Smith')

// Test navigation
QuoteBuilderVoice.test('Next step')
QuoteBuilderVoice.test('Go back')
```

## Supported Voice Commands

### Step 1: Client Info
| Say This | Result |
|----------|--------|
| "Client name is [name]" | Fills name field |
| "Name is [name]" | Fills name field |
| "Phone is [number]" | Fills phone field |
| "Credit score is [number]" | Selects credit range |
| "Credit is [number]" | Selects credit range |
| "Cash needed is [amount]" | Fills amount |
| "Need [amount]" | Fills amount |
| "Amount is [amount]" | Fills amount |
| "Purpose is [purpose]" | Selects purpose |
| "Debt consolidation" | Selects debt consolidation |
| "Home improvement" | Selects home improvement |
| "Investment" | Selects investment |
| "Emergency fund" | Selects emergency |

### Step 2: Property
| Say This | Result |
|----------|--------|
| "Property value is [amount]" | Fills property value |
| "Home is worth [amount]" | Fills property value |
| "Mortgage balance is [amount]" | Fills mortgage |
| "Mortgage is [amount]" | Fills mortgage |
| "Address is [address]" | Fills address |

### Navigation
| Say This | Result |
|----------|--------|
| "Next step" | Advances to next step |
| "Next" | Advances to next step |
| "Continue" | Advances to next step |
| "Go back" | Goes to previous step |
| "Previous" | Goes to previous step |
| "Back" | Goes to previous step |

### Numbers
You can say numbers in various ways:
- "75 thousand" → 75000
- "Seventy five thousand" → 75000
- "75000" → 75000
- "Six hundred fifty thousand" → 650000

## Troubleshooting

### Voice Button Not Appearing
1. Check browser console for errors
2. Verify you're using Chrome or Edge
3. Run: `QuoteBuilderVoice.isSupported()` should return `true`

### Commands Not Working
1. Check console for "Voice command:" logs
2. Try test commands in console first
3. Speak clearly and at moderate pace
4. Try simpler phrases

### Field Not Updating
1. Check field ID exists: `document.getElementById('qb-client-name')`
2. Verify you're on correct step
3. Try manual entry to confirm field works

## Debug Commands

```javascript
// Check if voice is supported
QuoteBuilderVoice.isSupported()

// Get current voice state
QuoteBuilderVoice.getState()

// Test specific commands
QuoteBuilderVoice.test('Cash needed is 75000')
QuoteBuilderVoice.test('Property value is 650000')
QuoteBuilderVoice.test('Next step')

// Check current step
QuoteBuilderV2.getState().step
```

## Expected Behavior

1. **Press and hold** 🎤 button
2. Speak command clearly
3. **Release** button
4. See toast confirmation
5. Field updates automatically

## Common Issues

| Issue | Solution |
|-------|----------|
| "No speech detected" | Speak louder, closer to mic |
| "Command not recognized" | Use exact phrases from table |
| Field doesn't update | Check console for errors |
| Button disabled | Use Chrome or Edge |

## Testing Checklist

- [ ] Voice button appears in Chrome
- [ ] Button shows "listening" animation when held
- [ ] "Cash needed is 75000" fills amount field
- [ ] "Property value is 650000" fills property value
- [ ] "Next step" advances to next step
- [ ] Toast confirmations appear
