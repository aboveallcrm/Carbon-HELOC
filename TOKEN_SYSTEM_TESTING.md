# Token System Testing Guide

## Pre-Testing Setup

### 1. Database Migration (Required)
Run the SQL migration in Supabase:

```sql
-- Go to: https://supabase.com/dashboard/project/czzabvfzuxhpdcowgvam/sql-editor
-- Paste contents of: supabase/migrations/20260411_token_system.sql
-- Click "Run"
```

### 2. Edge Functions (Optional for testing)
For full purchase flow, deploy edge functions:

```bash
cd heloc-app
npx supabase functions deploy create-token-checkout
npx supabase functions deploy stripe-webhook
```

### 3. Environment Variables (Optional for testing)
Set in Supabase Dashboard (Project Settings > Edge Functions):
- `STRIPE_SECRET_KEY` (for purchases)
- `STRIPE_WEBHOOK_SECRET` (for purchase fulfillment)

## Testing Checklist

### ✅ Basic Token Display

1. **Open the HTML app** in browser
2. **Log in** with a valid account
3. **Open Ezra chat** (click the orb)
4. **Verify**: Token balance badge shows in header (⚡ 0 or actual balance)
5. **Check console**: Should see "🔑 Token System: Initialized successfully"

### ✅ Token Balance Fetching

1. **Open browser console** (F12)
2. **Refresh page**
3. **Verify**: Console shows:
   - "🔑 Token System: Initializing..."
   - "🔑 Token System: Initialized successfully"
   - "🔑 Token System: Fetching balance for user [uuid]"
   - "🔑 Token System: Balance fetched - X tokens" (or "No token record yet")

### ✅ Token Consumption (Manual Test)

1. **Open Ezra chat**
2. **Type a message** that requires AI (e.g., "Generate strategy")
3. **Verify**: 
   - If tokens available: Message processes normally
   - If no tokens: Shows "Insufficient Tokens" modal

### ✅ Low Balance Warning

1. **Manually set low balance** in console:
   ```javascript
   window.TokenSystem.getState() // Check current
   // If you have access to database, set balance to 40
   ```
2. **Refresh page**
3. **Verify**: Toast notification appears saying "Low token balance"

### ✅ Token Purchase Modal

1. **Click token badge** in Ezra header
2. **Verify**: Purchase modal opens with 4 packages
3. **Verify**: Packages show correct prices and token amounts
4. **Close modal** (click X or outside)

### ✅ Quote Builder

1. **Open Ezra chat**
2. **Click "Build Quote"** quick command button
3. **Verify**: Quote builder modal opens
4. **Step through wizard**:
   - Step 1: Welcome → Click "Get Started"
   - Step 2: Select "Enter Manually" → Fill client details → Continue
   - Step 3: Paste rate sheet or select manual → Continue
   - Step 4: Enter cash needed → Continue
   - Step 5: Select quote preset → Continue
   - Step 6: Review → Click "Generate Quote"
5. **Verify**: Quote is generated and modal closes

### ✅ Token Cost Display

1. **Open Ezra chat**
2. **Look at quick command buttons**
3. **Verify**: Token costs are shown (if implemented in UI)

## Debugging

### Console Commands

```javascript
// Check token system state
window.TokenSystem.getState()

// Check current balance
window.TokenSystem.getBalance()

// Check if user has enough tokens for a feature
window.TokenSystem.hasEnoughTokens('strategy')

// Get cost of a feature
window.TokenSystem.getTokenCost('sales_script')

// Manually refresh balance
window.TokenSystem.fetchBalance()

// Open purchase modal
window.TokenSystem.showPurchaseModal()

// Start quote builder
window.QuoteBuilder.start()
```

### Common Issues

**Issue**: Token badge not showing
- **Check**: Is Supabase initialized? Look for `window.supabase` in console
- **Fix**: Refresh page, ensure you're logged in

**Issue**: "Supabase not available" warning
- **Check**: Are the Supabase scripts loaded before token-system.js?
- **Fix**: Check script loading order in HTML

**Issue**: Token balance always 0
- **Check**: Is database migration run? Check `user_tokens` table
- **Fix**: Run SQL migration in Supabase

**Issue**: Quote builder not opening
- **Check**: Is `window.QuoteBuilder` defined?
- **Fix**: Check if quote-builder.js is loaded

## Production Deployment

### Before Going Live

1. ✅ Database migration run
2. ✅ Edge functions deployed
3. ✅ Stripe webhooks configured
4. ✅ Environment variables set
5. ✅ Tested with real purchases (small amount)
6. ✅ Error handling verified

### Monitoring

Monitor these in Supabase Dashboard:
- `user_tokens` table growth
- `token_transactions` for purchase issues
- `ai_usage` for feature popularity
- Edge function logs for errors
