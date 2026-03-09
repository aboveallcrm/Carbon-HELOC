# Above All Carbon HELOC CRM — Master Feature Guide

> **The most advanced HELOC origination platform built for modern loan officers.**
> Single-file powerhouse with 75+ features, 5-tier access, AI-powered strategy, multi-CRM sync, and full compliance protection.

---

## Table of Contents

1. [Quote Builder & Calculator](#1-quote-builder--calculator)
2. [Multi-Tier Rate Matrix](#2-multi-tier-rate-matrix)
3. [Analysis & Strategy Modules](#3-analysis--strategy-modules)
4. [PDF & Export](#4-pdf--export)
5. [Client Quote Pages & Link System](#5-client-quote-pages--link-system)
6. [AI & Intelligent Features](#6-ai--intelligent-features)
7. [Video & Multimedia](#7-video--multimedia)
8. [CRM Integrations](#8-crm-integrations)
9. [Lead Management](#9-lead-management)
10. [Communication & Sending](#10-communication--sending)
11. [Deal Radar](#11-deal-radar)
12. [Onboarding & Guided Setup](#12-onboarding--guided-setup)
13. [Settings & Profile Management](#13-settings--profile-management)
14. [Administration & Super Admin](#14-administration--super-admin)
15. [DNC & TCPA Compliance](#15-dnc--tcpa-compliance)
16. [Analytics & Engagement Tracking](#16-analytics--engagement-tracking)
17. [Edge Functions (Serverless Backend)](#17-edge-functions-serverless-backend)
18. [Tier & Role Access Control](#18-tier--role-access-control)
19. [Responsive Design & Mobile](#19-responsive-design--mobile)
20. [Utility & UX Features](#20-utility--ux-features)

---

## 1. Quote Builder & Calculator

The core engine of Carbon HELOC — a real-time, interactive HELOC quote builder.

- **Client info capture** — name, credit score, property type, occupancy status
- **Home valuation input** — current home value with equity calculation
- **Mortgage balance tracking** — existing lien(s) against property
- **Loan amount / cash-out calculator** — desired HELOC draw amount
- **CLTV auto-calculation** — Combined Loan-to-Value (85% max)
- **Available equity display** — shows tappable equity at a glance
- **Payment calculations** — both P&I (fully amortized) and Interest-Only modes
- **Multiple term options** — 5, 10, 15, 20, and 30-year terms
- **Real-time recalculation** — all figures update instantly on input change
- **Payment type badge** — visual indicator for Interest-Only vs P&I selection

---

## 2. Multi-Tier Rate Matrix

A sophisticated 3-tier pricing strategy engine.

- **3-tier pricing display** — Tier 1 (Premium), Tier 2 (Recommended), Tier 3 (Value)
- **Fixed rate funding matrix** — rates across 5, 10, 15, 20, 30-year terms
- **Variable rate funding matrix** — separate variable rate grid
- **Recommended tier highlighting** — gold accent on Tier 2 (default)
- **Manual rate override** — per tier/term customization
- **Origination fee customization** — independent fee per tier
- **Rate selector controls** — recommended tier and term quick-select
- **Interest-only toggle** — switch entire matrix between P&I and IO
- **Rate import support** — paste from vendor portals (Figure, etc.)

---

## 3. Analysis & Strategy Modules

Deep financial analysis tools that transform quotes into compelling presentations.

### Debt Consolidation Analysis *(Titanium+)*
- List existing debts to consolidate into HELOC
- Current monthly payment totals
- Total interest savings projection
- Consolidated payment comparison
- Monthly savings calculation
- Payoff timeline visualization

### Refinance Comparison *(Titanium+)*
- Side-by-side current vs. proposed loan comparison
- Rate differential display
- Term comparison
- Monthly payment difference
- Total interest savings over loan life
- Break-even month calculation

### Break-Even Analysis *(Titanium+)*
- Origination cost vs. monthly savings calculation
- Months-to-break-even calculation
- Long-term value demonstration
- Comparison against baseline (Tier 3)

---

## 4. PDF & Export

Professional-grade document generation and cloud export.

### PDF Generation
- One-click PDF export with professional branding
- **Customizable sections** — toggle inclusion of:
  - Fixed rate matrix
  - Variable rate matrix
  - Valuation & liquidity summary
  - Payment snapshot
  - Break-even analysis
  - Debt consolidation details
  - AI strategy text
- LO branding (name, NMLS, company, headshot)
- Client name in filename

### White Label PDF *(Obsidian+)*
- Custom company logo
- Custom color schemes
- LO headshot integration
- Apply link embedding
- Custom email footer
- Professional certificate boxes

### Cloud Export
- Google Drive export
- OneDrive export
- Multi-document batching

---

## 5. Client Quote Pages & Link System

A complete client-facing presentation system with tracking and engagement tools.

### Client Quote Link Generator
- **Unique short URLs** — auto-generated via `create_short_link` RPC
- **Configurable expiration** — 7-day default, adjustable
- **Lead ID association** — links quote to lead for tracking
- **UTM parameter support** — source, medium, campaign tracking
- **Click tracking** — device type, IP hash, user agent, referer
- **QR code generation** — instant QR for print/SMS sharing
- **SMS-ready section** — textarea + copy button for quick text sends
- **Email template** — pre-built HTML email with `{{QUOTE_LINK}}` variable

### Presentation Style Presets
- **Enhanced** — full sales psychology, animations, Ezra AI chat (default)
- **Original** — classic professional layout
- **Minimal** — clean, stripped-down view
- **Custom** — user-defined section toggles

### Client Page Controls
- Show/hide video section
- Show/hide Ezra AI chat widget
- Show/hide break-even analysis
- Show/hide debt consolidation details
- Show/hide refi comparison
- Show/hide AI strategy text
- Disclaimer toggle (admin only)
- Social proof messaging ("5 days to funding")
- Apply Now button → LO's apply URL direct redirect

### Link Expiration Handling
- Expired links show branded landing page
- LO contact info on expiration page
- "Request new quote" CTA

---

## 6. AI & Intelligent Features

Multi-model AI integration for sales strategy, client communication, and deal analysis.

### AI Sales Strategy Generator *(Tier-Gated)*
- **Carbon**: Knowledge-base-only strategy (built-in rules)
- **Titanium+**: AI-enhanced (KB + OpenAI/Claude/Grok via edge function)
- **Platinum+**: Full AI with custom prompts
- **Obsidian+**: Custom system prompt override
- Generates from: credit score, CLTV, equity, rate environment, term selection
- **Output includes:**
  - Opening lines
  - "Why" statements (client benefit hooks)
  - Objection handling (rate, payment, credit, equity)
  - Sales psychology hooks
  - Strategy recommendations
- AI strategy text embeddable in PDF and client page

### Ezra AI Chat Assistant *(Titanium+)*
- **Floating chat widget** on client quote page
- Loan structuring assistant with HELOC expertise
- Per-client message history
- **Form context auto-fill** — extracts deal parameters from conversation
- Quick command buttons
- Multi-model support (Gemini, Claude, GPT)
- Conversation logging to database
- Voice input capability (speech-to-text)
- TCPA-aware (STOP keyword → consent vault)
- **Auto-popup** — appears after 3 seconds on client page
- **Daily usage limits per tier:**
  - Titanium: 15/day
  - Platinum: 50/day
  - Obsidian+: Unlimited

### AI Prompt A/B Testing
- Deterministic A/B routing by lead ID hash
- Variant outcome tracking
- Prompt usage logging
- Performance comparison

### AI Configuration *(Super Admin)*
- Provider selection (OpenAI, Claude, Grok)
- API key management (server-side only)
- Model selection
- Per-user AI key storage
- Test connection button
- Status indicator

---

## 7. Video & Multimedia

Personalized video integration for high-touch client engagement.

### HeyGen AI Video *(Diamond Only)*
- **Automated personalized video generation** from quote data
- API key, Avatar ID, Voice ID configuration
- Script auto-generation with character count tracking (~1500 char limit)
- Script regeneration and editing
- Video polling (up to 3 minutes)
- Status tracking: Pending → Processing → Completed / Failed
- Video embedding in client quote page
- HeyGen share URL → embed URL conversion
- Deferred polling for long-running jobs
- Public polling endpoint (client page can check status without auth)
- Test connection validation

### Manual Video Support *(Platinum+)*
- YouTube video URL embedding
- Loom video support
- Generic video URL support
- Video toggle on/off (off by default)

---

## 8. CRM Integrations

Deep, bidirectional sync with the CRMs loan officers actually use.

### Bonzo CRM *(All Tiers — Primary CRM)*
- Bonzo Xcode + API Key setup
- Webhook URL configuration
- **Lead sync** — 50, 200, or ALL contacts
- Bulk import with progress tracking
- Two-way sync (push + inbound webhook)
- Contact create/update (prospects API v3)
- SMS sending via Bonzo
- Quote sending via Bonzo
- Deduplication (email + phone matching)
- Contact tag management
- Test connection validation
- DNC compliance via contact tags (DNC, STOP, unsubscribed)

### GoHighLevel (GHL) *(Titanium+)*
- Private Integration API key
- Location ID, Pipeline ID, Stage ID configuration
- Lead push with custom field mapping
- Contact sync with tag management
- SMS sending via GHL API
- Email sending via GHL API (HTML)
- Two-way sync capability
- DNC compliance via `contact.dnd` / `dndSettings`
- Test connection validation

### n8n Workflow Automation *(Platinum+)*
- Webhook URL + Bearer token auth
- Lead push to n8n workflows
- Quote data push
- Custom webhook payloads
- Multiple workflow triggers
- Click notification forwarding

### Webhook Management *(Platinum+)*
- Custom outbound webhook URLs
- Token-based authentication
- Event triggers: new quote, new lead, status change, engagement, quote viewed
- Inbound webhook support (Bonzo, GHL, n8n, Zapier, LeadMailbox)
- Payload normalization across sources

### LeadMailbox Integration
- Email body parsing for lead data
- Field extraction (credit score, property value, mortgage balance, cash out)
- Custom field mapping
- Automatic lead creation

---

## 9. Lead Management

Full-featured leads pipeline with engagement tracking and bulk operations.

### Pipeline Dashboard
- Total / New / Quoted / Applied lead counts
- Hottest lead identification
- Most engaged leads ranking
- Status tile overview
- Engagement score display

### Leads Table
- Searchable by name, email, phone
- **Columns:** name, email, phone, credit score, status, source, quotes, views, DNC, date
- Status badges: New, Contacted, Quoted, Applied, Won, Lost
- Source badges: Bonzo, GHL, CSV, Manual, Webhook, Zapier, n8n
- DNC flag with clickable toggle badge
- Bulk selection checkboxes
- Status filter dropdown
- Source filter dropdown
- DNC filter option

### Lead Actions
- Edit details | Delete | View quote history
- Send email | Send SMS
- Push to GHL | Push to Bonzo
- Status transitions (Contacted → Quoted → Applied → Won/Lost)
- Bulk delete with confirmation

### Lead Sync & Import
- Sync from Bonzo (bulk import)
- Sync from GHL
- CSV import
- Auto-deduplication by email (case-insensitive) and phone (digits-only)
- Duplicate handling: update existing instead of create new
- Sync progress indicators

### Lead Cleanup Tools
- Delete leads with unknown/empty names
- Delete duplicate leads
- Bulk cleanup with confirmation
- Operation logging

---

## 10. Communication & Sending

Multi-channel quote delivery with professional templates.

### Email Sending
- **GHL direct send** — HTML email via API
- **Bonzo + Gmail hybrid** — creates contact, opens Gmail compose
- **Outlook integration** — with mail.com fallback
- Rich HTML email template with:
  - Quote summary
  - LO signature & branding
  - Apply link button
  - Quote link button
  - Compliance footer
- Template variables: `{{REC_PAYMENT}}`, `{{LO_EMAIL}}`, `{{APPLY_LINK}}`, `{{QUOTE_LINK}}`
- Email preview and test send

### SMS Sending
- GHL SMS via API
- Bonzo SMS via API
- Copy-paste SMS template with character count
- Lead selection dropdown

### Send Quote via CRM
- Send via GHL (quote HTML + contact sync)
- Send via Bonzo (quote + prospect creation)
- Send via Outlook (HTML email)
- Send via Gmail (OAuth)
- Contact enrichment on send

### QR Code Generation
- Instant QR code for any client quote link
- API-based generation
- Display in client page
- Mobile scanning support

### Screenshot & Clipboard
- Quote table screenshot capture
- Copy to clipboard (rich HTML)
- Copy SMS text
- Share functionality

---

## 11. Deal Radar

AI-powered lead opportunity scanner.

- **Full lead scan** — analyzes all leads for HELOC equity opportunities
- Home value analysis from lead metadata
- Mortgage balance evaluation
- Credit score filtering
- **Tappable equity calculation** (up to 85% CLTV)
- Opportunity ranking by equity amount
- Automated strategy recommendations per lead
- Bulk opportunity discovery
- Dashboard view of top opportunities
- Scan duration tracking
- Total equity visibility across pipeline

---

## 12. Onboarding & Guided Setup

Three-layer onboarding system ensuring every LO gets up and running fast.

### 9-Step Onboarding Wizard
1. **Welcome** — tier overview with feature list
2. **Profile** — LO name, email, company, logo, headshot
3. **Company** — company details, NMLS number, address
4. **Rates** — initial rate matrix setup
5. **CRM Selection** — Bonzo / GHL / Both / None
6. **Integrations** — setup selected CRM credentials
7. **Automations** — configure auto-push, follow-up, webhooks per CRM
8. **Tour Recap** — summary of features
9. **Done** — completion screen with demo offer
- CRM preference persists to `profiles.crm_preference`
- Auto-launches on first login, re-openable from toolbar

### 8-Step Walkthrough Tour
- Spotlight highlighting of key features
- Step-by-step narrative with scroll-to-element
- Mouse hover and button interaction guidance
- Next/Previous/Restart navigation
- Per-user progress tracking (localStorage)

### 10-Step Interactive Demo
- **Automated simulation** — typing effects, simulated clicks, spotlight
- Form state save/restore (demo data isolated from real quotes)
- Progress bar with step counter
- Pause/Resume, Skip, Exit controls
- ~2 minute demo duration
- Offered after onboarding, accessible from toolbar "Demo" button

---

## 13. Settings & Profile Management

### LO Profile Settings
- Name, NMLS number, email, phone
- Company name
- Headshot URL with upload
- Bio/about text
- Apply link URL and button text
- Email send preference (Bonzo+Gmail or direct)
- Compliance footer text

### Company Settings *(Obsidian+)*
- Company name and logo
- Branding color scheme presets
- Office address and phone
- Email domain configuration

### White Label Branding *(Obsidian+)*
- Custom company name/logo
- Color scheme presets: Enhanced, Original, Minimal, Custom, Obsidian
- Custom apply link
- PDF branding customization
- Email footer customization

---

## 14. Administration & Super Admin

### Super Admin Dashboard
- **User management table** — all users with role, tier, status, quote count, join date
- **Edit user modal:**
  - Role assignment (user / admin / super_admin)
  - Tier assignment (carbon → diamond)
  - Subscription status change
  - Discount and billing notes
- Impersonate user (login as)
- Export user list (CSV)
- User search

### Per-User API Key Management
- AI provider/key storage per user
- GHL API key per user
- Bonzo Xcode/API key per user
- n8n webhook URL per user
- FUB integration key per user
- Secure server-side storage
- Key rotation capability

---

## 15. DNC & TCPA Compliance

Enterprise-grade Do Not Call protection with full audit trail.

### DNC Protection (3-Layer Check)
1. **Layer 1: Local** — `leads.dnc` flag in Supabase
2. **Layer 2: GHL** — `contact.dnd` / `dndSettings` via API
3. **Layer 3: Bonzo** — contact tags (DNC, STOP, unsubscribed)

### Compliance Features
- Red warning modal (z-index 110000) before any send to DNC contact
- Override requires written reason
- All overrides logged to `dnc_overrides` audit table
- DNC column in leads table with clickable toggle badges
- DNC filter in leads dropdown
- Integrated into `sendViaGHL()` and `sendViaBonzo()` pipelines
- TCPA-compliant conversation logging (STOP keyword → consent vault)

---

## 16. Analytics & Engagement Tracking

### Click & Engagement Tracking
- Click events on every quote link visit
- Device type detection (mobile/desktop)
- IP address hashing (privacy-preserving)
- User agent logging
- Referer tracking

### Engagement Scoring
- Base click: **+5 points**
- Mobile click bonus: **+3 points**
- Repeat visitor: **+10 points**
- Apply link click: **+20 points**
- Score recalculation via `update_lead_engagement()` RPC

### Hot Lead Detection
- `get_hot_leads()` RPC — threshold + time-window filtering
- Hottest lead identification in pipeline dashboard
- Real-time quote view notifications for LOs

### Notification Chain (Click → LO Alert)
1. Client clicks quote link → `redirect` edge function
2. Click inserted → `trg_click_notification` trigger fires
3. Trigger resolves lead from link → updates engagement score
4. Creates `click_notifications` row
5. `click-notify` edge function sends webhook to LO's n8n URL
6. n8n workflow → SMS to loan officer

---

## 17. Edge Functions (Serverless Backend)

| Function | Purpose | Auth |
|----------|---------|------|
| `redirect` | Link shortener with click tracking & expiration | Public |
| `click-notify` | Processes click notifications → webhooks to LO | Internal |
| `bonzo-webhook` | Inbound webhook for Bonzo lead events + dedup | Token |
| `bonzo-proxy` | Bonzo API v3 proxy | No JWT |
| `bonzo-sync` | Bulk lead import from Bonzo | No JWT |
| `ai-proxy` | AI provider routing (OpenAI/Claude/Grok) | No JWT (internal auth) |
| `quote-chat` | Ezra AI chat backend (streaming) | JWT |
| `get-prompt` | Bot/n8n prompt fetching with A/B testing | Public |
| `log-conversation` | Conversation logging with TCPA compliance | JWT |
| `generate-video` | HeyGen AI video generation & polling | No JWT (internal auth) |
| `generate-qr` | QR code generation via api.qrserver.com | JWT |
| `send-alert-email` | Failure alert emails to admin via Resend | Internal |
| `track-quote-view` | Quote view analytics | Public |
| `deal-radar` | Lead opportunity scanning | JWT |

---

## 18. Tier & Role Access Control

### Tier Hierarchy

| Tier | Level | Key Unlocks |
|------|-------|-------------|
| **Carbon** | 0 | Core quote builder, PDF, LO Profile, Rates |
| **Titanium** | 1 | Leads pipeline, Debt Consolidation, Refi Comparison, Break-Even, Apply Link, Basic AI, Address Autocomplete |
| **Platinum** | 2 | GHL integration, n8n Workflows, Bonzo/FUB Full Sync, Outbound Webhooks, Lender Parser, Full AI |
| **Obsidian** | 3 | White Label Branding, Company Settings, Custom AI Prompts |
| **Diamond** | 4 | HeyGen AI Video, Priority Support, All Future Features |

- Tier-locked tabs show **upgrade overlay** (not hidden) — users see what they're missing
- Subsection-level locking within tabs

### Role Hierarchy

| Role | Access |
|------|--------|
| **User** | Client, Quotes, Leads, Rates, LO Profile, Integrations (Bonzo only) |
| **Admin** | + Settings (all subsections), Lead Parser, Email Templates |
| **Super Admin** | + Admin Dashboard, User Management, Per-User API Keys, Impersonation |

---

## 19. Responsive Design & Mobile

- **Desktop** (950px+) — full layout
- **Tablet** (768px–949px) — condensed sidebar
- **Mobile** (<768px) — stacked layout with touch-friendly controls
- Mobile leads table: 5-column optimized view
- Horizontal scroll for settings tabs on mobile
- Floating toolbar buttons
- Enlarged action buttons for touch
- SMS-ready section optimized for mobile copy/paste

---

## 20. Utility & UX Features

### Toast Notifications
- Success, error, and warning messages
- Auto-dismiss with timer
- Click-to-dismiss

### Form Management
- Field validation with required indicators
- Help tips (? icons with hover text)
- Input masks (phone, currency formatting)
- Auto-save capability

### Security & Data Protection
- Row Level Security (RLS) on all database tables
- Super admin UUID hardcoded in profile policies (prevents recursion)
- `is_super_admin()` SECURITY DEFINER function for other tables
- Server-side API key storage (never exposed to client)
- JWT authentication on protected endpoints
- Webhook token validation
- IP hashing for privacy
- Input sanitization

### Email Infrastructure
- **Domain:** `notifications.aboveallcrm.com` (Resend verified)
- Auth emails: `noreply@notifications.aboveallcrm.com`
- Lead notifications: `leads@notifications.aboveallcrm.com`
- Failure alerts: `alerts@notifications.aboveallcrm.com`

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Single HTML file, vanilla JS, inline CSS |
| Auth | Supabase Auth (email/password) |
| Database | Supabase (PostgreSQL) with RLS |
| Backend | Supabase Edge Functions (Deno/TypeScript) |
| AI | OpenAI / Claude / Grok via ai-proxy edge function |
| Video | HeyGen API v2 |
| Email | Resend API |
| CRM | Bonzo v3, GoHighLevel, n8n |
| Link Shortener | Custom edge function + `go.aboveallcrm.com` |
| PDF | Browser-based PDF generation |
| Hosting | Static files + Supabase backend |

---

*Built for Above All Home Lending — Powered by Carbon HELOC CRM*
