# Rate Sheet Parsing Guide

## How to Import Rates from Figure

### Step-by-Step Instructions

1. **Open the PDF**
   - Open the Figure rate sheet PDF from your email

2. **Select All**
   - Press `Ctrl+A` to select all text in the PDF

3. **Copy**
   - Press `Ctrl+C` to copy the selected text

4. **Paste in Quote Builder**
   - In Step 3 of Quote Builder, click "Paste Rate Sheet"
   - Press `Ctrl+V` to paste the copied text
   - Click "📊 Extract Rates"

### What Gets Parsed

The parser extracts:

#### Base Rates
- Rates organized by FICO score (640-659, 660-679, etc.)
- And CLTV ranges (0-50%, 50-60%, etc.)

#### Term Adjustments
- 20 Year: -0.250%
- 15 Year: -0.250%
- 10 Year: -0.250%

#### Occupancy Adjustments
- Investment/2nd Home: +0.250%

#### O-Fee Options
- 0%, 0.99%, 1.50%, 1.99%, 2.99%, 4.99%

#### State Adjustments
- TX: +0.300%
- NY: +0.450%

### Example Parsed Output

```javascript
{
  lienType: '1st',
  baseRates: {
    '640-659': {
      '0-50%': 7.70,
      '50-60%': 7.70,
      // ...
    },
    '660-679': {
      '0-50%': 7.65,
      // ...
    }
    // ... more FICO ranges
  },
  termAdjustments: {
    '20': -0.250,
    '15': -0.250,
    '10': -0.250
  },
  occupancyAdjustments: {
    'investment': 0.250
  },
  ofeeOptions: [0, 0.99, 1.50, 1.99, 2.99, 4.99],
  stateAdjustments: {
    'TX': 0.300,
    'NY': 0.450
  }
}
```

### Supported Rate Sheet Formats

- ✓ Figure 1st Lien HELOC
- ✓ Figure 2nd/Junior Lien HELOC
- ⚠ Nifty Door (basic support)

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "Could not auto-parse rates" | Make sure you copied the entire PDF including headers |
| Rates seem wrong | Check that you selected ALL text (Ctrl+A) not just a portion |
| Parser not finding rates | Ensure the PDF text is selectable (not an image) |

### Testing the Parser

Open browser console and test:
```javascript
// Paste sample rate text
const sampleText = `1st Lien HELOC - Pricing Sheet
Base Rates - 1st Lien; 30yr Term; 4.99% Lender Origination Fee
FICO/CLTV  640-659  660-679  680-699
0-50%      7.70     7.65     7.45
50-60%     7.70     7.65     7.45`;

// Test parsing
QuoteBuilderV2.parseFigureRateSheet(sampleText);
```

## Files Modified
- `js/quote-builder-v2.js` - Rate parsing logic
- `js/quote-builder-v2-styles.css` - Rate paste area styles
