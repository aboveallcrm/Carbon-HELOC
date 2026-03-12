# Above All Carbon HELOC — Database Schema

## Critical Notes
- Column is `tier` NOT `current_tier` (profiles table)
- FK split: some tables FK to `auth.users`, some to old `public.users`
- `quotes` has NO `client_name` column — all data lives in `quote_data` JSONB

---

## Core Tables

### profiles
User metadata, role, and tier. FK → `auth.users`.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | FK → auth.users |
| email | text | |
| role | text | `user` \| `admin` \| `super_admin` |
| tier | text | `carbon` \| `titanium` \| `platinum` \| `obsidian` \| `diamond` |
| subscription_status | text | `trialing` \| `active` \| `canceled` |
| crm_preference | text | `bonzo` \| `ghl` \| `both` \| `none` (set during onboarding) |
| agent_city | text | |
| agent_phone | text | |
| agent_company | text | |
| agent_nmls | text | |
| discount | numeric | % discount for billing |
| billing_notes | text | Super admin notes |
| created_at | timestamptz | |

**RLS**: Own row select/update. Super admin uses hardcoded UUID (NOT is_super_admin() — prevents recursion).

---

### quotes
Quote documents. All calculator state in `quote_data` JSONB.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid | FK → auth.users |
| code | text UNIQUE | Short code for sharing |
| quote_data | jsonb | Full state: clientName, homeValue, mortgageBalance, helocAmount, rate, payment, tier1/2/3 rates, AI strategy, linkOptions |
| status | text | `draft` \| `sent` \| `accepted` \| `funded` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**linkOptions** (inside quote_data JSONB):
- `showVideo` — boolean
- `videoUrl` — manual video URL
- `videoMode` — `'manual'` \| `'heygen'`
- `heygenVideoId` — HeyGen video ID for polling
- `showSalesPsych` — boolean

---

### leads
Lead pipeline. Mortgage data in `metadata` JSONB.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid | FK → auth.users |
| first_name | text | |
| last_name | text | |
| email | text | |
| phone | text | |
| source | text | `manual` \| `ghl` \| `bonzo` \| `csv` \| `webhook` \| `leadmailbox` \| `zapier` \| `n8n` |
| crm_source | text | Normalized source |
| status | text | `New` \| `Contacted` \| `Qualified` \| `Closed` \| `Applied` \| `Won` \| `Lost` |
| stage | text | Pipeline stage |
| metadata | jsonb | `{ property_value, mortgage_balance, credit_score, cash_out, property_address, raw: {...} }` |
| engagement_score | integer | Calculated from clicks (see scoring system) |
| dnc | boolean | Do Not Contact flag |
| dnc_reason | text | |
| dnc_updated_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Display fallback chain**: first_name+last_name → metadata.raw fields → email prefix → "Unknown"

**Deduplication**: email (case-insensitive ilike) + phone (digits-only match). Bonzo-webhook updates existing lead instead of creating duplicate.

---

### quote_links
Client-facing quote share links.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid | FK → auth.users |
| lead_id | uuid | FK → leads |
| code | text UNIQUE | Short slug for client URL |
| short_link_id | uuid | FK → links (for go.aboveallcrm.com redirect) |
| short_url | text | Full short URL |
| view_count | integer | Incremented by track-quote-view edge fn |
| expires_at | timestamptz | Default: 7 days from creation |
| created_at | timestamptz | |

---

### links
URL shortener records. Domain: `go.aboveallcrm.com`.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid | FK → auth.users |
| slug | text UNIQUE | 6-8 char random alphanumeric |
| destination_url | text | Full target URL |
| short_url | text | `https://go.aboveallcrm.com/{slug}` |
| domain | text | Default: `go.aboveallcrm.com` |
| title | text | |
| category | text | Default: `general` |
| lead_id | uuid | FK → leads (for engagement attribution) |
| utm_source/medium/campaign | text | UTM params injected on redirect |
| click_count | integer | Auto-incremented by trigger |
| expires_at | timestamptz | |
| created_at | timestamptz | |

---

### clicks
Click analytics. Privacy-preserving (hashed IPs).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| link_id | uuid | FK → links |
| ip_hash | text | sha256(ip + slug) |
| user_agent | text | Raw user agent |
| referer | text | |
| device_type | text | `mobile` \| `desktop` \| `tablet` |
| country | text | |
| city | text | |
| clicked_at | timestamptz | |

**Triggers on INSERT**:
- `trg_increment_link_clicks` — UPDATE links SET click_count + 1
- `trg_click_notification` — resolves lead_id, creates click_notifications row, calls update_lead_engagement()

---

### user_integrations
Per-user API keys and integration config. Keys are server-side only.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid | FK → auth.users |
| provider | text | `heloc_settings` \| `heloc_keys` \| `webhook_config` \| `google_oauth` |
| api_key | text | Generic key field |
| webhook_url | text | |
| metadata | jsonb | Provider-specific config (see below) |
| created_at | timestamptz | |

