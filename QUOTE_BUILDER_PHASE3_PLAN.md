# Quote Builder v2 - Phase 3 Implementation Plan

## Overview
Phase 3 adds advanced features for power users: voice input for hands-free operation, presentation mode for client screen sharing, and deal comparison tools for competitive analysis.

## Features

### 1. Voice Input System
**Purpose**: Build quotes hands-free while driving, walking, or multitasking

**Features**:
- "Hey Ezra" wake word detection
- Voice commands for each step:
  - "Load lead [name] from Bonzo"
  - "Set property value to 650 thousand"
  - "Cash needed is 75 thousand"
  - "Purpose is debt consolidation"
  - "Generate quote"
- Real-time transcription display
- Voice confirmation before actions
- Error correction ("No, I said 75 not 85")

**Technical**:
- Web Speech API (SpeechRecognition)
- Fallback to manual if not supported
- Visual voice wave animation
- Push-to-talk button as alternative

### 2. Presentation Mode
**Purpose**: Full-screen, client-facing quote presentation for screen sharing

**Features**:
- Clean, minimal UI (no editing controls)
- Large, readable typography
- Step-by-step reveal (click to advance)
- Highlight key numbers
- Client-friendly language (no jargon)
- "Ask me anything" prompt at end
- QR code for client to receive quote on phone
- Print-optimized layout

**Views**:
1. Welcome slide (client name, purpose)
2. Property summary (value, equity, LTV)
3. Recommendation (tier, rate, payment)
4. Comparison (vs other options)
5. Next steps (timeline, what to expect)
6. Contact info & QR code

### 3. Deal Comparison Tool
**Purpose**: Side-by-side comparison of multiple scenarios or vs competitors

**Features**:
- Compare up to 3 scenarios:
  - Different tiers (T1 vs T2 vs T3)
  - Different terms (15yr vs 20yr vs 30yr)
  - Fixed vs Variable
- Compare vs competitor products:
  - Cash-out refinance
  - Personal loan
  - Credit cards
- Visual charts (payment comparison, total cost)
- Export comparison as PDF
- Save comparisons for later

**Calculations**:
- Total cost over 5/10/15 years
- Break-even analysis
- APR comparison
- Monthly payment difference

### 4. Enhanced Lead Intelligence
**Purpose**: Deeper insights before the call

**Features**:
- Property history (Zillow integration)
- Credit score trends (if available)
- Previous quote history
- Communication preferences
- Best time to call prediction
- Similar closed deals reference

### 5. Quick Actions Bar
**Purpose**: One-click actions from anywhere in the app

**Features**:
- Floating action bar with:
  - "+ New Quote" (Ctrl+Q)
  - "Objection Finder"
  - "Follow-up Dashboard"
  - "Presentation Mode"
  - "Voice Input"
- Collapsible to save space
- Keyboard shortcuts for all actions

## Implementation Order

### Week 1: Voice Input
1. Create `quote-builder-voice.js`
2. Add speech recognition wrapper
3. Implement command parser
4. Add voice UI (wave animation, status)
5. Test all 5 steps with voice

### Week 2: Presentation Mode
1. Create `quote-builder-presentation.js`
2. Build slide system
3. Add keyboard navigation (arrow keys)
4. Create print styles
5. Add QR code generation

### Week 3: Deal Comparison
1. Create `quote-builder-compare.js`
2. Build comparison grid
3. Add chart.js integration
4. Create export to PDF
5. Add save/load comparisons

### Week 4: Polish & Integration
1. Create Quick Actions Bar
2. Add Enhanced Lead Intelligence
3. Integrate all features into Ezra
4. Testing & bug fixes
5. Documentation

## Technical Stack
- Web Speech API (voice)
- Chart.js (comparisons)
- qrcode.js (QR codes)
- html2canvas + jsPDF (PDF export)

## Success Metrics
- Voice input completes quote in < 2 minutes
- Presentation mode used in 50%+ of client calls
- Deal comparison increases close rate by 20%
