# Deploy Edge Functions

## Prerequisites

1. Supabase CLI installed: `npm install -g supabase`
2. Logged in: `supabase login`
3. Project linked: `supabase link --project-ref czzabvfzuxhpdcowgvam`

## Deploy Commands

```bash
cd heloc-app

# Deploy create-token-checkout
supabase functions deploy create-token-checkout

# Deploy stripe-webhook
supabase functions deploy stripe-webhook
```

## Environment Variables

Set these in Supabase Dashboard (Project Settings > Edge Functions):

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_URL=https://czzabvfzuxhpdcowgvam.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
```

## Stripe Webhook Setup

1. Go to Stripe Dashboard: https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. URL: `https://czzabvfzuxhpdcowgvam.supabase.co/functions/v1/stripe-webhook`
4. Events to listen for:
   - `checkout.session.completed`
5. Copy the webhook signing secret
6. Add to Supabase environment variables as `STRIPE_WEBHOOK_SECRET`

## Verification

Test the functions:

```bash
# Test token checkout (requires auth)
curl -X POST https://czzabvfzuxhpdcowgvam.supabase.co/functions/v1/create-token-checkout \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"packageId": "your-package-id", "userId": "your-user-id"}'
```
