# DESIGN.md — Above All Carbon HELOC

Design system documentation for AI agents building or modifying UI in this project. Read this before writing any CSS, HTML, or component markup. Match existing patterns; when in doubt, copy a similar existing section verbatim and tweak.

## Design identity

**Name:** Above All Carbon HELOC
**Aesthetic:** Premium financial-services dark UI with warm gold accent. Editorial typography meets utility-dense dashboard. Think "private-banking meets operator's console."
**Primary personas:** Loan officers (internal builder tool); borrowers (client-facing quote pages).
**Emotional tone:** Confident, authoritative, quietly expensive. Not flashy. Not generic SaaS.

## Color system

### Core palette (CSS variables — use `var(--name)` always)

| Variable | Value | Usage |
|---|---|---|
| `--primary-color` | `#0f2b4c` | Deep navy. Backgrounds, headers, dark surfaces |
| `--accent-color` | `#c5a059` | Warm gold. Primary interactive accent, CTAs, key highlights |
| `--accent-dark` | `#a68543` | Gold hover states, gradient stops |
| `--accent-glow` | `rgba(197, 160, 89, 0.15)` | Gold tint for backgrounds, borders |
| `--header-bg` | `#0f2b4c` | Top nav, modal headers |
| `--bg-card` | `#111827` | Dashboard cards, elevated surfaces |
| `--slate` | `#1e293b` | Body text in light contexts |
| `--paper` | `#FDFBF7` | Off-white backgrounds (PDFs, lighter sections) |
| `--text-primary` | `#e2e8f0` | Body text on dark surfaces |
| `--text-secondary` | `rgba(255,255,255,0.6)` | Muted labels on dark surfaces |
| `--highlight-bg` | `#fffbf0` | Warm yellow tint for emphasis blocks |

### Tier colors (for tier-locked features)

| Tier | Color | Usage |
|---|---|---|
| Starter | `#6b7280` (slate-500) | Starter tier badges, locked-feature overlays |
| Pro | `#a78bfa` (violet-400) | Pro tier badges, mid-tier features |
| Enterprise | `#06b6d4` (cyan-500) | Enterprise badges, premium features |

### Semantic colors (use sparingly, accent is primary)

- Success: `#10b981` (emerald-500)
- Warning: `#f59e0b` (amber-500)
- Error: `#ef4444` (red-500)
- Info: `#3b82f6` (blue-500)
- Debt/orange: `#f97316` (for debt-consolidation sections specifically)

### Rules
- **Gold is sacred.** `--accent-color` is the signature. Use it for the primary CTA, the recommended-tier highlight, active states. Don't dilute — if a new element isn't important, don't give it gold.
- **Dark UI is the default** for the LO-facing builder. The client-facing quote page has three presets (Enhanced = dark, Minimal = dark, Original = light/paper). Default to dark.
- **Never introduce new brand colors** without updating this file. If a new section needs visual distinction, use a tinted variant of an existing color (e.g., `rgba(197,160,89,0.15)`) before reaching for a new hue.

## Typography

| Variable | Font | Usage |
|---|---|---|
| `--font-heading` | `'DM Sans', sans-serif` | Headings, buttons, labels, uppercase chips, navigation |
| `--font-body` | `'Inter', sans-serif` | Paragraph copy, input values, long-form text |

### Type scale (approximate — match nearest existing pattern)

- **Display/hero:** 24-32px, heading font, weight 700-800
- **Section title:** 14-16px, heading font, weight 700, often `text-transform: uppercase; letter-spacing: 0.5-0.8px;`
- **H4 panel header:** 11px, heading font, weight 700, uppercase, tight letter-spacing
- **Body:** 13-15px, body font, weight 400, line-height 1.5-1.7
- **Label (small-caps style):** 9-10px, heading font, weight 700, uppercase, `letter-spacing: 0.5-0.8px`
- **Help-tip text:** 8-9px, body font, opacity 0.5-0.7

