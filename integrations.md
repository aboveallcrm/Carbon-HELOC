# Above All CRM — Integrations Reference

## System Architecture (v12)

```
┌──────────────────┐    ┌──────────────┐    ┌──────────────────────────┐
│  HELOC Quote Tool │───▶│   GHL CRM    │───▶│  Automation Workflows    │
│  (Single HTML)    │    │  (8-step)    │    │  (Tags, Tasks, Pipeline) │
└───────┬──────────┘    └──────────────┘    └──────────────────────────┘
        │
        ├──▶ Multi-Provider AI (analysis generation)
        ├──▶ html2canvas (quote image capture)
        ├──▶ Email (GHL send or mailto fallback)
        ├──▶ Webhook (custom payload for n8n/Zapier)
        └──▶ LeadMailbox (email parser for auto-fill)
```

## GoHighLevel (GHL) — v12 Eight-Step Workflow

When "Send via GHL" is triggered, the tool executes these steps sequentially with a visual status overlay:

### Step 1: Capture Quote Image
```javascript
// html2canvas captures the proposal container as a base64 PNG
const canvas = await html2canvas(document.getElementById('proposal-container'), {
    scale: 2, useCORS: true, allowTaint: true, backgroundColor: '#ffffff'
});
const imageBase64 = canvas.toDataURL('image/png');
```

### Step 2: Create/Update Contact
```javascript
// Search by email first, create if not found
const GHL_API = 'https://services.leadconnectorhq.com';
const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json'
};

// Search existing
GET  ${GHL_API}/contacts/?locationId=${locationId}&query=${email}

// Create new (if not found)
POST ${GHL_API}/contacts/
Body: { locationId, firstName, lastName, email, phone, source: 'HELOC Quote Tool', customFields }

// Update existing (if found)
PUT  ${GHL_API}/contacts/${contactId}
Body: { firstName, lastName, email, customFields }
```

### Step 3: Add Smart Tags
```javascript
POST ${GHL_API}/contacts/${contactId}/tags
Body: { tags: ['HELOC Quote Sent'] }
```

**Smart Tag System (6 categories, auto-applied):**

| Category | Condition | Tag Applied |
|----------|-----------|-------------|
| Base | Always | `HELOC Quote Sent` |
| Credit Tier | Score ≥ 740 | `Tier 1 Credit` |
| Credit Tier | Score 700-739 | `Tier 2 Credit` |
| Credit Tier | Score 660-699 | `Tier 3 Credit` |
| Credit Tier | Score < 660 | `Credit Review` |
| Property | Investment | `Investor Lead` |
| Property | Primary/2nd Home | `Primary Residence` |
| Scenario | HELOC payoff > 0 | `HELOC Refi` |
| Scenario | No payoff | `Cash Out Only` |
| Value | Cash ≥ $200k | `High Value $200k+` |
| Value | Cash ≥ $100k | `High Value $100k+` |
| Value | Cash ≥ $50k | `Mid Value $50k+` |
| Home Value | ≥ $1M | `$1M+ Property` |
| Home Value | ≥ $750k | `$750k+ Property` |
| Home Value | ≥ $500k | `$500k+ Property` |

### Step 4: Add Detailed Contact Note
```javascript
POST ${GHL_API}/contacts/${contactId}/notes
Body: { body: noteBody }
```

Note format includes emoji-formatted sections:
- 📋 HELOC QUOTE DETAILS (header)
- 📅 Date, 👤 Client, 📧 Email
- 🏠 Property Info (value, mortgage, type)
- 💰 Loan Details (payoff, cash back, total, rate, term, origination, payment)
- 📊 Client Profile (credit score, tier)
- 🏷️ Tags Applied

### Step 5: Create Opportunity (if pipeline configured)
```javascript
POST ${GHL_API}/opportunities/
Body: {
    locationId, pipelineId, pipelineStageId,
    contactId,
    name: `HELOC - ${contactName}`,
    status: 'open',
    monetaryValue: loanValue,
    source: 'HELOC Quote Tool'
}
```

### Step 6: Create Follow-Up Task
```javascript
POST ${GHL_API}/contacts/${contactId}/tasks
Body: {
    title: `Follow up on HELOC quote - ${contactName}`,
    body: `Follow up details with quote summary...`,
    dueDate: followupDate.toISOString(),  // configurable days ahead
    completed: false
}
```

### Step 7: Send Email via GHL
```javascript
POST ${GHL_API}/conversations/messages
Body: {
    type: 'Email',
    contactId,
    subject: emailSubject,       // template-processed
    html: emailHtml,             // includes quote image + CTA buttons
    emailFrom: fromEmail,        // must be GHL-verified domain
    emailFromName: fromName
}
```

