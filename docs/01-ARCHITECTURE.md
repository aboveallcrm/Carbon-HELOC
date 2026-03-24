# Above All Carbon HELOC — Architecture Overview

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Single HTML file (~8000 lines), vanilla JS + CSS, no build step |
| Auth | Supabase Auth (JWT, email/password + Google OAuth) |
| Database | Supabase PostgreSQL with Row-Level Security (RLS) + pgvector |
| Backend | Deno-based Edge Functions (TypeScript), deployed to Supabase |
| Email | Resend API (domain: `notifications.aboveallcrm.com`) |
| AI | Multi-provider gateway (OpenAI, Gemini, Claude, DeepSeek, Groq, Grok, Perplexity) |
| CRM | Bonzo v3, GoHighLevel (GHL), n8n, LeadMailbox, Zapier |
| Video | HeyGen AI (Diamond tier only) |
| Hosting | Vercel (`carbon-heloc.vercel.app`) |
| Local Dev | `python -m http.server 8080` from project root |

---

## Supabase Project

| Setting | Value |
|---------|-------|
| Project ID | `czzabvfzuxhpdcowgvam` |
| URL | `https://czzabvfzuxhpdcowgvam.supabase.co` |
| Anon Key | `Provided at runtime via /api/public-config.js` |
| Super Admin UUID | `Configured per environment` |
| Super Admin Email | `Configured per environment` |

---

## File Structure

```
AboveAllCarbon_HELOC_v12_FIXED.html     — Main app (~8000 lines, all-in-one)
client-quote.html                        — Public client-facing quote page
login.html / register.html               — Auth pages
admin.html                               — Admin dashboard

js/
  auth.js                                — Authentication module (ES module)
  main.js                                — App bootstrap + auth-ready event dispatcher
  supabase-client.js                     — Supabase client init + user caching
  supabase-quotes.js                     — Quote cloud save (debounced 5s)
  ezra-chat.js                           — Ezra AI chat widget (~300KB)
  carbon-commands-v3.js / .css           — Command palette (Cmd+K)
  pwa-install.js / pwa-styles.css        — PWA support
  dom-cache.js                           — DOM query performance optimization

supabase/
  config.toml                            — Supabase project config
  functions/                             — Edge functions (Deno/TypeScript)
    ai-proxy/index.ts
    bonzo-proxy/index.ts
    bonzo-sync/index.ts
    bonzo-webhook/index.ts
    deal-radar/index.ts
    quote-chat/index.ts
    redirect/index.ts
    click-notify/index.ts
    generate-video/index.ts
    log-conversation/index.ts
    get-prompt/index.ts
    send-alert-email/index.ts
    track-quote-view/index.ts
    gmail-send/index.ts
    schedule-request/index.ts
    push-notify/index.ts
    push-config/index.ts
  migrations/                            — SQL migrations (idempotent)

docs/                                    — This documentation folder
```

---

## Auth Flow

```
User logs in (login.html)
  └── Supabase Auth issues JWT
        └── js/main.js runs:
              1. checkSession()                  — validate JWT, guard routes
              2. captureGoogleProviderToken()    — store Gmail OAuth token if present
              3. getEffectiveUser()              — apply impersonation if active (1hr max)
              4. expose globals:
                   window.currentUserRole        — 'user' | 'admin' | 'super_admin'
                   window.currentUserId          — UUID
                   window.currentUserEmail
                   window.currentUserTier        — 'carbon' | 'titanium' | 'platinum' | 'obsidian' | 'diamond'
                   window._supabase              — initialized Supabase client
              5. dispatch 'auth-ready' CustomEvent
                   └── handler calls:
                         applyRoleAccess(role)
                         applyIntegrationAccess(role, tier)
                         applyTierAccess(tier)
```

---

## RLS Policy Architecture

### Critical Rule: Profiles Table Uses Hardcoded UUID
```sql
-- PROFILES: hardcoded UUID only (is_super_admin() causes infinite recursion)
CREATE POLICY "profiles_sa_all" ON profiles
    FOR ALL USING (auth.uid() = '795aea13-6aba-45f2-97d4-04576f684557'::uuid);
```

### All Other Tables Use is_super_admin()
```sql
-- OTHER TABLES: use SECURITY DEFINER function
CREATE POLICY "leads_sa_all" ON leads
    FOR ALL USING (is_super_admin());

CREATE POLICY "leads_own_select" ON leads
    FOR SELECT USING (auth.uid() = user_id);
```

### Policy Naming Convention
- `{table}_own_{action}` — user-scoped access
- `{table}_sa_{action}` — super admin access
- `{table}_anon_{action}` — public/anonymous access

---

## Edge Function Auth Rules

| Function | verify_jwt | Notes |
|----------|-----------|-------|
| ai-proxy | false | Handles own JWT auth internally |
| bonzo-proxy | false | Handles own JWT auth internally |
| bonzo-sync | false | Handles own JWT auth internally |
| bonzo-webhook | false | Optional token param |
| deal-radar | true | Standard JWT gate |
| quote-chat | false | Public (rate-limited per quote code) |
| redirect | false | Public |
| click-notify | false | Internal service role |
| generate-video | false | Handles own auth; poll_public is anonymous |
| log-conversation | false | Handles own auth |
| get-prompt | false | Public |
| send-alert-email | true | Admin only |
| track-quote-view | false | Public |
| gmail-send | true | Requires Google provider token |
| schedule-request | false | Public (client-facing) |
| push-notify | true | LO-only |
| push-config | true | LO-only |

---

## Environment Variables (Edge Functions)

```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY

# AI providers (pool keys for load distribution)
OPENAI_API_KEY, OPENAI_API_KEY_1 ... OPENAI_API_KEY_5
GEMINI_API_KEY, GEMINI_API_KEY_1 ... GEMINI_API_KEY_5
ANTHROPIC_API_KEY, ANTHROPIC_API_KEY_1 ... ANTHROPIC_API_KEY_5
DEEPSEEK_API_KEY
GROQ_API_KEY
GROK_API_KEY
PERPLEXITY_API_KEY

# Email
RESEND_API_KEY
RESEND_FROM_EMAIL
ALERT_TO_EMAIL
```

---

## Engagement Scoring System

Click events flow through a trigger chain:

```
Client opens quote link
  └── redirect edge function runs
        └── INSERT into clicks table
              └── trg_click_notification TRIGGER fires
                    ├── Resolves lead_id from link
                    ├── UPDATE leads.engagement_score (via update_lead_engagement RPC)
                    │     +5  base click
                    │     +3  mobile device bonus
                    │     +10 repeat visitor
                    │     +20 apply link click
                    └── INSERT into click_notifications (pending)
                          └── click-notify edge function (async)
                                └── POST to LO's n8n webhook → SMS to LO
```

---

## Deployment

### Frontend (Vercel)
- Static files only — no build process
- Push to `main` branch → auto-deploy

### Edge Functions (Supabase CLI)
```bash
supabase functions deploy <function-name>
supabase functions deploy <function-name> --no-verify-jwt  # for public/self-auth functions
```

### Migrations
- Always use `IF NOT EXISTS`, `DROP POLICY IF EXISTS` (idempotent)
- Run via Supabase Dashboard SQL Editor or MCP `execute_sql`/`apply_migration`
- File naming: `YYYYMMDDHHMMSS_description.sql`
