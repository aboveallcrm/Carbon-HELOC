# Above All Carbon HELOC — Features & UI Tabs

## Tab Overview

| Tab | Min Role | Min Tier | Description |
|-----|----------|----------|-------------|
| Client (Quote Builder) | user | carbon | Main HELOC calculator |
| Quotes | user | carbon | Saved quote library |
| Leads | user | titanium | CRM pipeline |
| Rates | user | carbon | Rate matrix config |
| LO Profile | user | carbon | Loan officer profile |
| Integrations | user | carbon | CRM & API setup |
| White Label | user | obsidian | Branding customization |
| Lead Parser | admin | platinum | Lender portal parsing |
| Email / Share | admin | titanium | Templates & sequences |
| Super Admin | super_admin | any | User management |

---

## Client Tab — Quote Builder

### Inputs
- Client name, email, phone
- Property type: Primary Residence / Investment / Second Home
- Credit score (300–850 slider)
- Home value (triggers equity calculation)
- Mortgage balance
- HELOC / cash-out amount
- Property address (Google Places autocomplete, Titanium+)

### Real-Time Calculations
- **CLTV**: `(mortgage_balance + heloc_amount) / home_value`
- **Available equity**: 85% max LTV rule → `home_value * 0.85 - mortgage_balance`
- **Monthly payment**: P&I and Interest-Only modes
- **Terms**: 5/10/15/20/30-year options

### Rate Display
- **3-tier rate matrix**: Tier 1 (Premium) / Tier 2 (Recommended) / Tier 3 (Value)
- Fixed + Variable rate grids
- Monthly payment snapshot per tier
- Recommended tier highlighted

### Additional Calculators (Titanium+)
- **Debt Consolidation**: Side-by-side HELOC vs current debt
- **Refi Comparison**: HELOC vs cash-out refi
- **Break-Even Analysis**: Calculates months to break even on costs

### Quote Actions (top toolbar)
| Button | Tier | Action |
|--------|------|--------|
| Copy SMS | carbon | Copies pre-formatted SMS text |
| PDF | carbon | Downloads formatted quote PDF |
| Email | carbon | Opens email composer |
| Send via Bonzo | carbon | Pushes to Bonzo CRM |
| Send via GHL | platinum | Pushes to GoHighLevel |
| Generate Link | carbon | Creates short URL + QR code |
| AI Strategy | titanium | Calls ai-proxy, generates sales strategy |

### Generate Client Link Flow
1. Auto-calls `create_short_link` RPC
2. Inserts into `quote_links` table (7-day expiration)
3. Shows short URL + QR code (client-side via api.qrserver.com)
4. If HeyGen mode (Diamond): triggers video generation + polls for completion
5. SMS template auto-populates with short URL

### AI Strategy Generator
- Calls `ai-proxy` edge function
- Returns personalized sales strategy based on quote numbers
- Includes: recommended tier reasoning, objection prep, follow-up timing
- Custom prompt override available (Platinum+)

---

## Quotes Tab — Quote Library

### Features
- Table: searchable, filterable by status (draft/sent/accepted/funded)
- Columns: client name, date, amount, rate, status, view count, actions
- **Bulk actions**: select multiple → delete, export (CSV/JSON)
- **Status transitions**: New → Sent → Accepted → Funded
- **Share**: generate client link per quote (opens same flow as Client tab)
- **View count badge**: live view count from quote_links.view_count
- **Click tracking**: shows engagement from clicks table

---

## Leads Tab — CRM Pipeline

### Pipeline Metrics Bar
- Total leads
- New (last 7 days)
- Quoted (sent status)
- Applied (Applied status)
- Hottest lead engagement score

### Lead Table
**Columns**: Name | Email | Phone | Credit Score | Status | Source | Engagement | DNC | Address | Actions

**Filters**:
- Search (name/email/phone)
- Status (New/Contacted/Qualified/Closed/Applied/Won/Lost)
- Source (bonzo/ghl/webhook/csv/manual/zapier/n8n/leadmailbox)
- DNC (show/hide DNC leads)

**Lead actions** (row):
- View detail modal (full lead info)
- Edit info inline
- Change status
- Send SMS (via GHL or Bonzo)
- Send email
- Push to GHL
- Push to Bonzo
- Delete

