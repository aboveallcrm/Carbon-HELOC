# Above All Carbon HELOC — Edge Functions

All functions deployed to: `https://czzabvfzuxhpdcowgvam.supabase.co/functions/v1/`

---

## ai-proxy
**Purpose**: Universal AI gateway — routes requests to any configured AI provider.
**Auth**: `verify_jwt: false` (handles own auth internally via `supabaseAdmin.auth.getUser`)
**File**: `supabase/functions/ai-proxy/index.ts`

### Supported Providers
| Provider | Default Model |
|----------|--------------|
| OpenAI | gpt-4o |
| Google Gemini | gemini-2.0-flash |
| Anthropic Claude | claude-sonnet-4-5 |
| DeepSeek | deepseek-chat |
| Groq | llama-3.1-70b |
| Grok (xAI) | grok-beta |
| Perplexity | llama-3.1-sonar-large |

### Key Lookup Priority
1. User's own API key (from `user_integrations.heloc_keys.metadata.ai_api_key`)
2. Pool keys from env vars (`OPENAI_API_KEY_1` ... `OPENAI_API_KEY_5`)
3. Default platform key (`OPENAI_API_KEY`)

### Actions
- `check_status` — verify user's configured key is valid
- `test` — trial generation request
- `generate` — standard generation (supports streaming)

### Rate Limits (by tier)
| Tier | Daily Limit |
|------|------------|
| Carbon | 15 calls/day |
| Titanium | 20 calls/day |
| Platinum | 50 calls/day |
| Obsidian/Diamond | Unlimited |

---

## bonzo-proxy
**Purpose**: Bonzo CRM v3 API proxy — prevents CORS issues, keeps API keys server-side.
**Auth**: `verify_jwt: false` (handles own JWT auth internally)
**File**: `supabase/functions/bonzo-proxy/index.ts`
**Base URL**: `https://app.getbonzo.com/api/v3` (NOT api.getbonzo.com)

### Key Priority
`heloc_settings.bonzo.apiKey2` (JWT Bearer) → `heloc_settings.bonzo.apiKey` (Xcode)

> **Note**: The Xcode is a short hash used for event hook auth only. The JWT API key (`apiKey2`) is required for all API calls.

### Actions

| Action | HTTP | Bonzo Endpoint | Notes |
|--------|------|---------------|-------|
| `create_contact` | POST | `/v3/prospects` | Create new prospect |
| `search_contact` | GET | `/v3/prospects?search=` | Email/phone/name search |
| `update_contact` | PUT | `/v3/prospects/{id}` | Requires `contactId` |
| `send_sms` | POST | `/v3/prospects/{id}/sms` | Requires `contactId` |
| `send_email` | POST | `/v3/prospects/{id}/email` | Requires `contactId` |
| `get_contact` | GET | `/v3/prospects/{id}` | Requires `contactId` |
| `list_campaigns` | GET | `/v3/campaigns` | List all campaigns |
| `list_tags` | GET | `/v3/tags` | List all tags |

### Request Format
```json
{
  "action": "create_contact",
  "payload": { ... },
  "contactId": "optional-for-contact-specific-actions"
}
```

### Response Format
```json
{
  "success": true,
  "status": 200,
  "data": { ... }
}
```

---

## bonzo-webhook
**Purpose**: Inbound webhook for Bonzo, GHL, LeadMailbox, Zapier, n8n to push leads.
**Auth**: `verify_jwt: false` — public endpoint with optional token validation
**File**: `supabase/functions/bonzo-webhook/index.ts`

### URL Format
```
POST https://czzabvfzuxhpdcowgvam.supabase.co/functions/v1/bonzo-webhook
  ?user_id={lo_uuid}
  &source={bonzo|ghl|leadmailbox|zapier|n8n|webhook}
  &token={webhook_token}  (optional, validates against webhook_config.webhook_token)
```

### Field Normalization
Accepts 20+ field name variants and normalizes to internal schema:
- firstName / first_name / fname / contact.firstName → `first_name`
- email / emailAddress / contact.email → `email`
- phone / phoneNumber / mobilePhone / contact.phone → `phone`
- creditScore / credit_score / field_041 (LeadMailbox) → `metadata.credit_score`
- homeValue / property_value / field_XXX → `metadata.property_value`

