# Above All CRM — Loan Products & Calculations

## Carbon HELOC Tool — 3-Tier Rate System

The primary tool uses a 3-tier HELOC rate matrix. Each tier represents a different draw/repayment structure. Rates are LO-configurable in the admin panel and saved to localStorage.

### Default Rate Configuration

| Tier | Draw Period | Repay Period | Rate | Origination | IO Payment Basis |
|------|------------|-------------|------|-------------|-----------------|
| **Tier 1** | 2 years | 5 years (60mo) | 7.99% | 2.00% | Interest-Only during draw |
| **Tier 2** | 5 years | 15 years (180mo) | 8.49% | 3.00% | Interest-Only during draw |
| **Tier 3** | 10 years | 20 years (240mo) | 9.49% | 4.50% | Interest-Only during draw |

### Rate Config Object (JavaScript)

```javascript
const DEFAULT_RATES = {
    tier1: { draw: 2, repay: 5, rate: 7.99, origPct: 2.00, label: '2yr Draw / 5yr Repay' },
    tier2: { draw: 5, repay: 15, rate: 8.49, origPct: 3.00, label: '5yr Draw / 15yr Repay' },
    tier3: { draw: 10, repay: 20, rate: 9.49, origPct: 4.50, label: '10yr Draw / 20yr Repay' }
};
```

### Admin Panel Rate Fields

Each tier exposes these editable fields in Settings → Rates tab:
- Rate (%)
- Origination Fee (%)
- Draw Period (years)
- Repayment Period (years)

All saved to `localStorage.setItem('helocRates', JSON.stringify(rates))`.

## Calculation Logic

### Core Inputs

| Field | ID | Description |
|-------|-----|------------|
| Home Value | `in-home-value` | Estimated property value |
| Mortgage Balance | `in-mortgage-balance` | Current 1st mortgage balance |
| Existing HELOC Payoff | `in-refi-balance` | Existing HELOC/2nd to pay off (if refinancing) |
| Desired Cash Back | `in-net-cash` | Net cash the client wants |
| Credit Score | `in-client-credit` | FICO score for qualification |
| Property Type | `in-property-type` | Primary, Second Home, or Investment |

### Total Loan Amount

```javascript
// Total HELOC = existing HELOC payoff + desired net cash
const totalLoan = helocPayoff + netCashDesired;
```

**Key distinction**: This is a 2nd mortgage HELOC. It does NOT refinance the 1st mortgage. The 1st mortgage balance is used only for CLTV calculations.

### Origination Fee

```javascript
// Origination = Total Loan × Origination %
const origFee = totalLoan * (origPct / 100);
```

### Monthly Payment — Interest Only (Draw Period)

```javascript
// During draw period, payments are interest-only
function calculateInterestOnly(principal, annualRate) {
    return principal * (annualRate / 100) / 12;
}

// Example: $200,000 at 7.99%
// IO Payment = 200000 * 0.0799 / 12 = $1,331.67/mo
```

### Monthly Payment — P&I (Repayment Period)

```javascript
// After draw period, fully amortizing P&I over repayment term
function calculatePMT(principal, annualRate, years) {
    const r = annualRate / 100 / 12;
    const n = years * 12;
    if (r === 0) return principal / n;
    return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// Example: $200,000 at 7.99% for 5 years (60 months)
// PMT = $4,053.28/mo
```

### CLTV (Combined Loan-to-Value)

```javascript
// CLTV includes both 1st mortgage AND HELOC
const cltv = ((mortgageBalance + totalHelocLoan) / homeValue) * 100;

// Example: $400,000 mortgage + $200,000 HELOC / $850,000 home = 70.6%
```

### Available Equity

```javascript
const availableEquity = homeValue - mortgageBalance;
// Display as data block for context
```

## Display Formatting

```javascript
// Currency (whole dollars)
function formatCurrency(n) {
    return '$' + Math.round(n).toLocaleString('en-US');
}

// Currency (with cents — for payments)
function formatPayment(n) {
    return '$' + n.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

// Rate (3 decimals)
function formatRate(rate) {
    return rate.toFixed(3) + '%';
}

// Percentage (1 decimal)
function formatPct(pct) {
    return pct.toFixed(1) + '%';
}
```

## Rate Matrix Table Structure

### Display Columns per Tier

| Row | Label | Value Source |
|-----|-------|-------------|
| Draw / Repay | Term label | `tier.draw`yr / `tier.repay`yr |
| Interest Rate | Rate % | `tier.rate`% |
| Total Loan | Loan amount | helocPayoff + netCash |
| Origination | Fee amount | totalLoan × origPct |
| IO Payment | Monthly (draw) | Interest-only calc |
| P&I Payment | Monthly (repay) | PMT calc |

### Selected Tier Highlighting

When user clicks a tier column, apply `.selected-row` class:
```javascript
function selectTier(tierNum) {
    // Remove previous selection
    document.querySelectorAll('.tier-col').forEach(c => c.classList.remove('selected'));
    // Add selection to clicked tier
    document.querySelectorAll(`.tier-${tierNum}-col`).forEach(c => c.classList.add('selected'));
    // Update quote snapshot with selected tier's values
    updateSnapshot(tierNum);
}
```

## Quote Snapshot (Selected Option Summary)

Displays the selected tier's details in a navy card:

| Snapshot Field | ID | Content |
|---------------|-----|---------|
| Tier Label | `snap-tier` | "Tier 1: 2yr / 5yr" |
| Total Loan | `snap-total-loan` | Formatted currency |
| Rate | `snap-rate` | Rate % |
| Term | `snap-term` | Repayment years |
| IO Payment | `snap-io-payment` | Monthly draw payment |
| P&I Payment | `snap-payment` | Monthly repay payment |
| Origination % | `snap-orig-perc` | Fee percentage |
| Origination $ | `snap-orig-amt` | Fee dollar amount |

## Future Products (Platinum/Obsidian Tiers)

The Platinum tier adds 5 options (2 Refi + 2 HELOC + 1 HELOAN):

| # | Product | Type | Basis |
|---|---------|------|-------|
| 1 | Cash Out Refi 30yr | 1st Mortgage | Replaces existing mortgage |
| 2 | Cash Out Refi 15yr | 1st Mortgage | Replaces existing mortgage |
| 3 | HELOC 4/16 | 2nd Mortgage | Draw + Repay |
| 4 | HELOC 5/25 | 2nd Mortgage | Draw + Repay |
| 5 | HELOAN 20yr | 2nd Mortgage | Fixed lump sum |

For Refi products: `loanAmount = mortgageBalance + cashOut`
For HELOC/HELOAN products: `loanAmount = cashOut` (or `helocPayoff + cashOut`)