**metadata structure by provider**:

`heloc_settings`:
```json
{
  "bonzo": { "apiKey": "xcode_hash", "apiKey2": "Bearer JWT" },
  "ghl": { "apiKey": "...", "locationId": "eVB3bUDr8bdQfRu6ae03", "pipelineId": "...", "stageId": "..." },
  "n8n": { "webhookUrl": "https://n8n.srv1290585.hstgr.cloud/webhook/...", "token": "..." },
  "fub": { "apiKey": "..." },
  "radar": { "enabled": true },
  "outboundWebhooks": [{ "url": "...", "events": [...], "token": "..." }],
  "heygen": { "apiKey": "...", "avatarId": "...", "voiceId": "..." }
}
```

`heloc_keys` (super admin managed per-user):
```json
{
  "ai_provider": "openai",
  "ai_api_key": "sk-...",
  "ai_model": "gpt-4o",
  "ai_max_tokens": 2000
}
```

`webhook_config`:
```json
{ "webhook_token": "..." }
```

`google_oauth`:
```json
{ "provider_token": "ya29...", "expires_at": 1234567890 }
```

---

## Ezra AI Tables

### ezra_knowledge_base
RAG knowledge documents with vector embeddings.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| category | text | See categories below |
| title | text | Document title |
| content | text | Full document text |
| content_vector | vector(1536) | pgvector embedding |
| is_active | boolean | |
| created_at | timestamptz | |

**Categories**: `product_structures`, `payment_rules`, `approval_process`, `data_privacy`, `deal_architect`, `first_contact`, `use_case_selling`, `closing`, `objections`, `competitive`, `sales_psychology`, `sales_scripts`, `value_proposition`, `heloc_guidelines`

45+ active documents covering: HELOC mechanics, payment structures, use-case selling scripts (debt consolidation, home improvement, emergency fund, investment, college tuition), objection counters (12+ types), competitive positioning vs refi/personal loans/credit cards/401k, closing techniques, HEAR phone framework, follow-up persistence strategies.

---

### ezra_conversations
Chat session records.

| Column | Type | Notes |
|--------|------|-------|
| conversation_id | uuid PK | |
| loan_officer_id | uuid | FK → auth.users |
| borrower_id | uuid | FK → leads |
| quote_data | jsonb | Snapshot of quote at conversation start |
| tier_access | text | Tier at time of conversation |
| created_at | timestamptz | |

---

### ezra_messages
Individual chat messages.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| conversation_id | uuid | FK → ezra_conversations |
| role | text | `user` \| `assistant` |
| content | text | |
| model_used | text | AI model that generated response |
| metadata | jsonb | |
| created_at | timestamptz | |

---

## Ecosystem Tables

### click_notifications
LO alert queue. Processed by click-notify edge function.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| link_id | uuid | FK → links |
| lead_id | uuid | FK → leads |
| user_id | uuid | FK → auth.users (LO to notify) |
| click_id | uuid | FK → clicks |
| click_data | jsonb | `{ device_type, ip_hash, referer, clicked_at }` |
| status | text | `pending` \| `sent` \| `failed` |
| created_at | timestamptz | |

---

### ab_tests
A/B test configuration for Ezra prompts.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid | FK → auth.users |
| bot | text | Which bot (ezra/quote-chat) |
| category | text | Prompt category |
| variant_a | text | Prompt text A |
| variant_b | text | Prompt text B |
| results | jsonb | `{ a: { wins, uses }, b: { wins, uses } }` |
| created_at | timestamptz | |

---

### quote_chat_rate_limits
Persistent rate limiting for public quote-chat endpoint.

| Column | Type | Notes |
|--------|------|-------|
| quote_code | text UNIQUE | Quote code being rate-limited |
| message_count | integer | Messages in current window |
| window_start | timestamptz | Start of current 1-hour window |

**Limit**: 20 messages per quote code per hour.

---

### consent_vault
TCPA consent and opt-out tracking.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid | FK → auth.users (LO) |
| lead_id | uuid | FK → leads |
| contact_info | text | Email/phone |
| consent_type | text | `call` \| `sms` \| `email` \| `prerecorded` |
| consent_source | text | `website` \| `verbal` \| `signup` |
| consent_text | text | Full consent language |
| revoke_method | text | How revocation was received |
| opted_out | boolean | |
| dnc_listed | boolean | |
| channels_allowed | text[] | Array of allowed channels |
| provider | text | `bonzo` \| `ghl` \| `manual` |
| metadata | jsonb | Additional context |
| created_at | timestamptz | |

**Auto-populated**: log-conversation edge function detects STOP keyword → creates opted_out=true entry.

