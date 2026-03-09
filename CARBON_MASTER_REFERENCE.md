# Above All Carbon HELOC — Master Reference

> **Platform**: Above All Carbon HELOC CRM + Quote Builder
> **Stack**: Single-file HTML/CSS/JS app + Supabase (PostgreSQL, Auth, Edge Functions, Storage) + Resend (email)
> **Last Updated**: March 7, 2026

---

## 1. Architecture Overview

| Layer | Technology | Details |
|-------|-----------|---------|
| Frontend | `AboveAllCarbon_HELOC_v12_FIXED.html` | ~8,000+ line single-file app with inline CSS + JS |
| Auth | `js/auth.js`, `js/supabase-client.js`, `js/main.js` | ES modules, JWT-based, dispatches `auth-ready` event |
| Backend | Supabase Edge Functions (Deno) | 8 active functions on `czzabvfzuxhpdcowgvam` |
| Database | Supabase PostgreSQL | 22+ tables, RLS on all, pgvector for AI |
| Email | Resend API | Domain: `notifications.aboveallcrm.com` |
| CRM | Bonzo v3, GHL, n8n, Zapier, LeadMailbox | Multi-provider sync + webhook ingestion |
| Hosting | Vercel | `carbon-heloc.vercel.app` |

---

## 2. Edge Functions (Deployed)

| Function | Purpose | Auth | Deploy Flag |
|----------|---------|------|-------------|
| `ai-proxy` | Universal AI gateway (OpenAI, Gemini, Anthropic, DeepSeek, Groq, Grok, Perplexity) | JWT (per-user key override + platform fallback) | `--no-verify-jwt` |
| `bonzo-proxy` | Bonzo CRM v3 API proxy (CRUD, SMS, email, DNC check) | JWT | `--no-verify-jwt` |
| `bonzo-sync` | Bulk lead import from Bonzo (50/200/500/ALL selector) | JWT (internal) | `--no-verify-jwt` |
| `bonzo-webhook` | Inbound lead webhook (GHL, Bonzo, LeadMailbox, Zapier, n8n) | Optional token | default |
| `deal-radar` | HELOC equity opportunity scanner (tappable equity, CLTV, rates) | JWT | `verify_jwt = true` |
| `quote-chat` | Ezra AI on client quote pages (sales-closer prompt) | Public | default |
| `redirect` | Link shortener + click tracking + engagement scoring | Public | default |
| `send-alert-email` | Failure alert emails via Resend | JWT | default |
| `track-quote-view` | Quote page impression logger | Public | default |

### Archived Edge Functions (`supabase/functions/_archive/`)
- `ezra-chat` — Superseded by `quote-chat`
- `ezra-quote-builder` — Superseded by in-app Ezra

---

## 3. Database Tables

### Core
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | User metadata | role, tier, subscription_status, crm_preference, agent_* fields |
| `user_integrations` | Per-user API keys & settings | provider (`heloc_keys`, `heloc_settings`, `webhook_config`), metadata JSONB |
| `user_settings` | General user preferences | user_id, n8n_webhook_url, etc. |

### Quotes & Links
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `quotes` | Quote documents | user_id, quote_data JSONB, status (draft/sent/accepted/funded) |
| `quote_links` | Client-facing quote share links | user_id, lead_id, code, short_link_id FK→links, view_count, expires_at |
| `links` | URL shortener | user_id, slug, url, short_url, lead_id, expires_at |
| `clicks` | Link click analytics | link_id, ip_hash, user_agent_hash, device_type, city, referrer, clicked_at |

### Leads & CRM
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `leads` | Lead pipeline | user_id, first_name, last_name, email, phone, source, crm_source, stage, status, metadata JSONB, engagement_score, dnc, dnc_reason |
| `lead_analytics` | Lead engagement tracking | lead_id, user_id, event_type, metadata JSONB |
| `click_notifications` | LO notification queue (from clicks) | link_id, lead_id, user_id, click_data JSONB, status (pending/sent/failed) |
| `dnc_overrides` | TCPA compliance audit log | user_id, lead_id, contact info, source, reason, action |

