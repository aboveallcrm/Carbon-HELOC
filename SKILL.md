---
name: above-all-crm
description: "Mortgage quote automation tools for West Capital Lending / Above All CRM. Use when building: (1) HELOC quote calculators with tiered pricing, (2) Client-facing proposal tools with premium glassmorphism design, (3) GHL CRM integration workflows (contacts, tags, notes, opportunities, tasks, email), (4) Multi-provider AI integration (OpenAI, Gemini, Claude, DeepSeek, Groq, Grok), (5) n8n/webhook automations, (6) LeadMailbox email parsing, (7) Any Above All CRM branded tools at Carbon/Platinum/Obsidian tier levels. Includes West Cap design system, loan product specs, compliance requirements, integration patterns, and complete HELOC tool architecture."
---

# Above All CRM Development Skill

Build mortgage automation tools for West Capital Lending under the "Above All CRM" brand.

## Quick Reference

| Resource | When to Use |
|----------|-------------|
| [design-system.md](design-system.md) | Colors, fonts, themes, CSS patterns, glassmorphism, print styles |
| [loan-products.md](loan-products.md) | HELOC tiers, rate configs, PMT calculations, interest-only logic |
| [integrations.md](integrations.md) | GHL 8-step workflow, AI providers, webhooks, lead parsing |
| [heloc-tool-architecture.md](heloc-tool-architecture.md) | Complete Carbon HELOC tool structure, admin panel, password system |

## Company Info

```
West Capital Lending | NMLS# 1566096 | DRE# 02022356
17911 Von Karman Ave Suite 400, Irvine, CA 92614

Default LO: Eddie Barragan
Title: Executive Branch Manager
NMLS# 1828140 | DRE# 2227951
Email: Eddie@WestCapitalLending.com
Phone: (949) 795-2419
Website: helocwitheddie.com
Apply Link: https://heloc.westcapitallending.com/account/heloc/register?referrer=1748723f-4b74-4399-a79c-4cc2a4c8da20

Headshot: https://storage.googleapis.com/msgsndr/eVB3bUDr8bdQfRu6ae03/media/693bb3fdeac0a8d6852417e6.jpg
Company Logo: https://storage.googleapis.com/msgsndr/eVB3bUDr8bdQfRu6ae03/media/696029737cc1b904fa792d8c.png
```

## Output Standards

### File Structure
- Single HTML file with embedded CSS/JS (no build tools)
- Mobile responsive (breakpoints: 768px, 900px)
- localStorage for auto-save and settings persistence
- Password-protected admin sections (settings + admin tiers)

### Required Compliance Elements
1. LO + company license numbers (NMLS, DRE) in footer
2. Equal Housing Lender statement in legal footer
3. Disclaimer: "Not a commitment to lend. Subject to credit approval." at footer
4. "Licensed by the California Department of Financial Protection and Innovation"
5. Admin controls hidden from client/print views

### Code Patterns

```javascript
// Currency formatting
function parseNum(v) { return parseFloat(String(v).replace(/[$,]/g, '')) || 0; }
function formatCurrency(n) { return '$' + Math.round(n).toLocaleString('en-US'); }

// PMT calculation (P&I)
function calculatePMT(principal, annualRate, years) {
    const r = annualRate / 100 / 12;
    const n = years * 12;
    if (r === 0) return principal / n;
    return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

// Interest-Only calculation
function calculateInterestOnly(principal, annualRate) {
    return principal * (annualRate / 100) / 12;
}

// Password system (base64 encoded)
const SETTINGS_PASSWORD = atob('V0NMMjAyNg==');   // WCL2026
const ADMIN_PASSWORD = atob('R29vZGxpZmUyMDI2'); // Goodlife2026
```

### Print Optimization
```css
@media print {
    @page { size: letter; margin: 0.25in; }
    body { background: #fff; font-size: 9px; }
    #admin-panel, #password-modal, #floating-toolbar { display: none !important; }
    .hide-on-print, .tool-protection { display: none !important; }
}
```

## Product Tiers

| Tier | Price | Key Features |
|------|-------|-------------|
| **Carbon** | $497 | 3-tier HELOC quotes, basic themes, manual input |
| **Platinum** | $797 | All themes, lead parsing, AI integration, email/share |
| **Obsidian** | $1,297 | All Platinum + full GHL CRM workflow, auto-tagging, opportunities |

## Defaults

When not specified:
- **Theme**: WestCap Navy/Gold (glassmorphism proposal style)
- **Tier**: Carbon features with premium feel
- **Fonts**: DM Sans (headings), Inter (body)
- **Style**: Professional, elevated, premium glassmorphism
- **Tool**: Single-file HTML, 2000+ lines, localStorage persistence

## Workflow

1. Read relevant reference files for detailed specs
2. Build single-file HTML with embedded CSS/JS
3. Include all compliance elements (NMLS, DRE, disclaimers)
4. Implement password-protected admin panel with tabbed interface
5. Add localStorage auto-save for all settings
6. Include floating toolbar (Settings, Screenshot, PDF)
7. Ensure mobile responsive + print optimized
8. Test calculations: PMT, interest-only, origination fees, CLTV
