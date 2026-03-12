# Above All Carbon HELOC — Client Quote Page

## Overview

The client quote page is a public, mobile-optimized page that clients see when the LO shares their HELOC quote.

**File**: `client-quote.html`
**URL Pattern**: `https://carbon-heloc.vercel.app/client-quote.html?code={QUOTE_CODE}`
**Auth**: None required — fully public
**Expiration**: Links expire after 7 days (410 page shown)

---

## Visual Design

| Property | Value |
|----------|-------|
| Background | Dark blue gradient: `#0a1628 → #132240 → #0f2b4c` |
| Accent color | Gold: `#c5a059` |
| Font | System sans-serif stack |
| Responsive breakpoints | Desktop 950px+, Tablet 768–949px, Mobile <768px |
| Theme toggle | Light/Dark (client preference, saves to localStorage) |

---

## Page Sections

### Header
- LO headshot (circular, if uploaded)
- LO name, company, NMLS number
- "Your HELOC Quote" headline
- Quote expiration notice (if within 48 hours of expiry)

### Quote Summary Card
| Field | Value Source |
|-------|-------------|
| Home Value | `quoteData.homeValue` |
| Mortgage Balance | `quoteData.mortgageBalance` |
| Available Cash | `quoteData.helocAmount` |
| CLTV | Calculated: (balance + heloc) / home value |
| Recommended Rate | `quoteData.recommendedRate` |
| Monthly Payment | `quoteData.recommendedPayment` |
| Product | Fixed vs Variable, term |

### Rate Comparison Table
3-row table showing all tiers:
| Tier | Rate | Monthly P&I | Monthly IO | Origination |
|------|------|-------------|------------|-------------|
| Tier 1 (Premium) | x.xx% | $X | $X | x% |
| Tier 2 (Recommended) ★ | x.xx% | $X | $X | x% |
| Tier 3 (Value) | x.xx% | $X | $X | x% |

Recommended tier highlighted with gold border.

### Video Section (if enabled)
- Off by default — controlled by `linkOptions.showVideo`
- **Manual URL** (`linkOptions.videoMode === 'manual'`):
  - YouTube: embed iframe from watch URL
  - Loom: embed iframe
  - Direct video: `<video>` tag (mp4/webm)
- **HeyGen AI** (`linkOptions.videoMode === 'heygen'`):
  - Polls `generate-video` edge function via `poll_public` action
  - Shows spinner + "Your personalized video is being prepared..."
  - On completion: shows video
  - HeyGen share URLs converted to embed URLs automatically

### Social Proof Bar
- "⭐⭐⭐⭐⭐ Average funding time: 5 business days"
- Testimonial carousel (if configured)

### Ezra Chat Widget (Titanium+)
- Floating gold orb (✦) bottom-right corner
- **Auto-popup**: opens 3 seconds after page load
- Chat bubble with LO name + "Ask me anything"
- Local KB responses for 13 question patterns (zero API cost)
- Falls through to `quote-chat` edge function for complex questions
- Rate limit: 20 messages per hour per quote code
- STOP keyword → opt-out handling

### Sales Psychology Elements (if enabled)
- Urgency: "Rates subject to change — lock yours today"
- Scarcity: Quote expiration countdown
- Social proof: Funded amount total (configurable)
- Loss aversion framing: "Every month you wait costs $X in interest"

---

## Call-to-Action Buttons

### Apply Now (Primary CTA)
- **If LO has `applyLink` configured**: redirects directly to that URL (no modal)
- **If no `applyLink`**: opens application modal (name, email, phone capture)
  - On submit: calls `submit_quote_application()` RPC (anon, no JWT)
  - Creates/updates lead with `status: 'Applied'`

### Ask a Question
- Opens Ezra chat widget

### Schedule a Call
- Opens scheduling modal
- Options: "Call Me Now" (urgent) / "Schedule at a Time" (picker)
- Calls `schedule-request` edge function
- LO receives push notification

### Save as PDF
- Client-side PDF generation of quote summary
- LO branding included

### Share Quote
- Copy link to clipboard
- Optional: share via SMS deep link on mobile

---

## Quote Style Presets

Controlled by `linkOptions.preset` (set by LO before sharing):

| Preset | Description |
|--------|-------------|
| **Enhanced** (default) | Full sales psychology, animations, Ezra AI, all elements |
| **Original** | Classic professional layout, minimal animations |
| **Minimal** | Clean stripped-down view, rates + CTA only |
| **Custom** | LO manually toggles each element |

`applyLinkPreset(preset)` sets the appropriate checkbox states.

---

## Presentation Control Options (Set by LO)

These are stored in `quoteData.linkOptions` when creating the link:

| Option | Default | Notes |
|--------|---------|-------|
| `showVideo` | false | Show video section |
| `videoMode` | `'manual'` | `'manual'` or `'heygen'` (Diamond) |
| `videoUrl` | null | Manual video URL |
| `heygenVideoId` | null | HeyGen video ID (set after generation) |
| `showSalesPsych` | true | Show urgency/social proof elements |
| `showEzra` | true | Show Ezra chat widget (Titanium+) |
| `showTierComparison` | true | Show 3-tier table |
| `showApplyButton` | true | Show Apply Now CTA |

---

## Disclaimer Toggle

- **Visible to**: admin + super_admin only
- Regular users see disclaimer section always-on (cannot toggle)
- `disclaimer-toggle-container` CSS: `display: none` for non-admin

---

## Page Load Flow

```
1. Parse ?code= from URL
2. Fetch quote_links + quotes JOIN from Supabase (anon key)
3. If expired: show 410 branded expiration page
4. If not found: show 404 page
5. Parse quoteData JSON
6. Render page with LO info + quote summary
7. Start 3-second Ezra auto-popup timer
8. If HeyGen mode + no video_url: start polling loop
9. Call track-quote-view edge function (increments view count)
10. Set up Apply Now button behavior
```

---

## Link Expiration Page

When a quote link has expired:
- HTTP 410 response (from redirect edge function)
- Branded page: "This quote link has expired"
- CTA: "Contact [LO Name] for an updated quote"
- LO phone + email shown
- Cannot be extended by client (LO must generate new link)

---

## Mobile Optimizations

- Sticky Apply Now button at bottom of viewport on mobile
- Tap-to-call LO phone number
- QR code for sharing on desktop (not shown on mobile)
- Swipe gestures for rate tier selector
- Large touch targets (44px minimum)
- No horizontal scroll

---

## Data Available on Page

Everything the client sees comes from the `quote_data` JSONB field plus the LO's profile:

```javascript
// Available in client-quote.html context:
quoteData = {
  clientName, email, phone,
  homeValue, mortgageBalance, helocAmount,
  creditScore, propertyType,
  recommendedTier,         // 1, 2, or 3
  tier1: { rate, payment, origination },
  tier2: { rate, payment, origination },
  tier3: { rate, payment, origination },
  aiStrategy,              // AI-generated sales strategy text (if generated)
  linkOptions: {
    showVideo, videoUrl, videoMode, heygenVideoId,
    showSalesPsych, showEzra, showTierComparison, showApplyButton,
    preset
  }
}

loInfo = {
  name, email, phone, nmls,
  company, headshot_url,
  applyLink, applyButtonText,
  bio, complianceFooter
}
```