### Rules
- Headings use `DM Sans` with weight 700 and often uppercase. Labels and buttons follow the same pattern at smaller sizes.
- Body text is `Inter`, normal case, comfortable line-height (1.5-1.7).
- **Numeric output (rates, payments, amounts)** uses heading font, bold, in gold on dark surfaces. Never plain body weight — financial numbers are the hero.

## Spacing

| Variable | Value |
|---|---|
| `--gap` | `12px` — default grid/flex gap |
| `--radius-sm` | `6px` — chips, small buttons |
| `--radius-md` | `10px` — cards, panels, inputs |
| `--radius-lg` | `16px` — major containers, modals |

### Patterns
- Panel internal padding: `16px`
- Control row gap: `12px`
- Card-to-card vertical margin: `8px` (collapsed) or `16px` (always-open)

## Shadow + elevation

| Variable | Value | Usage |
|---|---|---|
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.08)` | Subtle lift on small chips |
| `--shadow-md` | `0 4px 16px rgba(0,0,0,0.12)` | Cards, dropdowns |
| `--shadow-lg` | `0 12px 40px rgba(0,0,0,0.18)` | Modals, major overlays |

### Glassmorphism tokens (used on lighter backgrounds and PDFs)
- `--glass-bg`: `rgba(255,255,255,0.75)`
- `--glass-bg-dark`: `rgba(15,43,76,0.85)`
- `--glass-blur`: `blur(20px) saturate(180%)`
- `--glass-shimmer`: diagonal white gradient overlay

Use glassmorphism selectively — it's a premium cue. Don't apply it to everything.

## Core component patterns

### 1. `.control-section` (panel card)

The building block of the LO builder. Dark translucent card with backdrop blur.

```html
<div class="control-section" style="background: linear-gradient(135deg, rgba(197,160,89,0.15), rgba(166,133,67,0.15)); border-color: var(--accent-color);">
    <h4 style="font-family: var(--font-heading); color: var(--accent-color); margin: 0 0 12px 0; font-size: 11px;">
        ⚙️ Panel Title
    </h4>
    <!-- contents -->
</div>
```

**Variants by purpose** (subtle tinted backgrounds, not different structures):
- Recommendation (gold): `rgba(197,160,89,0.2)` to `rgba(166,133,67,0.2)`, `border-color: var(--accent-color)`
- Debt (orange): `rgba(249,115,22,0.1)`, `border-color: #f97316`
- Refi (blue): `rgba(59,130,246,0.1)`, `border-color: #3b82f6`
- Output (cyan): `rgba(6,182,212,0.1)`, `border-color: #06b6d4`

Always keep the dark translucent base + tinted border. Never use a solid fill.

### 2. `.toggle-switch` (custom toggle)

Rounded pill toggle with gold active state. Used for all boolean settings.

```html
<div class="toggle-container">
    <div class="toggle-switch active" id="toggle-foo" onclick="toggleSwitch(this)"></div>
    <span class="toggle-label">Label Text
        <span class="help-tip">?<span class="help-tip-text">Tooltip explaining the toggle.</span></span>
    </span>
</div>
```

- Inactive: muted grey
- Active: gold (`var(--accent-color)`)
- Always paired with a `help-tip` explaining what it does.

### 3. `<details>` collapsible panel (new standard)

Wrap large panels in `<details class="collapsible-panel" data-cp-id="slug">` with a `<summary class="cp-summary">` header. State persists to `localStorage` (handled by the init script). See existing examples in the builder for loan-options, debt, refi, recommendation, presentation-output, ai-strategy.

### 4. Buttons

- **Primary CTA:** gold gradient background, dark text, heading font, uppercase, ~12-14px
- **Secondary:** transparent, gold border, gold text
- **Danger:** red/rose tint, never the primary gold
- **Small chip:** pill-shaped (`border-radius: 999px`), 10px text, tinted background