### DNC Protection
- **DNC column**: clickable red badge toggle
- **Toggle confirmation dialog**: requires reason if enabling override
- All overrides logged to `dnc_overrides` table

### Import Options
| Method | Format | Notes |
|--------|--------|-------|
| CSV Import | .csv file | Mapped to leads schema |
| Bonzo Sync | Button | 50/200/500/ALL selector, via bonzo-sync edge fn |
| Webhook | Inbound URL | Paste into Bonzo/GHL/n8n/Zapier |

### Lead Name Display Fallback Chain
`first_name + last_name` → `metadata.raw.firstname` → email prefix → `"Unknown"`

---

## Rates Tab — Rate Matrix Config

### Configuration
- **3 tiers**: Premium / Recommended / Value
- **Per tier**: origination % + rate per term (5/10/15/20/30-year)
- **Rate types**: Fixed + Variable (separate matrices)
- **Manual override**: edit any rate cell
- **Recommended tier selector**: affects default highlighted tier on client quotes

### Rate Import
- **Paste rates**: paste raw text from Figure/Blend lender portals → auto-parsed
- **Google Sheets**: fetch from central rate center (Sheet ID: `1AKNJF-oz7SmdyhyU960U3k80XBdV6V10L-EqR2PfcDo`)

---

## LO Profile Tab

| Field | Notes |
|-------|-------|
| Name | Displayed on quote pages and PDFs |
| NMLS | License number |
| Email | Contact email for CTAs |
| Phone | Contact phone |
| Company | Company name |
| Headshot | Upload to Supabase Storage (public URL) |
| Bio | About section for client pages |
| Apply Link URL | Direct URL (bypasses modal if configured) |
| Apply Button Text | Custom CTA text |
| Email preference | Bonzo+Gmail hybrid vs direct send |
| Compliance footer | Custom TILA/RESPA disclaimer text |

---

## Integrations Tab

### int-bonzo (Carbon+)
- Bonzo Xcode (short hash for event hook auth)
- Bonzo API Key v3 (JWT Bearer for API calls)
- Inbound webhook URL (copy → paste into Bonzo Settings → Webhooks)
- Test Connection button
- Sync selector (50/200/500/ALL)

### int-radar (Titanium+)
- "Scan for Opportunities" button → calls deal-radar edge function
- Dashboard: top 5 opportunities, total tappable equity
- Per-lead: estimated equity, CLTV, recommended HELOC amount

### int-ai (Titanium+ basic / Platinum+ full)
- Provider selector: OpenAI / Gemini / Claude / Grok / DeepSeek / Groq / Perplexity
- API key input (stored in `user_integrations.heloc_keys.metadata.ai_api_key`)
- Model selector
- Test connection → calls ai-proxy check_status action

### int-ghl (Platinum+)
- Location ID
- Pipeline ID + Stage ID
- API key (stored in `heloc_settings.ghl.apiKey`)
- Custom field mapping (GHL uses `contact.field_name` format)
- Test connection

### int-n8n (Platinum+)
- Webhook URL (stored in `heloc_settings.n8n.webhookUrl`)
- Bearer token
- Events forwarded: new_quote, new_lead, status_change, engagement_update, click_notification

### int-crm-inbound (Platinum+)
- Inbound webhook URL generator
- Token generation (stored in `webhook_config.webhook_token`)
- Event type filters

### int-webhooks (Platinum+)
- Outbound webhook URLs
- Events: new_quote, new_lead, status_change, engagement_spike, quote_viewed
- Token auth per webhook
- Stored in `heloc_settings.outboundWebhooks[]`

### int-crm-fub (Platinum+)
- Follow Up Boss API key
- Pipeline stage mapping

### int-heygen (Diamond only)
- HeyGen API key
- Avatar ID (create at heygen.com/avatar)
- Voice ID (optional, blank = avatar default)
- Script editor with character counter (1500 char limit)
- Regenerate script button
- Test connection

---

## White Label Tab (Obsidian+)

- **Company logo**: upload to Supabase Storage
- **Color scheme presets**: Enhanced (default) / Original / Minimal / Custom / Obsidian
- **Custom apply link**: override platform default
- **PDF branding**: logo + colors on downloaded PDFs
- **Email footer**: custom compliance text

---

## Lead Parser Tab (Admin+)