### Ezra AI
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ezra_knowledge_base` | Vectorized knowledge for RAG | category, title, content, content_vector vector(1536), is_active |
| `ezra_conversations` | Multi-turn chat sessions | conversation_id, loan_officer_id, borrower_id, quote_data JSONB, tier_access |
| `ezra_messages` | Individual chat messages | conversation_id, role, content, model_used, metadata JSONB |

### Deal Radar
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `borrowers` | Borrower profiles | loan_officer_id, credit_score, annual_income, debt_to_income_ratio |
| `properties` | Property records | borrower_id, address, estimated_value, property_type |
| `mortgages` | Existing mortgage data | borrower_id, loan_balance, interest_rate, monthly_payment, lien_position |

### Ecosystem & A/B Testing
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `ab_tests` | A/B test definitions | user_id, bot, category, variant_a, variant_b, results JSONB |
| `quote_chat_rate_limits` | Persistent rate limiting for quote-chat | quote_code (unique), message_count, window_start |

---

## 4. RPC Functions

### Engagement & Scoring
| Function | Purpose |
|----------|---------|
| `update_lead_engagement(lead_uuid)` | Recalculates score: +5 base, +3 mobile, +10 repeat, +20 apply |
| `get_hot_leads(score_threshold, hours_window)` | Returns high-engagement leads by score + recency |

### A/B Testing & Prompts
| Function | Purpose |
|----------|---------|
| `get_ab_tested_prompt(bot, category, lead_id)` | Deterministic A/B routing by lead_id hash |
| `record_ab_outcome(test_id, variant, outcome)` | Track A/B results |
| `log_prompt_usage(prompt_id, bot, outcome)` | Prompt analytics (writes to lead_analytics) |

### Links & Quotes
| Function | Purpose |
|----------|---------|
| `create_short_link(...)` | Creates shortened link with optional lead_id + expiration |
| `get_link_stats(slug)` | Click stats: total, unique devices, last click, top device, top city |
| `increment_quote_view(code)` | SECURITY DEFINER — safely increments quote_links.view_count |
| `submit_quote_application(user_id, lead_id, name, email, phone, quote_code)` | Anon-callable — captures Apply Now submissions into leads |

### Utility
| Function | Purpose |
|----------|---------|
| `is_super_admin()` | SECURITY DEFINER — checks auth.uid() against Eddie's UUID |
| `cleanup_quote_chat_rate_limits()` | Deletes expired rate limit rows (>1 hour old) |

---

## 5. Frontend Features by Tab

### Client Tab
- HELOC quote builder (home value, mortgage balance, credit score, cash out)
- 3-tier rate display (Tier 1 / Tier 2 / Tier 3)
- Monthly payment calculations
- Debt consolidation calculator (Titanium+)
- Refi comparison analyzer (Titanium+)
- Break-even calculator (Titanium+)

### Quotes Tab
- Quote library with search + status filters (draft, sent, accepted, funded)
- Bulk select, delete, cloud export (CSV/JSON)
- Quote sharing: client link generation, SMS copy, email templates

### Leads Tab
- Lead pipeline with 1000-lead display
- Property detail subtitle: Credit, Value, Mortgage, Cash Out, Address
- Source badges (bonzo, ghl, webhook, csv, manual, zapier, n8n, leadmailbox)
- Status dropdown (New, Contacted, Qualified, Closed)
- Engagement analytics (quote views badge)
- DNC toggle badges with TCPA compliance
- Search, filter by status/source, bulk actions
- Bonzo sync with quantity chooser (50/200/500/ALL)

### Rates Tab
- 3-tier rate configuration with preset selectors
- Manual entry toggle for exact rate sheets
- Google Sheets rate center integration

### LO Profile Tab
- Loan officer info (name, company, phone, email, NMLS)
- Headshot upload to Supabase Storage
- Rate preferences

### Integrations Tab (Tier-Gated Subsections)
| Section ID | Feature | Min Tier |
|-----------|---------|----------|
| `int-bonzo` | Bonzo CRM sync + API config | Carbon |
| `int-radar` | Deal Radar equity scanner | Titanium |
| `int-ai` | AI provider config (multi-provider) | Titanium (basic) / Platinum (full) |
| `int-ghl` | GHL CRM integration | Platinum |
| `int-crm` | CRM sync settings | Platinum |
| `int-crm-inbound` | Inbound webhook config | Platinum |
| `int-crm-fub` | Follow-up workflows | Platinum |
| `int-webhooks` | Outbound webhooks | Platinum |
| `int-n8n` | n8n workflow automation | Obsidian |

### White Label Tab (Obsidian+)
- Company branding (logo, colors)
- Custom domain settings

### Parser Tab (Admin+)
- Lender portal paste parser (Figure, Blend, others)
- Email-based lead import

### Email Tab (Admin+)
- Email templates with `{{QUOTE_LINK}}` variable
- Sequence management

### Super Admin Tab (super_admin only)
- User management table with search
- Edit role, tier, subscription_status, discount, billing
- Per-user API key management
- Impersonate user (View As)
- Reset password, suspend, delete user

---

## 6. Tier Feature Matrix

| Feature | Carbon (0) | Titanium (1) | Platinum (2) | Obsidian (3) | Diamond (4) |
|---------|:---------:|:----------:|:-----------:|:-----------:|:----------:|
| Quote Builder | Yes | Yes | Yes | Yes | Yes |
| PDF Generation | Yes | Yes | Yes | Yes | Yes |
| Client Links | Yes | Yes | Yes | Yes | Yes |
| Rate Tiers | Yes | Yes | Yes | Yes | Yes |
| Leads Pipeline | Locked | Yes | Yes | Yes | Yes |
| Debt Consolidation | Locked | Yes | Yes | Yes | Yes |
| Refi Comparison | Locked | Yes | Yes | Yes | Yes |
| Break-Even Calc | Locked | Yes | Yes | Yes | Yes |
| Apply Link | Hidden | Yes | Yes | Yes | Yes |
| Basic AI (15/day) | No | Yes | Yes | Yes | Yes |
| Address Autocomplete | No | Yes | Yes | Yes | Yes |
| Ezra on Client Links | No | Yes | Yes | Yes | Yes |
| Deal Radar | No | Yes | Yes | Yes | Yes |
| GHL Integration | No | No | Yes | Yes | Yes |
| Bonzo Full Sync | No | No | Yes | Yes | Yes |
| n8n Workflows | No | No | Yes | Yes | Yes |
| Outbound Webhooks | No | No | Yes | Yes | Yes |
| Lender Parser | No | No | Yes | Yes | Yes |
| Full AI (50/day) | No | No | Yes | Yes | Yes |
| Link Shortener | No | No | Yes | Yes | Yes |
| Client Quote Link | No | No | Yes | Yes | Yes |
| White Label | No | No | No | Yes | Yes |
| Company Settings | No | No | No | Yes | Yes |
| PDF Templates | No | No | No | No | Yes |
| Advanced Analytics | No | No | No | No | Yes |
| Unlimited AI | No | No | No | No | Yes |

---

## 7. Client Quote Page (Public)

Served at `/client-quote.html?code={QUOTE_CODE}` — no auth required.

### Components
- Quote summary card (home value, mortgage balance, HELOC amount, cash available, rates)
- Rate tier comparison table with monthly payments
- **Apply Now** button (primary CTA) — opens lead capture modal, submits via `submit_quote_application` RPC
- **Ask Question** button — opens Ezra chat or contact form
- **Save PDF** / **Share** buttons
- Light/dark theme toggle

### Ezra Chat Widget
- Floating orb icon (bottom-right)
- Sales-closer system prompt tailored to quote + LO info
- 20 messages/hour rate limit (persistent via `quote_chat_rate_limits`)
- Markdown rendering, quick-action chips
- CTA guidance toward Apply Now

---

## 8. Onboarding & Tour Systems

### OnboardingWizard (9 Steps)
1. Welcome
2. LO Profile (name, company, headshot)
3. Company & Branding (logo, colors)
4. Rate Configuration (tier presets)
5. CRM Selection (Bonzo / GHL / Both / None)
6. Integrations (filtered by CRM choice)
7. Automations (auto-push, follow-up, webhooks)
8. Feature Tour Recap
9. Completion

### WalkthroughTour (8 Steps)
- Spotlight annotations on key UI elements
- Skip/Prev/Next navigation
- Per-user localStorage persistence

### InteractiveDemo (10 Steps)
- Auto-playing demo with typing effects + simulated clicks
- Form state save/restore (no production data pollution)
- Controls: Pause/Resume, Skip, Exit
- Progress bar + step counter

---

## 9. Security & Compliance

### Authentication
- Supabase JWT with `auth.getUser(token)` on all protected endpoints
- Super admin: UUID `795aea13-6aba-45f2-97d4-04576f684557`
- Roles: `user`, `admin`, `super_admin`
- Per-user API key storage in `user_integrations.metadata` JSONB

### RLS Policy Architecture
- `profiles`: Hardcoded UUID for super_admin (NOT `is_super_admin()` — prevents recursion)
- All other tables: `is_super_admin()` SECURITY DEFINER function
- Naming: `{table}_own_{action}` (user), `{table}_sa_{action}` (super admin)

### DNC Compliance (3-Layer)
1. Local `leads.dnc` flag in Supabase
2. GHL `contact.dnd` / `dndSettings` via API
3. Bonzo contact tags (DNC, STOP, unsubscribed)
- Override requires reason, logged to `dnc_overrides` table
- TCPA audit trail

### Email
- Verified domain: `notifications.aboveallcrm.com`
- Senders: `noreply@`, `leads@`, `alerts@`
- Resend API for transactional emails

---

## 10. CRM Integrations

### Bonzo v3
- Base URL: `https://app.getbonzo.com/api/v3` (NOT `api.getbonzo.com`)
- Endpoints: `GET/POST /prospects`, `PUT /prospects/{id}`, `POST /prospects/{id}/sms`, `POST /prospects/{id}/email`
- API key priority: `apiKey2` (JWT) > `apiKey`
- Custom fields: array `[{key, value}]` or flat object format
- DNC: check tags for DNC/STOP/unsubscribed