### 5. Recommendation badges

Two variants for tier recommendations on the client quote:
- `.rec-tier-badge` (primary): gold gradient, white text, "RECOMMENDED"
- `.rec-tier-badge.alt` (secondary): slate gradient, white text, "ALTERNATIVE"

### 6. Rate tables

Dark theme: `rgba(15,23,42,0.3)` background, gold column headers, zebra rows optional. The recommended row gets a gold left-border and a faint gold background.

## Layout conventions

- **Tab-based primary nav.** LO builder has 7+ tabs (Client, Rates, Leads, Quotes, Parser, Integrations, LO Profile, Email, Super Admin).
- **Single-column content** on narrow panels (<1200px). Two-column `input-group` (flex, gap: var(--gap)) for wider sections.
- **Sticky action bar** at the top of the Client tab for primary actions (Generate Link, Preview, Send).
- **Client quote** uses `max-width: 960px` content with generous outer padding.

## Interactive states

- **Hover:** slight brightness increase (usually via `filter: brightness(1.05)` or a gold-tint background `rgba(197,160,89,0.08)`).
- **Active/pressed:** `transform: scale(0.97)` for ~100ms.
- **Focus:** gold outline (`outline: 2px solid var(--accent-color)`) — always keyboard-accessible.
- **Transitions:** default `--transition: 0.2s ease`. Don't go above 300ms.

## What to avoid

- **No Bootstrap / Tailwind utility soup.** The codebase uses scoped inline styles + component classes. Match it.
- **No generic SaaS purple/blue gradients.** Gold is the accent, period.
- **No light-mode default for LO tools.** Light mode only on the Original preset of client quotes and PDF exports.
- **No new fonts.** DM Sans + Inter, that's it.
- **No heavy emoji in production UI** — emojis are used sparingly as section icons (⚙️ Options, 💳 Debt, 🔄 Refi, 🎯 Recommendation, 📄 Output, 🤖 AI). Match existing density.
- **No box-shadow that's not in the token set.** Use `--shadow-sm/md/lg`.
- **No `!important` unless overriding a third-party stylesheet.** The codebase is large; stacking !important creates unwinnable specificity wars.

## When building new UI

1. **Find the nearest existing pattern.** Grep for a similar component (`.control-section`, `.toggle-container`, `.rate-table`, etc.) and copy its structure.
2. **Use CSS variables for every color/radius/shadow.** Hard-coded values are a bug.
3. **Tier-gate enterprise features** using `data-tier-feature="foo-enterprise"` — the existing `applyTierAccess(tier)` flow reads this attribute.
4. **Accessible interactive elements** — buttons have cursor:pointer, focus outlines, and keyboard handlers.
5. **Test on both the Enhanced (dark) and Original (light) client-quote presets** if the change affects the client page.

## Reference: existing files with strongest examples

- Builder shell + tokens: [AboveAllCarbon_HELOC_v12_FIXED.html](AboveAllCarbon_HELOC_v12_FIXED.html) lines 95-143 (CSS root variables)
- Panel pattern: search for `class="control-section"` in the builder HTML
- Toggle pattern: search for `class="toggle-switch"`
- Client quote themes: [client-quote.html](client-quote.html) lines 135-1300 (Enhanced theme), lines 7428-7700 (Minimal), lines 7709-7900 (Original)
- Rate tables: search `class="rate-table"` in client-quote.html

## For AI agents

When asked to build or modify UI in this project:
1. Read this file first.
2. Grep the existing codebase for the nearest similar component.
3. Copy the markup pattern, swap only what's required.
4. Use CSS variables for every color/radius/shadow/font.
5. If you need a color that isn't here, stop and ask — don't introduce new brand colors unilaterally.
6. Tier-gate Enterprise-only features via the existing pattern.
7. After changes, visually verify via Playwright or screenshots — don't ship "works on paper."