Email includes:
- Template-processed body text
- Embedded quote image (base64)
- "Start Your Application" CTA button
- Optional "Book a Call" calendar button

### Step 8: Fire Webhook
```javascript
POST ${webhookUrl}
Body: {
    event: 'heloc_quote_sent',
    timestamp: ISO string,
    contact: { id, email, name, firstName, lastName, phone },
    quote: { homeValue, mortgageBalance, helocPayoff, cashBack, totalLoan, rate, term, payment, origination },
    creditProfile: { score, tier },
    property: { type, value, isInvestment },
    scenario: { type: 'heloc_refi'|'cash_out', isHighValue },
    tags: [...],
    loInfo: { name, email }
}
```

## GHL Configuration Fields

All stored in localStorage under `helocIntegrations`:

| Field | Element ID | Purpose |
|-------|-----------|---------|
| API Key | `ghl-api-key` | Bearer token (masked in UI) |
| Location ID | `ghl-location-id` | Sub-account identifier |
| From Name | `ghl-from-name` | Sender display name |
| From Email | `ghl-from-email` | Must be GHL-verified |
| Pipeline ID | `ghl-pipeline-id` | For opportunity creation |
| Stage ID | `ghl-stage-id` | Initial pipeline stage |
| Follow-up Days | `ghl-followup-days` | Days until task due (default: 2) |
| Calendar Link | `ghl-calendar-link` | Booking link for email CTA |
| Webhook URL | `ghl-webhook-url` | External automation endpoint |

### Custom Fields (12 fields pushed to GHL contact)

| Custom Field Key | Value Source |
|-----------------|-------------|
| `heloc_home_value` | Property value |
| `heloc_mortgage_balance` | 1st mortgage balance |
| `heloc_payoff` | Existing HELOC payoff |
| `heloc_cash_back` | Net cash to client |
| `heloc_total_loan` | Total HELOC amount |
| `heloc_rate` | Interest rate |
| `heloc_term` | Loan term |
| `heloc_payment` | Monthly payment |
| `heloc_origination` | Origination % |
| `heloc_credit_score` | FICO score |
| `heloc_property_type` | Property type |
| `heloc_quote_date` | Quote generation date |

## Multi-Provider AI Integration

The tool supports 6 AI providers for generating personalized loan analysis narratives.

### Supported Providers

| Provider | Model Default | Endpoint |
|----------|--------------|----------|
| **OpenAI** | gpt-4o-mini | `https://api.openai.com/v1/chat/completions` |
| **Google Gemini** | gemini-2.0-flash | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}` |
| **Anthropic Claude** | claude-sonnet-4-20250514 | `https://api.anthropic.com/v1/messages` |
| **DeepSeek** | deepseek-chat | `https://api.deepseek.com/v1/chat/completions` |
| **Groq** | llama-3.3-70b-versatile | `https://api.groq.com/openai/v1/chat/completions` |
| **xAI Grok** | grok-2-latest | `https://api.x.ai/v1/chat/completions` |

### AI Config Fields

| Field | Element ID | Purpose |
|-------|-----------|---------|
| Provider | `ai-provider` | Dropdown selector |
| API Key | `ai-api-key` | Provider API key (masked) |
| Model | `ai-model` | Auto-populated on provider change |
| Max Tokens | `ai-max-tokens` | Default: 500 |
| System Prompt | `ai-system-prompt` | Customizable analysis prompt |

### Default System Prompt
```
You are a mortgage advisor assistant for West Capital Lending. Provide a brief, 
professional analysis of this HELOC quote scenario. Focus on key benefits, 
potential considerations, and a recommendation. Keep it concise (3-4 sentences).
```

### Request Format (OpenAI-compatible providers)
```javascript
// Works for OpenAI, DeepSeek, Groq, Grok
const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
        model: modelName,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: quoteContextPrompt }
        ],
        max_tokens: maxTokens,
        temperature: 0.7
    })
});
```

### Gemini Request Format
```javascript
const response = await fetch(`${baseUrl}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        contents: [{ parts: [{ text: fullPrompt }] }],
        generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 }
    })
});
// Response: data.candidates[0].content.parts[0].text
```

### Claude Request Format
```javascript
const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
        model: modelName,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: quoteContextPrompt }]
    })
});
// Response: data.content[0].text
```

## Email Integration

### Email Template System

Templates support variable substitution via `processTemplate()`:

| Variable | Replacement |
|----------|------------|
| `{clientName}` | Client's full name |
| `{loanAmount}` | Total HELOC amount |
| `{rate}` | Interest rate |
| `{payment}` | Monthly payment |
| `{cashBack}` | Net cash to client |
| `{loName}` | Loan officer name |
| `{loPhone}` | LO phone number |
| `{loEmail}` | LO email |
| `{applyLink}` | Application URL |

### Default Email Template
```
Hi {clientName},

