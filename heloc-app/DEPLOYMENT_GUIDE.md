# Deployment Guide: Token-Based AI System

## Overview

The token-based AI system has been implemented in the React app (`heloc-app/`). 
The user is currently seeing the old HTML app (`AboveAllCarbon_HELOC_v12_FIXED.html`).

## Current Status

### ✅ React App (heloc-app) - READY TO DEPLOY
Location: `c:\Users\Eddie Omen\Documents\Above All HELOC Carbon\heloc-app`

**Features:**
- Token-based AI system with Ezra
- Tier-based monthly bonuses (100/500/2000 tokens)
- Token purchase system via Stripe
- Complete UI for token management
- TypeScript, React, Vite, Supabase

**Build Output:** `heloc-app/dist/`

### ⚠️ Legacy HTML App - CURRENTLY LIVE
Location: `AboveAllCarbon_HELOC_v12_FIXED.html`
URL: https://heloc.aboveallcrm.com

This is what the user is currently seeing.

---

## Deployment Options

### Option 1: Deploy React App to Vercel (Recommended)

1. **Push to GitHub:**
```bash
cd "c:\Users\Eddie Omen\Documents\Above All HELOC Carbon\heloc-app"
git push origin main
```

2. **Connect to Vercel:**
   - Go to https://vercel.com
   - Import the GitHub repo
   - Set framework preset to "Vite"
   - Build command: `npm run build`
   - Output directory: `dist`

3. **Environment Variables:**
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. **Deploy:**
   - Vercel will auto-deploy on push
   - Or run: `vercel --prod`

5. **Update DNS:**
   - Point `heloc.aboveallcrm.com` to Vercel
   - Or set up redirect from old URL to new

### Option 2: Deploy to Existing Hosting

If keeping current hosting:

1. **Build the app:**
```bash
cd "c:\Users\Eddie Omen\Documents\Above All HELOC Carbon\heloc-app"
npm run build
```

2. **Upload `dist/` folder** to your web server

3. **Configure SPA fallback:**
   - All routes should serve `index.html`
   - Vite handles client-side routing

### Option 3: Backport to HTML (Quick Fix)

If you need token features in the old app immediately:

1. I can add token consumption logic to `AboveAllCarbon_HELOC_v12_FIXED.html`
2. This would be a temporary solution until React app is deployed

---

## Database Setup

Run the migration to set up token tables:

```sql
-- Run this in Supabase SQL Editor
\i supabase/migrations/20260411_token_system.sql
```

Or copy-paste the contents of `20260411_token_system.sql` into the SQL Editor.

---

## Stripe Configuration

1. **Set up Stripe webhook endpoint:**
   - URL: `https://your-supabase-project.supabase.co/functions/v1/stripe-webhook`
   - Events: `checkout.session.completed`

2. **Environment variables in Supabase:**
```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

3. **Deploy edge functions:**
```bash
supabase functions deploy create-token-checkout
supabase functions deploy stripe-webhook
```

---

## Testing the Token System

After deployment:

1. **Sign up as new user** → Should receive welcome bonus tokens
2. **Check token balance** → Should show in header
3. **Use AI features** → Should consume tokens
4. **Purchase tokens** → Should redirect to Stripe checkout
5. **Complete purchase** → Tokens credited instantly

---

## Token Costs Reference

| Feature | Token Cost |
|---------|-----------|
| Strategy Generation | 10 |
| Sales Script | 15 |
| Objection Handler | 8 |
| Email Template | 12 |
| Competitive Analysis | 20 |
| Chat Message | 2 |

---

## Monthly Bonuses by Tier

| Tier | Monthly Tokens | Price |
|------|---------------|-------|
| Starter | 100 | $79/mo |
| Pro | 500 | $179/mo |
| Enterprise | 2000 | $497/mo |

---

## Next Steps

1. **Choose deployment option**
2. **Run database migration**
3. **Configure Stripe**
4. **Deploy edge functions**
5. **Deploy React app**
6. **Test token flow**

Need help with any of these steps?
