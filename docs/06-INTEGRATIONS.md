# Above All Carbon HELOC — Integrations

## Bonzo CRM

**Tier**: Carbon (all users)
**API Base URL**: `https://app.getbonzo.com/api/v3`
**⚠️ Note**: `api.getbonzo.com` does NOT exist — always use `app.getbonzo.com`

### Keys Required
| Key | Where to find | Purpose |
|-----|--------------|---------|
| Xcode | Bonzo → Settings → API/Integrations | Event hook authentication |
| API Key (v3 JWT) | Same page, separate field | Bearer token for API calls |

**Priority**: API Key v3 (JWT) preferred. Xcode is NOT a Bearer token — only used for webhook auth.

### Stored In
`user_integrations` WHERE provider='heloc_settings' → `metadata.bonzo.apiKey` (Xcode) + `metadata.bonzo.apiKey2` (JWT)

### Capabilities
| Action | bonzo-proxy Action | Notes |
|--------|-------------------|-------|
| Create prospect | `create_contact` | POST /v3/prospects |
| Search by email/phone | `search_contact` | GET /v3/prospects?search= |
| Update prospect | `update_contact` | PUT /v3/prospects/{id} |
| Send SMS | `send_sms` | POST /v3/prospects/{id}/sms |
| Send email | `send_email` | POST /v3/prospects/{id}/email |
| Get prospect | `get_contact` | GET /v3/prospects/{id} |
| List campaigns | `list_campaigns` | GET /v3/campaigns |
| List tags | `list_tags` | GET /v3/tags |
| Check DNC tags | via `search_contact` then check tags | Tags: DNC, STOP, unsubscribed |
| Bulk sync | bonzo-sync edge fn | 50/200/500/ALL |

### Inbound Webhook (Bonzo → Carbon)
Paste this URL into Bonzo → Settings → Webhooks:
```
https://czzabvfzuxhpdcowgvam.supabase.co/functions/v1/bonzo-webhook
  ?user_id={YOUR_USER_UUID}
  &source=bonzo
  &token={YOUR_WEBHOOK_TOKEN}
```

The webhook token is auto-generated in the Integrations tab → Bonzo section.

### DNC Checking
Before any Bonzo send, `checkBonzoDNC(email)` is called:
1. Search contact by email
2. Check tags array for: `DNC`, `STOP`, `unsubscribed` (case-insensitive)
3. If found: blocks send + shows warning modal

---

## GoHighLevel (GHL)

**Tier**: Platinum+
**Location ID**: `eVB3bUDr8bdQfRu6ae03`

### Keys Required
| Setting | Where to find |
|---------|--------------|
| API Key | GHL → Settings → API |
| Location ID | GHL → Settings → Business Profile → Location ID |
| Pipeline ID | GHL → Pipelines |
| Stage ID | Same pipeline, per stage |

### Stored In
`user_integrations` WHERE provider='heloc_settings' → `metadata.ghl`

### Custom Field Format
GHL custom fields use `contact.field_name` format (not `field_XXX`).
Example: `contact.credit_score`, `contact.home_value`, `contact.mortgage_balance`

### Capabilities
- Create/update contacts
- Send SMS (via GHL messaging)
- Send HTML email
- DND checking: `contact.dnd` + `contact.dndSettings`
- Pipeline/stage management

### DNC Checking
Before GHL send, checks:
- `contact.dnd` field (boolean)
- `contact.dndSettings` object (channel-specific DND)

---

## n8n

**Tier**: Platinum+
**Instance**: `https://n8n.srv1290585.hstgr.cloud/`
**Production Webhook**: `/webhook/leadmailbox-webhook`

### Configuration
- Webhook URL + Bearer token stored in `heloc_settings.n8n`
- Click notifications forwarded automatically (via click-notify edge fn)

### Events Forwarded
| Event | Trigger |
|-------|---------|
| `new_lead` | Lead created via webhook |
| `new_quote` | Quote generated |
| `status_change` | Lead status updated |
| `engagement_update` | Engagement score milestone |
| `click_notification` | Quote link clicked by client |
| `schedule_request` | Client requested call |

### Payload Format (click notification)
```json
{
  "event": "click_notification",
  "lead_id": "uuid",
  "lead_name": "John Doe",
  "device_type": "mobile",
  "clicked_at": "2026-03-11T12:00:00Z",
  "quote_url": "https://carbon-heloc.vercel.app/client-quote.html?code=abc123"
}
```

---

## LeadMailbox

**Tier**: Titanium+ (webhook access)
**Method**: Email-based lead delivery → n8n → bonzo-webhook

### Field Format
LeadMailbox uses `field_XXX` naming:
- `field_041` = credit score
- `field_042` = home value
- `field_043` = mortgage balance
- Other mortgage-specific fields