- Paste lender portal data (Figure, Blend, other portals)
- Auto-extracts: borrower name, email, phone, credit score, home value, loan amount, rate
- Creates lead record from parsed data
- Email-based import option

---

## Email / Share Tab (Admin+)

### Email Templates
- Pre-built HTML email with token substitution:
  - `{{QUOTE_LINK}}` — client quote URL
  - `{{REC_PAYMENT}}` — recommended monthly payment
  - `{{LO_EMAIL}}` — LO email address
  - `{{APPLY_LINK}}` — apply now URL
  - `{{CLIENT_NAME}}` — client's name
- Dark/light mode email support
- Send via: Gmail OAuth / Bonzo / GHL

### SMS Templates
- 3 pre-built SMS messages with real quote data interpolated
- Character counter (160 char limit awareness)
- Lead selection dropdown
- Copy-to-clipboard

### Follow-Up Sequences (Platinum+ with n8n)
- Multi-step follow-up automation
- Triggers sent to n8n webhook
- Timing: 1h, 24h, 3d, 7d, 14d options

---

## Super Admin Tab

### User Management Table
- All registered users with: email, role, tier, status, created date
- Search + filter by role/tier/status
- **Edit modal per user**:
  - Role: user / admin / super_admin
  - Tier: carbon / titanium / platinum / obsidian / diamond
  - Subscription status: trialing / active / canceled
  - Discount (%)
  - Billing notes
- **Delete user** (with confirmation)
- **Impersonate (View As)**: 1-hour session, read-only mode option
- **Export CSV**: all users with metadata

### Per-User API Key Management
Manage integration keys on behalf of any user:
- AI provider + API key
- AI model preference
- GHL API key
- Bonzo Xcode + API key
- n8n webhook URL
- FUB API key

Stored in `user_integrations` table with provider `heloc_keys`.

### System Config
- Feature flag toggles
- Rate limit overrides
- Email domain verification status
- Platform-wide AI key pool management

---

## Command Palette (Cmd/Ctrl + K)

Full command palette with 40+ commands grouped by category.

### Categories
- **Client**: new quote, clear form, copy SMS, generate link, download PDF
- **Leads**: open pipeline, import CSV, sync Bonzo, new lead
- **Rates**: edit rates, import from lender, connect Google Sheets
- **Integrations**: setup Bonzo, connect GHL, configure AI
- **Analytics**: open Deal Radar, view engagement
- **Settings**: edit profile, company settings, billing
- **Help**: keyboard shortcuts, docs, walkthrough

### Navigation
- Fuzzy search across all commands
- Keyboard shortcuts shown inline
- Enter to execute, Esc to close
- Arrow keys for navigation

---

## Onboarding Wizard (9 Steps)

Runs on first login. Per-user completion tracking.

| Step | Content |
|------|---------|
| 1. Welcome | Tier feature overview |
| 2. LO Profile | Name, company, headshot upload |
| 3. Company | Details, NMLS, address |
| 4. Rates | Initial 3-tier matrix setup |
| 5. CRM Selection | Bonzo / GHL / Both / None → saves to `profiles.crm_preference` |
| 6. Integrations | Setup cards filtered by CRM selection |
| 7. Automations | Checkboxes: auto-push, follow-up, webhooks per CRM |
| 8. Tour Recap | Feature summary by tier |
| 9. Done | Completion screen, offers Interactive Demo |

### Connection Test
Each integration card in step 6 has:
- Input fields for credentials
- Test Connection button with visual pass/fail feedback
- Help text per integration type

---

## Walkthrough Tour (8 Steps)

- Spotlight highlighting on key UI elements
- Step-by-step narrative with scroll-to-element
- Step 1: Quote Builder → 2: Rates → 3: Client Link → 4: Leads → 5: AI Strategy → 6: Integrations → 7: Deal Radar → 8: Super Admin
- Next/Previous/Skip/Restart navigation
- Per-user progress saved to localStorage
- Accessible from toolbar "?" button

---

## Interactive Demo (10 Steps)

- Auto-playing with typing effects + simulated click animations
- Isolated: saves/restores form state so demo data doesn't pollute real quotes
- Demo spotlight CSS: `#id-overlay` (z-index 55000)
- Controls: Pause/Resume, Skip, Exit
- Progress bar + step counter
- Triggers: toolbar "Demo" button or offered after onboarding