### GHL (GoHighLevel)
- Location ID: `eVB3bUDr8bdQfRu6ae03`
- Custom field keys: `contact.field_name` format
- DND checking via `contact.dnd` / `dndSettings`

### n8n
- Instance: `https://n8n.srv1290585.hstgr.cloud/`
- Webhook: `/webhook/leadmailbox-webhook`
- LO click notifications via n8n webhook

### LeadMailbox
- Custom field format: `field_XXX`
- Mortgage-specific data extraction

---

## 11. Ecosystem Features (All 9 Implemented)

1. **Link Shortener** — `redirect` edge function, domain `go.aboveallcrm.com`, 7-day expiration
2. **Click Tracking** — `clicks` table, IP hashing, device/city detection
3. **Click-Notify Chain** — `trg_click_notification` trigger → `click_notifications` queue → `click-notify` → n8n webhook → SMS to LO
4. **Engagement Scoring** — `update_lead_engagement()` RPC (+5 base, +3 mobile, +10 repeat, +20 apply)
5. **Hot Leads** — `get_hot_leads()` RPC for high-engagement lead filtering
6. **A/B Testing** — `ab_tests` table + `get_ab_tested_prompt()` deterministic routing
7. **Prompt Management** — `log_prompt_usage()` analytics + variant tracking
8. **Knowledge Base** — `ezra_knowledge_base` with pgvector + IVFFlat index
9. **Rate Limiting** — `quote_chat_rate_limits` table (20 msg/hr persistent)