### Flow
```
LeadMailbox email → n8n (/webhook/leadmailbox-webhook)
  └── n8n normalizes fields
      └── POST to bonzo-webhook (source=leadmailbox)
            └── Inserts/updates lead in Carbon
```

---

## Zapier

**Tier**: Any (webhook access)
**Method**: Zapier webhook → bonzo-webhook edge function

### Setup
```
Zapier trigger → Webhook POST to:
https://czzabvfzuxhpdcowgvam.supabase.co/functions/v1/bonzo-webhook
  ?user_id={LO_UUID}
  &source=zapier
  &token={WEBHOOK_TOKEN}
```

Any standard contact field naming accepted (20+ variants normalized).

---

## HeyGen AI Video

**Tier**: Diamond only
**API Version**: Generate v2, Status v1

### Configuration (in int-heygen section)
| Field | Required | Notes |
|-------|----------|-------|
| API Key | Yes | From heygen.com dashboard |
| Avatar ID | Yes | Create 2-min training video at heygen.com/avatar |
| Voice ID | No | Leave blank for avatar's default voice |

### Stored In
`user_integrations` WHERE provider='heloc_settings' → `metadata.heygen`

### Video Generation Flow
1. LO sets video mode to "HeyGen" in Presentation Controls
2. On `generateClientLink()`:
   a. Call generate-video edge fn (`action: 'generate'`)
   b. Build script from quote data: `buildHeyGenScript(quoteData)`
   c. Script uses: client name, cash amount, rate, payment, apply link
   d. Poll `action: 'poll'` up to 3 minutes (every 10s)
   e. On completion: store `videoUrl` in `heygen_videos` + `quote_links`
3. Client page: shows `<video>` tag or HeyGen share embed
4. If still processing when client opens: client polls `action: 'poll_public'` with quote_link_code

### HeyGen API Endpoints
- Generate: `POST https://api.heygen.com/v2/video/generate`
- Status: `GET https://api.heygen.com/v1/video_status.get?video_id={id}`
- Auth: `X-Api-Key: {apiKey}` header

### Script Limit
~1500 characters. `updateHeyGenCharCount()` shows live count in UI.

---

## Gmail OAuth

**Tier**: Any (uses Supabase Google OAuth)
**Method**: OAuth 2.0 with `gmail.send` + `gmail.compose` scopes

### Flow
1. User clicks "Connect Gmail" → Supabase OAuth flow
2. `captureGoogleProviderToken()` captures `provider_token` from OAuth response
3. Token stored in `user_integrations` (provider: `google_oauth`)
4. `gmail-send` edge function uses stored token for sending

### Stored In
`user_integrations` WHERE provider='google_oauth' → `metadata.provider_token`

### Token Expiry
Google OAuth tokens expire. User must re-authorize periodically. `expires_at` tracked in metadata.

---

## Resend Email

**Domain**: `notifications.aboveallcrm.com`

| Sender | Purpose |
|--------|---------|
| `noreply@notifications.aboveallcrm.com` | Supabase auth emails (signup, reset) |
| `leads@notifications.aboveallcrm.com` | Lead notification emails to LOs |
| `alerts@notifications.aboveallcrm.com` | System failure alerts (send-alert-email edge fn) |

**Env var**: `RESEND_API_KEY`
**Recipient for alerts**: `ALERT_TO_EMAIL`

---

## Google Sheets (Rate Center)

**Sheet ID**: `1AKNJF-oz7SmdyhyU960U3k80XBdV6V10L-EqR2PfcDo`

Used to fetch rate data from a central Google Sheet and populate the 3-tier rate matrix.

---

## Outbound Webhooks (Platinum+)

Configured in `int-webhooks` section. Stored in `heloc_settings.outboundWebhooks[]`.

### Config Structure
```json
[
  {
    "url": "https://your-endpoint.com/webhook",
    "token": "optional-bearer-token",
    "events": ["new_quote", "new_lead", "status_change", "quote_viewed", "engagement_spike"]
  }
]
```

### Event Payloads

**new_quote**:
```json
{
  "event": "new_quote",
  "quote_id": "uuid",
  "client_name": "John Doe",
  "amount": 75000,
  "rate": 8.5,
  "payment": 625,
  "lo_id": "uuid"
}
```

**new_lead**:
```json
{
  "event": "new_lead",
  "lead_id": "uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "source": "bonzo",
  "lo_id": "uuid"
}
```

---

## PWA Push Notifications

**Provider**: Web Push API (VAPID keys)
**Functions**: push-config (subscribe) + push-notify (send)

### Notification Types
- New lead arrived
- Quote link clicked (mobile device)
- Call scheduling request from client
- Engagement milestone (score >= threshold)

### Setup
User clicks "Enable Notifications" in Notifications tab → browser permission dialog → subscription stored in `push_subscriptions`.