### Deduplication
1. Check for existing lead by email (case-insensitive)
2. Check for existing lead by phone (digits only, e.g., `5551234567`)
3. If match: UPDATE existing lead (preserves engagement_score)
4. If no match: INSERT new lead

---

## bonzo-sync
**Purpose**: Bulk import of contacts from Bonzo into leads table.
**Auth**: `verify_jwt: false` (handles own JWT auth)
**File**: `supabase/functions/bonzo-sync/index.ts`

### Actions
| Action | Contacts Imported |
|--------|-----------------|
| `sync_50` | 50 (first page) |
| `sync_200` | 200 (4 pages) |
| `sync_500` | 500 (10 pages) |
| `sync_all` | All contacts (paginated) |

### Behavior
- Fetches from Bonzo v3 `/prospects` endpoint
- Normalizes each contact to leads schema
- Applies same deduplication logic as bonzo-webhook
- Returns progress count + dedup stats

---

## quote-chat
**Purpose**: Client-facing Ezra AI on public quote pages.
**Auth**: Public (no JWT)
**File**: `supabase/functions/quote-chat/index.ts`

### Rate Limiting
- 20 messages per quote code per hour
- Stored in `quote_chat_rate_limits` table (persistent across sessions)
- Returns 429 with `{ error: 'Rate limit exceeded', retryAfter: seconds }`

### Request Format
```json
{
  "message": "user question",
  "quoteCode": "abc123",
  "quoteData": { ... },
  "loInfo": { "name": "...", "email": "...", "phone": "...", "applyLink": "..." }
}
```

### System Prompt Includes
- Client's actual quote numbers (rate, payment, equity)
- LO contact info for CTA
- HELOC product education (draw window, repayment phase, variable vs fixed)
- Apply Now button guidance
- Schedule call / call me now actions
- Urgency framing ("rates can change")
- Competitive comparison scripts

### TCPA
- STOP keyword detection
- Auto-creates consent_vault entry with opted_out=true

---

## redirect
**Purpose**: URL shortener + click tracking for `go.aboveallcrm.com`.
**Auth**: Public
**File**: `supabase/functions/redirect/index.ts`

### Flow
```
GET https://go.aboveallcrm.com/{slug}
  └── Lookup slug in links table
  └── If expired: return 410 (branded expiration page)
  └── Log click (ip_hash, device_type, referer, city)
  └── Trigger: click → click_notifications → click-notify → n8n → LO SMS
  └── 302 Redirect to destination_url + UTM params injected
```

---

## click-notify
**Purpose**: Processes pending click_notifications and dispatches webhooks to LO's n8n.
**Auth**: Internal (service role key)
**File**: `supabase/functions/click-notify/index.ts`

### Flow
```
Triggered by: trg_click_notification DB trigger (async)
  └── SELECT from click_notifications WHERE status='pending'
  └── GET LO's n8n webhook URL from user_integrations
  └── POST to LO's n8n:
        { lead_id, lead_name, device_type, clicked_at, quote_url }
  └── UPDATE click_notifications SET status='sent'|'failed'
```

---

## deal-radar
**Purpose**: Scans all LO's leads for HELOC equity opportunities.
**Auth**: `verify_jwt: true`
**File**: `supabase/functions/deal-radar/index.ts`

### Actions

**`full_scan`**: Analyzes all leads for HELOC eligibility
- Reads leads.metadata (home_value, mortgage_balance, credit_score)
- Calculates tappable equity: `max(0, home_value * 0.85 - mortgage_balance)`
- Calculates CLTV: `(mortgage_balance + recommended_heloc) / home_value`
- Filters: tappable equity > 0, credit_score >= 620
- Returns top opportunities sorted by equity amount

**`get_dashboard`**: Summary stats
- Top 5 opportunities
- Total tappable equity across portfolio
- Opportunity count by credit tier

---

## generate-video
**Purpose**: HeyGen AI video generation for personalized client greetings.
**Auth**: JWT for generate/poll/check_status; unauthenticated for poll_public
**File**: `supabase/functions/generate-video/index.ts`

### Actions

| Action | Auth | Description |
|--------|------|-------------|
| `check_status` | JWT | Verify HeyGen API key is configured |
| `generate` | JWT | Generate video from script |
| `poll` | JWT | Check video status by heygen_video_id |
| `poll_public` | None | Check status by quote_link_code (client-facing) |

