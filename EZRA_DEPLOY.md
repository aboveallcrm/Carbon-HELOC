# Ezra AI Ultimate - Deployment Guide

## Step 1: Run Database Migration

In Supabase SQL Editor, run this file:
```
supabase/migrations/20260307_ezra_final_install.sql
```

This creates all 11 tables needed for Ezra.

## Step 2: Deploy Edge Functions

### Option A: Using Supabase CLI
```bash
# Install Supabase CLI if needed
npm install -g supabase

# Login
supabase login

# Link your project
supabase link --project-ref your-project-ref

# Deploy functions
supabase functions deploy ezra-chat
supabase functions deploy deal-radar
```

### Option B: Using Dashboard
1. Go to Supabase Dashboard → Edge Functions
2. Create new function "ezra-chat"
3. Paste content from `supabase/functions/ezra-chat/index.ts`
4. Deploy
5. Repeat for "deal-radar"

## Step 3: Set Environment Variables

In Supabase Dashboard → Settings → API:

Add these secrets (if using AI features):
```
GEMINI_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_key_here
OPENAI_API_KEY=your_key_here
```

## Step 4: Verify Installation

Open your HELOC tool and check browser console:
```
🤖 Ezra AI v2.0 - Fully Activated
🚀 Ezra Ultimate Activated
```

You should see:
- Confidence meter on quote form
- Voice button (bottom right)
- Document uploader (bottom right)
- Deal Radar tab in Ezra chat

## Troubleshooting

### "Table does not exist" error
Run the migration SQL again in Supabase SQL Editor.

### "Function not found" error
Deploy the Edge Functions (Step 2).

### Ezra not appearing
Check browser console for errors. Make sure all JS files are loading:
- ezra-real.js
- ezra-complete.js
- ezra-advanced.js
- ezra-ultimate.js
- ezra-chat.js

## Features Enabled

After deployment, you have:
- ✅ Real-time Quote Guardian
- ✅ Voice Control
- ✅ Smart Follow-ups
- ✅ Deal Scoring
- ✅ Competitive Intelligence
- ✅ Emotional Intelligence
- ✅ Document Reader
- ✅ Deal Resurrection
- ✅ Referral Intelligence
- ✅ Equity Alerts
- ✅ AI Role-Play Training
- ✅ Market Timing Advisor

All 22 features are now live!
