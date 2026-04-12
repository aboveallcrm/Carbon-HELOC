# Token System Database Setup

## Option 1: Run via Supabase SQL Editor (Recommended)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/czzabvfzuxhpdcowgvam
2. Navigate to "SQL Editor" in the left sidebar
3. Click "New Query"
4. Copy and paste the entire contents of `20260411_token_system.sql`
5. Click "Run"

## Option 2: Run via Supabase CLI

```bash
cd heloc-app
npx supabase link --project-ref czzabvfzuxhpdcowgvam
npx supabase db push
```

## What This Migration Creates

### Tables
1. **user_tokens** - Stores token balances per user
2. **token_transactions** - Tracks all token movements
3. **token_pricing** - Token package definitions
4. **ai_usage** - AI feature usage analytics

### Functions
1. **credit_tokens()** - Add tokens to user balance
2. **debit_tokens()** - Consume tokens for AI features
3. **get_token_balance()** - Get current balance
4. **apply_monthly_bonus()** - Apply tier-based monthly bonuses

### Triggers
- **trg_new_user_tokens** - Auto-creates token record with signup bonus on profile creation

## Verification

After running the migration, verify by running this query in SQL Editor:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('user_tokens', 'token_transactions', 'token_pricing', 'ai_usage');

-- Check if functions exist
SELECT routine_name 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('credit_tokens', 'debit_tokens', 'get_token_balance', 'apply_monthly_bonus');
```

## Next Steps

1. ✅ Run database migration
2. Deploy edge functions (create-token-checkout, stripe-webhook)
3. Configure Stripe environment variables
4. Test token flow