Thank you for your interest in a Home Equity Line of Credit!

I've prepared a personalized quote based on your property details. 
Your estimated rate starts at {rate} with a monthly payment of {payment}.

Please review the attached quote image and let me know if you have 
any questions. I'm here to help you through every step.

Best regards,
{loName}
West Capital Lending
{loPhone}
```

### Email Send Methods
1. **GHL Direct** — Sends through GHL API (tracked in CRM, branded domain)
2. **Mailto Fallback** — Opens default email client with pre-filled template

## LeadMailbox Parser

### Email Format (from lead provider)
```
Campaign = MAROON - HELOC Investment 620+
First Name = John E.
Last Name = Ooten Sr.
Phone = (951)206-5021
Email = jooten54@gmail.com
Address = 10638 Summer Breeze Drive, Moreno Valley, Ca, 92557
City = Moreno Valley
State = CA
Zip = 92557
Property Value = 550000
Current Balance = 357304
Cash out = 70000
Credit Rating = 759
```

### Parsing Logic
```javascript
function parseLeadEmail(emailText) {
    const data = {};
    emailText.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length) {
            const cleanKey = key.trim().toLowerCase().replace(/\s+/g, '_');
            const value = valueParts.join('=').trim().replace(/\.$/, '');
            data[cleanKey] = value;
        }
    });
    return data;
}
```

### Address Deduplication
LeadMailbox often duplicates city/state/zip in the address field. Use smart cleanup:
```javascript
function cleanDuplicateAddress(address) {
    if (!address) return '';
    const trimmed = address.trim();
    const stateZipPattern = /,?\s*([A-Za-z]{2}),?\s*(\d{5})(?:-\d{4})?/g;
    const matches = [...trimmed.matchAll(stateZipPattern)];
    if (matches.length >= 2 && matches[0][2] === matches[matches.length - 1][2]) {
        const firstMatchEnd = matches[0].index + matches[0][0].length;
        return trimmed.substring(0, firstMatchEnd).replace(/,\s*$/, '').trim();
    }
    return trimmed;
}
```

## Webhook Payloads (for n8n / Zapier)

### Quote Sent Event
```json
{
    "event": "heloc_quote_sent",
    "timestamp": "2026-02-03T12:00:00.000Z",
    "contact": {
        "id": "ghl_contact_id",
        "email": "client@email.com",
        "name": "John Doe",
        "firstName": "John",
        "lastName": "Doe",
        "phone": "(951)206-5021"
    },
    "quote": {
        "homeValue": 850000,
        "mortgageBalance": 400000,
        "helocPayoff": 50000,
        "cashBack": 150000,
        "totalLoan": "$200,000",
        "rate": 7.99,
        "term": 5,
        "payment": "$4,053.28",
        "origination": 2.0
    },
    "creditProfile": { "score": 740, "tier": 1 },
    "property": { "type": "Primary Residence", "value": 850000, "isInvestment": false },
    "scenario": { "type": "heloc_refi", "isHighValue": true },
    "tags": ["HELOC Quote Sent", "Tier 1 Credit", "Primary Residence", "HELOC Refi", "High Value $100k+"],
    "loInfo": { "name": "Eddie Barragan", "email": "Eddie@WestCapitalLending.com" }
}
```

## localStorage Persistence

### Keys Used

| Key | Content | Tab |
|-----|---------|-----|
| `helocRates` | Rate configuration (3 tiers) | Rates |
| `helocIntegrations` | GHL + AI + Email settings | Integrations |
| `helocLastQuote` | Last entered client data | Auto-save |

### Save/Load Pattern
```javascript
function saveIntegrations() {
    const data = {
        ghl: { apiKey, locationId, fromName, fromEmail, pipelineId, stageId, followupDays, calendarLink, webhookUrl },
        ai: { provider, key, model, maxTokens, systemPrompt },
        email: { subject, template }
    };
    localStorage.setItem('helocIntegrations', JSON.stringify(data));
}

function loadIntegrations() {
    const saved = localStorage.getItem('helocIntegrations');
    if (saved) {
        const data = JSON.parse(saved);
        // Populate all form fields from saved data
    }
}
// Called on DOMContentLoaded
```
