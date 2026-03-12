# Above All Carbon HELOC — Ezra AI Intelligence Suite

## Overview

Ezra is the AI-powered sales assistant embedded in the platform. It has two modes:
1. **LO-side Ezra** — in the main app, helps loan officers with sales intelligence
2. **Client-side Ezra** — on public client quote pages, closes sales for the LO

Both are powered by a local knowledge base first (zero API cost), falling back to `ai-proxy` edge function for complex questions.

---

## LO-Side Ezra (Main App)

**File**: `js/ezra-chat.js` (~300KB)
**Architecture**: Local-first, 8 specialized intelligence features

### How It Works
1. User types message or clicks a Quick Command
2. `routeToAI(message)` checks intent
3. **Local intents** are handled entirely in-browser (no API call)
4. Unrecognized intents fall through to `callAIService()` → ai-proxy → LLM

### Local Intents (Zero API Cost)
| Intent | Trigger | Function |
|--------|---------|----------|
| `quote_narrator` | "Narrate Quote" button | `narrateQuote()` |
| `followup_coach` | "Draft Message" → timing | `getFollowUpCoach()` |
| `draft_message` | "Draft Message" button | `generateMessageDrafts()` |
| `scenario_comparison` | "Compare Scenarios" button | `compareScenarios()` |
| `lead_briefing` | "Lead Briefing" button | `runLeadBriefing()` |
| `compliance_check` | "Compliance Check" button | `runComplianceCheck()` |
| `question_predictor` | "Predict Questions" button | `predictClientQuestions()` |
| `objection_*` | Objection keywords detected | `getSmartObjectionResponse()` |

---

## 8 Intelligence Features

### 1. Smart Objection Responses
**Function**: `getSmartObjectionResponse(message)`
**Trigger**: Objection keywords detected (rate, payment, credit, equity, risk, time)

- Regex-matched to objection type
- Uses **actual quote numbers** from the form (rate, payment, CLTV, equity)
- Examples of counters:
  - Rate objection: "At {rate}%, your payment is only {payment}/mo — less than a car payment"
  - Credit objection: "With your {creditScore} score, you qualify for our Tier 2 program at {rate}%"
  - Equity objection: "You have ${equity} in tappable equity at 85% CLTV"

---

### 2. Quote Summary Narrator
**Function**: `narrateQuote()`
**Button**: "Narrate Quote"

Generates a plain-English script for client conversations:
```
"Hi [Client], I've put together your personalized HELOC quote.
Based on your home value of [X], you have approximately [Y] in available equity.
Our recommended Tier 2 rate is [rate]%, giving you a monthly payment of just [payment].
This means you can access [cash] in cash..."
```
Uses live form values. Ready to read on a client call.

---

### 3. Follow-Up Timing Coach
**Function**: `getFollowUpCoach()` (async)
**Button**: "Draft Message" → timing subsection

- Queries `get_hot_leads()` RPC (leads with recent high engagement)
- Checks clicks table for recent activity
- Checks for stale leads (no activity 7+ days)
- Returns: recommended timing + channel per lead segment:
  - **Hot (high score + recent click)**: "Contact NOW — opened quote 2 hours ago"
  - **Warm (moderate activity)**: "Best time: tomorrow morning"
  - **Cold (7+ days no activity)**: "Re-engage with new value angle"

---

### 4. SMS/Email Draft Generator
**Function**: `generateMessageDrafts()`
**Button**: "Draft Message"

Returns 3 SMS templates + 1 email draft with real quote data:

**SMS Templates**:
1. Initial outreach — quote ready notification
2. Follow-up — equity highlight
3. Re-engagement — rate/urgency angle

**Email Template**:
- Subject line options
- HTML body with quote details
- Apply Now CTA button
- All `{{variables}}` replaced with actual values

**Interpolated Variables**:
- `{{client_name}}`, `{{rate}}`, `{{payment}}`, `{{equity}}`, `{{quote_link}}`

---

### 5. Scenario Comparison
**Function**: `compareScenarios()`
**Button**: "Compare Scenarios"

Side-by-side comparison of all term options:
| Term | Monthly P&I | Total Interest | Flexibility |
|------|------------|----------------|-------------|
| 5-year | $X | $X | Low |
| 10-year | $X | $X | Medium |
| 15-year | $X | $X | Medium |
| 30-year | $X | $X | High |
| Interest-Only | $X | Ongoing | Maximum |

Plain-English trade-off explanations:
- "5-year: Lowest total cost, highest monthly commitment"
- "IO: Maximum cash flow, build equity separately"

---

### 6. Lead Priority Briefing
**Function**: `runLeadBriefing()` (async)
**Button**: "Lead Briefing"

Daily digest with action plan:
- **New leads** (last 24h): names, sources, recommended first action
- **Hot leads** (high engagement): names, last activity, urgency signal
- **Stale leads** (7+ days no contact): names, days stale, re-engagement script
- Returns formatted briefing as chat message

---

### 7. Compliance Guardrails
**Function**: `runComplianceCheck()`
**Button**: "Compliance Check"

Paste any marketing copy or message → returns verdict:

**Checks For (TILA/RESPA violations)**:
- "Guaranteed approval" / "guaranteed rate"
- "No fees" / "zero closing costs" (if untrue)
- Pressure tactics: "limited time", "act now or lose"
- Tax advice: "tax deductible" (requires CPA disclaimer)
- Income predictions or ROI guarantees
- Misleading rate comparisons