### HeyGen API
- Generate: `POST https://api.heygen.com/v2/video/generate`
- Status: `GET https://api.heygen.com/v1/video_status.get?video_id={id}`
- Auth: `X-Api-Key: {user's heygen api key}`
- Script limit: ~1500 characters

### Video States
`pending` → `processing` → `completed` | `failed`

### Caching
All videos cached in `heygen_videos` table. Poll by `quote_link_code` for client-side deferred polling (client page checks every 10s for up to 3 min).

---

## log-conversation
**Purpose**: Unified conversation logging with TCPA compliance.
**Auth**: `verify_jwt: false` (handles own auth for LO context; public for quote-chat context)
**File**: `supabase/functions/log-conversation/index.ts`

### Contexts
- `ezra` — LO using Ezra chat (requires JWT)
- `quote-chat` — Client on quote page (public)

### TCPA Detection
- Detects STOP keyword (exact or prefix match, case-insensitive)
- On STOP: INSERT into consent_vault with opted_out=true, dnc_listed=true
- Channels tracked: sms, email, chat

---

## get-prompt
**Purpose**: Fetch A/B tested prompt variants for Ezra.
**Auth**: Public (no JWT required — called by n8n and client-side)
**File**: `supabase/functions/get-prompt/index.ts`

### Request
```json
{ "bot": "ezra", "category": "objection_rate", "lead_id": "uuid" }
```

### Routing
- Deterministic: `hash(lead_id) % 2` — always same variant for same lead
- Ensures consistent experience per lead across sessions
- Falls back to default prompt if no A/B test configured

---

## send-alert-email
**Purpose**: Send critical failure/alert emails to admin.
**Auth**: `verify_jwt: true`
**File**: `supabase/functions/send-alert-email/index.ts`

### Email Config
- Provider: Resend API
- From: `alerts@notifications.aboveallcrm.com`
- To: `ALERT_TO_EMAIL` env var
- Used for: edge function failures, payment issues, integration errors

---

## track-quote-view
**Purpose**: Log quote page impressions.
**Auth**: Public
**File**: `supabase/functions/track-quote-view/index.ts`

### Action
Calls `increment_quote_view(code)` RPC — SECURITY DEFINER function that safely increments `quote_links.view_count` without direct table UPDATE access.

---

## gmail-send
**Purpose**: Send emails via user's authenticated Gmail account.
**Auth**: `verify_jwt: true`
**File**: `supabase/functions/gmail-send/index.ts`

### Flow
1. Verify JWT → get user_id
2. Fetch `provider_token` from `user_integrations` (provider: `google_oauth`)
3. POST to Gmail API with OAuth token
4. Returns message ID on success

### Required OAuth Scopes
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.compose`

---

## schedule-request
**Purpose**: Capture call scheduling requests from client chat widget.
**Auth**: Public (client-facing)
**File**: `supabase/functions/schedule-request/index.ts`

### Request Types
- `call_me_now` — urgent, immediate callback
- `schedule_call` — specific time preference
- `urgent` — high-priority flag

### Flow
1. INSERT into scheduling_requests
2. Trigger: `send_push_for_schedule_request()` → push notification to LO
3. Returns confirmation to client

---

## push-notify
**Purpose**: Send PWA push notifications to LO devices.
**Auth**: `verify_jwt: true`
**File**: `supabase/functions/push-notify/index.ts`

### Triggers
- New lead from webhook
- Quote link clicked (via click-notify chain)
- Call scheduling request
- Engagement milestone

### Reads from
- `push_subscriptions` WHERE user_id = target LO + is_active = true
- Sends to all active device subscriptions for that LO

---

## push-config
**Purpose**: Register a device for push notifications.
**Auth**: `verify_jwt: true`
**File**: `supabase/functions/push-config/index.ts`

### Actions
- `subscribe` — INSERT/UPSERT push_subscriptions
- `unsubscribe` — SET is_active = false

---

## Calling Edge Functions (Frontend Pattern)

```javascript
// Standard pattern (bonzo-proxy, ai-proxy, etc.)
const session = (await window._supabase.auth.getSession()).data.session;
const resp = await fetch(SUPABASE_FUNCTIONS_URL + '/bonzo-proxy', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + session.access_token
    },
    body: JSON.stringify({ action: 'search_contact', payload: { email: 'test@example.com' } })
});
const result = await resp.json();

// SUPABASE_FUNCTIONS_URL = 'https://czzabvfzuxhpdcowgvam.supabase.co/functions/v1'
```