---

## 12. Recent Hardening & Optimization (March 2026)

### Edge Function Security
- `deal-radar`: Rewritten to use `leads` table (was referencing non-existent tables); `verify_jwt = true`
- `send-alert-email`: Added JWT auth (was completely open)
- `bonzo-sync`: Stripped debug data from error responses (API key + raw logs leaked to browser)
- `bonzo-webhook`: Token verification on inbound webhooks

### SQL Fixes
- `get_link_stats`: Fixed reference to non-existent `ip_address` column (uses `ip_hash`)
- `quote_links`: Replaced over-permissive anon UPDATE policy with `increment_quote_view` SECURITY DEFINER RPC
- `quote_chat_rate_limits`: Created missing table needed by `quote-chat` edge function

### Code Cleanup
- 9 dead JS files archived to `js/archive/`
- 2 dead edge functions archived to `supabase/functions/_archive/`
- 2 superseded Ezra migrations archived to `supabase/migrations_archive/deprecated/`
- CSS dedup, `@media` consolidation, `captureProposal` helper refactored
- Hardcoded super_admin email removed from `auth.js`

### Leads Table UI
- Property detail subtitle enlarged (8px to 9px) and widened (220px to 320px)
- Property address now shows inline with pin icon (was tooltip-only)
- Name column min-width increased to 240px