**Verdicts**:
- ✅ **SAFE** — proceed with send
- ⚠️ **REVIEW** — flagged language, recommend edit
- 🚫 **DO NOT SEND** — clear violation detected

---

### 8. Client Question Predictor
**Function**: `predictClientQuestions()`
**Button**: "Predict Questions"

Generates 6–9 predicted FAQs with ready answers, sorted by likelihood.

**Conditional logic**:
- If CLTV > 80%: adds CLTV-specific questions
- If rate > 9%: adds rate comparison questions
- If cash amount > $50k: adds large-draw questions

**Example output**:
```
1. (High likelihood) "Will this affect my credit score?"
   Ready answer: "Applying requires a soft pull initially..."

2. (High likelihood) "How long does the process take?"
   Ready answer: "From application to funding typically 5 business days..."

3. (Medium) "What happens if my home value changes?"
   Ready answer: "Your HELOC is based on the appraised value at origination..."
```

---

## Local Knowledge Base

**File**: `js/ezra-chat.js` → `EZRA_KNOWLEDGE.localDocuments`
**Documents**: 45+ covering all aspects of HELOC sales
**DB Table**: `ezra_knowledge_base` (pgvector for semantic search, Platinum+)

### Document Categories
| Category | Documents | Content |
|----------|-----------|---------|
| `product_structures` | 3 | HELOC types, draw windows, repayment phases |
| `payment_rules` | 2 | P&I vs IO, payment calculation methods |
| `approval_process` | 2 | Credit requirements, LTV, timeline |
| `data_privacy` | 1 | How Carbon handles client data |
| `deal_architect` | 3 | Structuring optimal HELOC scenarios |
| `first_contact` | 4 | Cold/warm/referral/inbound call scripts |
| `use_case_selling` | 5 | Scripts per use case (debt/improvement/emergency/investment/college) |
| `closing` | 4 | Assumptive close, soft check, urgency, comparison close |
| `objections` | 12+ | Counter scripts for every objection type |
| `competitive` | 3 | HELOC vs cash-out refi vs personal loan vs credit card vs 401k |
| `sales_psychology` | 4 | Pain discovery, anchoring, social proof, curiosity gap |
| `sales_scripts` | 5 | HEAR phone framework, text-first, follow-up persistence |
| `value_proposition` | 2 | Core pitch, money-in-your-walls concept |
| `heloc_guidelines` | 3 | Program rules, origination tiers, draw windows |

---

## Quick Commands (Chat Widget)

Buttons that appear in the Ezra chat interface:

| Button | Function Called | API Cost |
|--------|----------------|----------|
| Narrate Quote | `narrateQuote()` | Free |
| Draft Message | `generateMessageDrafts()` | Free |
| Compare Scenarios | `compareScenarios()` | Free |
| Lead Briefing | `runLeadBriefing()` | Free (DB query only) |
| Compliance Check | `runComplianceCheck()` | Free |
| Predict Questions | `predictClientQuestions()` | Free |
| Handle Objection | `getSmartObjectionResponse()` | Free |
| AI Strategy | `callAIService()` | Uses tier quota |

---

## Client-Side Ezra (Quote Pages)

**File**: `client-quote.html` → `localKBResponse()` function
**Tier**: Titanium+ (shown on client quote pages)

### Local KB Response (Zero API — 13 Question Patterns)
| Pattern | Response Coverage |
|---------|-----------------|
| How HELOC works | Draw window, repayment, variable rate mechanics |
| Payments | How P&I and IO payments are calculated |
| Rates | Why rate varies, what affects it |
| Credit impact | Soft vs hard pull, score effects |
| Timeline | Application to funding (avg 5 business days) |
| Apply / next steps | How to apply, what to expect |
| Debt consolidation | Side-by-side savings comparison |
| Home improvement | ROI framing, project examples |
| Prepayment | No penalty, flexibility |
| Refinance comparison | HELOC vs cash-out refi |
| Appraisal | When needed, cost, timeline |
| Safety / trust | Regulatory disclosure, credentials |
| Fees | Typical closing cost range |

Each response uses **actual quote numbers** (rate, payment, cash available).
Each response ends with an **Apply Now CTA**.

### Fallback to ai-proxy
For questions outside the local KB patterns, the client Ezra calls `quote-chat` edge function → OpenAI (or configured provider).

**Rate limit**: 20 messages per quote code per hour.

### Auto-Popup
Ezra auto-opens 3 seconds after client loads quote page (`setTimeout` in `initEzraChat`).

---

## Ezra on Client Page — Sales Psychology Features

The `quote-chat` edge function system prompt includes:

### Objection Counters
- Rate concerns: normalize to monthly payment
- Credit concerns: emphasize available programs
- Timing concerns: "rates can change" urgency
- Risk concerns: FDIC-framing, home equity is your money

### Use-Case Selling Scripts
- **Debt consolidation**: "What are you paying in credit card interest right now?"
- **Home improvement**: "What would a kitchen remodel add to your home value?"
- **Emergency fund**: "What would it feel like to have $X available when you need it?"
- **Investment**: "What could you do with $X working for you?"

### CTAs Available
- Apply Now (links directly to LO's apply link URL)
- Schedule Call (triggers scheduling_requests insert)
- Call Me Now (same, urgent type)
- Copy Phone Number

### STOP Keyword Handling
If client types STOP/stop/UNSUBSCRIBE:
1. Ezra acknowledges the opt-out
2. `log-conversation` edge fn creates consent_vault entry (opted_out=true)
3. Stops sending further messages
