# Integration Guide: Token System & Quote Builder

## Files Created

1. `js/token-system.js` - Token balance, consumption, purchase
2. `js/token-system-styles.css` - Token UI styles
3. `js/quote-builder.js` - Interactive quote builder wizard
4. `js/quote-builder-styles.css` - Quote builder styles

## Integration Steps

### Step 1: Add CSS to HTML Head

Add these lines in the `<head>` section of `AboveAllCarbon_HELOC_v12_FIXED.html` (around line 89, after carbon-commands-v3.css):

```html
<!-- Token System Styles -->
<link rel="stylesheet" href="./js/token-system-styles.css">
<!-- Quote Builder Styles -->
<link rel="stylesheet" href="./js/quote-builder-styles.css">
```

### Step 2: Add JavaScript Files

Add these lines before the closing `</body>` tag (around line 22490, before the Ezra script):

```html
<!-- Token System -->
<script src="./js/token-system.js"></script>
<!-- Quote Builder -->
<script src="./js/quote-builder.js"></script>
```

### Step 3: Modify Ezra Widget Header

Find the Ezra widget HTML structure (likely in `js/ezra-chat.js`) and add the token balance badge to the header. The token badge should have ID `ezra-token-balance`.

Example:
```html
<div class="ezra-header">
    <span class="ezra-title">🤖 Ezra</span>
    <span id="ezra-token-balance" class="ezra-token-badge healthy">⚡ 0</span>
</div>
```

### Step 4: Add Token Consumption to AI Calls

In `js/ezra-chat.js`, before making AI API calls, add:

```javascript
// Check and consume tokens
const featureType = 'chat_message'; // or 'strategy', 'sales_script', etc.
const tokenResult = await window.TokenSystem.consumeTokens(featureType, {
    model: selectedModel,
    quoteId: currentQuoteId
});

if (!tokenResult.success) {
    // Show insufficient tokens message
    return;
}
```

### Step 5: Add Quote Builder Command

Add a "Build Quote" command to Ezra's quick actions or command list that calls:

```javascript
window.QuoteBuilder.start();
```

### Step 6: Database Setup

Run the token system migration in Supabase SQL Editor:

```sql
-- Run this in Supabase SQL Editor
-- Contents of: supabase/migrations/20260411_token_system.sql
```

### Step 7: Deploy Edge Functions

```bash
supabase functions deploy create-token-checkout
supabase functions deploy stripe-webhook
```

### Step 8: Configure Stripe

1. Add environment variables to Supabase:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`

2. Set up webhook endpoint in Stripe:
   - URL: `https://your-project.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`

## Testing

1. Load the app and check that token balance appears in Ezra header
2. Try to use an AI feature - should check tokens first
3. Test low balance warning (set balance < 50)
4. Test token purchase flow
5. Test quote builder via Ezra command

## Notes

- The token system requires Supabase authentication
- Token balances are fetched every 30 seconds
- Low balance warnings show once per session
- Token purchases are processed via Stripe webhook