---

## 13. File Structure

```
AboveAllCarbon_HELOC_v12_FIXED.html   — Main app (8000+ lines)
client-quote.html                      — Public client quote page
login.html / register.html             — Auth pages
admin.html                             — Admin dashboard
js/
  auth.js                              — Auth module (ES module)
  supabase-client.js                   — Supabase client init
  main.js                              — App bootstrap, role/tier gating
  convex-db.js                         — Legacy Supabase adapter
  archive/                             — 9 dead JS files
supabase/
  config.toml                          — Project config
  functions/
    ai-proxy/index.ts                  — AI gateway
    bonzo-proxy/index.ts               — Bonzo API proxy
    bonzo-sync/index.ts                — Bulk Bonzo import
    bonzo-webhook/index.ts             — Inbound webhook
    deal-radar/index.ts                — Equity scanner
    quote-chat/index.ts                — Ezra on client pages
    redirect/index.ts                  — Link shortener
    send-alert-email/index.ts          — Alert emails
    track-quote-view/index.ts          — Quote view logger
    _archive/                          — 2 dead edge functions
  migrations/                          — 23 SQL migration files
  migrations_archive/deprecated/       — Archived migrations
```

---

## 14. External Service Connections

| Service | Identifier | Purpose |
|---------|-----------|---------|
| Supabase | Project `czzabvfzuxhpdcowgvam` | Database, auth, edge functions, storage |
| Bonzo | API v3 at `app.getbonzo.com` | CRM sync, SMS/email sends |
| GHL | Location `eVB3bUDr8bdQfRu6ae03` | CRM integration |
| n8n | `n8n.srv1290585.hstgr.cloud` | Workflow automation |
| Resend | Domain `notifications.aboveallcrm.com` | Transactional email |
| Google Sheets | Sheet `1AKNJF-oz7Smd...` | Rate center data |
| Vercel | `carbon-heloc.vercel.app` | Frontend hosting |
| Short links | `go.aboveallcrm.com` | Link shortener domain |

---

## 15. Key Environment Variables (Edge Functions)

| Variable | Used By |
|----------|---------|
| `SUPABASE_URL` | All functions |
| `SUPABASE_SERVICE_ROLE_KEY` | All functions |
| `RESEND_API_KEY` | send-alert-email |
| `RESEND_FROM_EMAIL` | send-alert-email |
| `ALERT_TO_EMAIL` | send-alert-email |
| `OPENAI_API_KEY` | ai-proxy (platform fallback) |
| `GEMINI_API_KEY` | ai-proxy (platform fallback) |
| `ANTHROPIC_API_KEY` | ai-proxy (platform fallback) |

---

*Generated March 7, 2026 — Above All Carbon HELOC Platform*
