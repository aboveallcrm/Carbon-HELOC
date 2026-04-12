# Quote Builder v2 - Complete Feature Guide

## Overview
Quote Builder v2 is a comprehensive sales tool for loan officers to build HELOC quotes quickly and professionally. It consists of 3 phases with advanced features for every stage of the sales process.

---

## Phase 1: Core Wizard (Complete ✓)

### Features
- **5-Step Wizard**: Guided quote building process
- **Lead Loading**: Import leads from Bonzo, GHL, or CRM
- **Auto-fill**: Client data populates automatically
- **PDF Generation**: Professional quote PDFs
- **Talking Points**: Sales scripts for each quote

### How to Use
1. Press **Ctrl+Q** or click "+ New Quote" button
2. Select lead source or enter manually
3. Fill in property details
4. Import or use saved rates
5. Review Ezra's recommendation
6. Generate and send

---

## Phase 2: Sales Intelligence (Complete ✓)

### Smart Defaults
- Remembers your last rates, tier, term, and preset
- Shows banner on Step 3 if < 24 hours old
- One-click apply

### Follow-Up System
- Auto-saves every quote
- Tracks status: generated → sent → viewed → responded → won/lost
- Follow-up schedule: 2, 5, 10, 30 days
- Notification when follow-ups are due
- Draft messages with one-click copy

### Objection Prep
- Pre-call briefing with likely objections
- 10 common objections with 4 responses each
- Key talking points with copy buttons
- Objection Finder for quick lookup

---

## Phase 3: Power User Features (Complete ✓)

### Voice Input
**Purpose**: Build quotes hands-free while driving or multitasking

**Commands**:
- "Load lead [name] from Bonzo"
- "Set property value to 650 thousand"
- "Cash needed is 75 thousand"
- "Purpose is debt consolidation"
- "Generate quote"
- "Next step" / "Go back"

**Usage**:
1. Hold the 🎤 button in quote builder
2. Speak your command
3. Release to execute

### Presentation Mode
**Purpose**: Full-screen client presentation for screen sharing

**Slides**:
1. Welcome (client name, purpose, amount)
2. Property (value, equity, LTV visualization)
3. Recommendation (rate, payment, why it works)
4. Comparison (vs other options)
5. Next Steps (timeline: apply → review → appraisal → close)
6. Contact (summary + QR code)

**Controls**:
- **→** or **Space**: Next slide
- **←**: Previous slide
- **F**: Fullscreen
- **Esc**: Close

**Usage**:
- Click "Presentation Mode" from Quick Actions
- Or press **Ctrl+P**
- Share screen during video call

### Deal Comparison Tool
**Purpose**: Side-by-side scenario comparison

**Comparison Types**:
- **Tiers**: T1 vs T2 vs T3
- **Terms**: 10yr vs 20yr vs 30yr
- **Competitors**: HELOC vs Cash-out Refi vs Personal Loan vs Credit Cards

**Metrics**:
- Monthly payment
- Total interest (5yr, 10yr)
- APR
- Origination fees
- Savings analysis

**Usage**:
- Click "Compare Deals" from Quick Actions
- Or press **Ctrl+Shift+C**
- Export to PDF or save for later

### Quick Actions Bar
**Floating action bar with one-click access:**

| Action | Shortcut | Description |
|--------|----------|-------------|
| New Quote | Ctrl+Q | Start quote wizard |
| Voice Input | Hold V | Voice commands |
| Presentation | Ctrl+P | Full-screen mode |
| Compare | Ctrl+Shift+C | Deal comparison |
| Objections | Ctrl+O | Objection finder |
| Follow-ups | Ctrl+F | Follow-up dashboard |
| Briefing | Ctrl+B | Pre-call briefing |

**Usage**:
- Click ⚡ button to expand/collapse
- Or press **?** to toggle
- Badges show pending follow-up count

---

## All Keyboard Shortcuts

### Global
| Shortcut | Action |
|----------|--------|
| Ctrl+Q | New Quote |
| Ctrl+P | Presentation Mode |
| Ctrl+Shift+C | Compare Deals |
| Ctrl+O | Objection Finder |
| Ctrl+F | Follow-up Dashboard |
| Ctrl+B | Pre-call Briefing |
| ? | Toggle Quick Actions |

### Presentation Mode
| Shortcut | Action |
|----------|--------|
| → / Space | Next slide |
| ← | Previous slide |
| F | Fullscreen |
| Esc | Close |

### Quote Builder
| Shortcut | Action |
|----------|--------|
| Hold V | Voice input |

---

## Ezra Integration

All Quote Builder features are accessible from Ezra's quick command menu:
- **Build Quote** - Opens quote wizard
- **Objection Finder** - Quick objection lookup
- **Quote Follow-ups** - Follow-up dashboard
- **Presentation Mode** - Full-screen presentation
- **Voice Input** - Activate voice commands

---

## Data Storage

All data is stored locally in your browser:

| Key | Data |
|-----|------|
| `quote_builder_defaults` | Last used rates/settings |
| `quote_builder_history` | Quote history & follow-ups |
| `qb_saved_comparisons` | Saved deal comparisons |

---

## Browser Support

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| Core Wizard | ✓ | ✓ | ✓ | ✓ |
| Smart Defaults | ✓ | ✓ | ✓ | ✓ |
| Follow-ups | ✓ | ✓ | ✓ | ✓ |
| Objection Prep | ✓ | ✓ | ✓ | ✓ |
| Voice Input | ✓ | ✗ | ✗ | ✓ |
| Presentation | ✓ | ✓ | ✓ | ✓ |
| Comparison | ✓ | ✓ | ✓ | ✓ |

---

## Tips for Success

### Morning Routine
1. Check follow-up dashboard (**Ctrl+F**)
2. Send any due follow-ups
3. Start new quotes with voice while reviewing leads

### Client Calls
1. Build quote before call
2. Open presentation mode (**Ctrl+P**)
3. Share screen and walk through slides
4. Use objection finder if needed (**Ctrl+O**)

### Competitive Situations
1. Build quote
2. Open comparison tool (**Ctrl+Shift+C**)
3. Show side-by-side vs competitors
4. Export PDF for client to keep

### Multi-Tasking
1. Use voice input while driving
2. "Cash needed 75 thousand"
3. "Purpose debt consolidation"
4. Review and finalize when at desk

---

## File Structure

```
js/
├── quote-builder-v2.js              # Core wizard
├── quote-builder-v2-styles.css      # Core styles
├── quote-builder-followup.js        # Follow-up system
├── quote-builder-objections.js      # Objection prep
├── quote-builder-phase2-styles.css  # Phase 2 styles
├── quote-builder-voice.js           # Voice input
├── quote-builder-presentation.js    # Presentation mode
├── quote-builder-compare.js         # Deal comparison
├── quote-builder-quick-actions.js   # Quick actions bar
└── quote-builder-phase3-styles.css  # Phase 3 styles
```

---

## Next Steps / Future Enhancements

- CRM API integration (real lead data)
- Zillow property lookup
- Email/SMS integration
- Team collaboration features
- Analytics dashboard
- Mobile app version