---

### dnc_overrides
TCPA audit log when DNC is overridden.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid | FK → auth.users (who overrode) |
| lead_id | uuid | FK → leads |
| contact_info | text | Phone/email contacted |
| source | text | Where DNC was detected (local/ghl/bonzo) |
| reason | text | Required justification for override |
| action | text | What action was taken |
| created_at | timestamptz | |

---

### heygen_videos
HeyGen AI video cache.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid | FK → auth.users |
| heygen_video_id | text | HeyGen's internal video ID |
| quote_link_code | text | Associated quote link |
| script_text | text | Script used to generate (~1500 char max) |
| status | text | `pending` \| `processing` \| `completed` \| `failed` |
| video_url | text | Final deliverable URL |
| thumbnail_url | text | |
| error_message | text | |
| created_at | timestamptz | |
| completed_at | timestamptz | |

---

### scheduling_requests
Call scheduling from client chat widget.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid | FK → auth.users (LO) |
| lead_id | uuid | FK → leads |
| client_name | text | |
| client_phone | text | |
| request_type | text | `call_me_now` \| `schedule_call` \| `urgent` |
| preferred_time | text | |
| timezone | text | |
| status | text | `pending` \| `confirmed` \| `completed` \| `missed` |
| created_at | timestamptz | |
| scheduled_for | timestamptz | |
| completed_at | timestamptz | |

---

### push_subscriptions
PWA push notification device registrations.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid | FK → auth.users |
| subscription | jsonb | Web Push API subscription object |
| device_info | text | |
| is_active | boolean | |
| last_used_at | timestamptz | |
| created_at | timestamptz | |

---

### push_notification_logs
Push notification delivery tracking.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid | FK → auth.users |
| subscription_id | uuid | FK → push_subscriptions |
| notification_type | text | |
| title | text | |
| body | text | |
| data | jsonb | |
| status | text | `pending` \| `sent` \| `failed` |
| provider_response | jsonb | |
| sent_at | timestamptz | |
| delivered_at | timestamptz | |
| clicked_at | timestamptz | |

---

### lead_stage_history
Tracks status transitions for pipeline analytics.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| lead_id | uuid | FK → leads |
| stage | text | Status value at entry |
| organization_id | uuid | NULL (column exists but leads table has no org_id) |
| entered_at | timestamptz | |
| exited_at | timestamptz | Null = current stage |

**Trigger**: `lead_stage_change` fires on leads.status UPDATE → closes previous row (sets exited_at) → inserts new row.

---

## RPC Functions

### Engagement

**`update_lead_engagement(lead_uuid)`**
- Recalculates engagement_score from clicks table
- +5 base, +3 mobile, +10 repeat, +20 apply click
- Returns updated score

**`get_hot_leads(score_threshold int DEFAULT 15, hours_window int DEFAULT 72)`**
- Returns leads where engagement_score >= threshold with clicks in window
- Returns: `{ id, first_name, last_name, email, phone, engagement_score, last_click }`

### Links

**`create_short_link(p_destination_url, p_title, p_category, p_domain, p_custom_slug, p_user_id, p_lead_id, p_utm_source, p_utm_medium, p_utm_campaign)`**
- SECURITY DEFINER
- Generates 6-char random slug (8-char after 10 collision retries)
- Returns: `{ out_id, out_short_url, out_slug, out_destination_url }`
- Accessible: anon + authenticated

**`get_link_stats(p_slug text)`**
- Returns: `{ total_clicks, unique_devices, last_click, top_device, top_city }`
- Accessible: anon + authenticated

**`increment_quote_view(code)`**
- SECURITY DEFINER
- Safely increments quote_links.view_count
- Prevents direct UPDATE policy exploitation

### Applications

**`submit_quote_application(user_id, lead_id, name, email, phone, quote_code)`**
- Anon-callable (public Apply Now button)
- Creates or updates lead with application data
- Returns: `{ success, lead_id }`

### A/B Testing

**`get_ab_tested_prompt(bot, category, lead_id)`**
- Deterministic routing: hash(lead_id) % 2
- Consistent variant per lead
- Returns: `{ prompt_text, variant, test_id }`

**`record_ab_outcome(test_id, variant, outcome)`**
- Logs A/B variant performance to ab_tests.results JSONB

**`log_prompt_usage(prompt_id, bot, outcome)`**
- Tracks prompt effectiveness in lead_analytics

### Utilities

**`is_super_admin()`**
- SECURITY DEFINER
- Returns true if auth.uid() = Eddie's UUID
- Used in RLS policies for all non-profiles tables

**`cleanup_quote_chat_rate_limits()`**
- Deletes rate_limit rows older than 1 hour

**`send_push_for_schedule_request()`**
- Trigger function, fires on scheduling_requests INSERT
- Sends push notification to LO
