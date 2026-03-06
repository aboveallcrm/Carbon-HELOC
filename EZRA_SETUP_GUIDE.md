# Ezra AI Loan Structuring Assistant - Setup Guide

## Overview

Ezra is an advanced AI assistant embedded in the Above All CRM HELOC platform that helps loan officers:
- Build HELOC quotes automatically
- Structure optimal loan scenarios
- Handle borrower objections
- Generate client scripts
- Calculate CLTV and payments

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ABOVE ALL CRM PLATFORM                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │   Chat UI    │◄──►│  Ezra State  │◄──►│  Auto-Fill   │       │
│  │   (Widget)   │    │  Management  │    │   Engine     │       │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘       │
│         │                   │                   │                │
│         └───────────────────┼───────────────────┘                │
│                             │                                    │
│                             ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Supabase Edge Function                      │    │
│  │         (AI Routing + Vector Search)                     │    │
│  └──────┬─────────────────────────────┬────────────────────┘    │
│         │                             │                          │
│         ▼                             ▼                          │
│  ┌─────────────┐              ┌─────────────┐                   │
│  │  AI Models  │              │  pgvector   │                   │
│  │ • Gemini    │              │  Knowledge  │                   │
│  │ • Claude    │              │    Base     │                   │
│  │ • GPT       │              │             │                   │
│  └─────────────┘              └─────────────┘                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Database Schema

**File:** `supabase/migrations/20260305000000_ezra_ai_assistant.sql`

Tables created:
- `ezra_conversations` - Conversation sessions
- `ezra_messages` - Individual messages
- `ezra_knowledge_base` - Vector-enabled knowledge base
- `ezra_loan_scenarios` - Saved loan structures
- `ezra_user_preferences` - User settings

**Key Features:**
- pgvector extension for semantic search
- Row Level Security (RLS) policies
- Automatic updated_at triggers
- Vector similarity search function

### 2. Chat Widget

**File:** `js/ezra-chat.js`

Features:
- Floating chat widget with toggle button
- Quick command buttons (Create Quote, Structure Deal, etc.)
- AI model selector (Gemini, Claude, GPT)
- Auto-fill block for quote fields
- Message history with timestamps
- Responsive design

### 3. Edge Function

**File:** `supabase/functions/ezra-chat/index.ts`

Handles:
- AI model routing based on intent
- Vector search for knowledge base
- Conversation history management
- Auto-fill field extraction

## Setup Instructions

### Step 1: Run Database Migration

```bash
# Using Supabase CLI
supabase migration up

# Or run the SQL file directly in Supabase SQL Editor
```

### Step 2: Deploy Edge Function

```bash
# Set environment variables
supabase secrets set GEMINI_API_KEY=your_key
supabase secrets set ANTHROPIC_API_KEY=your_key
supabase secrets set OPENAI_API_KEY=your_key

# Deploy the function
supabase functions deploy ezra-chat
```

### Step 3: Configure Environment Variables

Add to your `.env` or environment:

```env
# Supabase (already configured)
SUPABASE_URL=your_url
SUPABASE_ANON_KEY=your_key

# AI Provider API Keys (for Edge Function)
GEMINI_API_KEY=your_gemini_key
ANTHROPIC_API_KEY=your_claude_key
OPENAI_API_KEY=your_openai_key
```

### Step 4: Seed Knowledge Base

The migration includes sample knowledge base entries. To add more:

```sql
INSERT INTO ezra_knowledge_base (category, title, content, metadata)
VALUES (
    'sales_scripts',
    'Your Title',
    'Your content here...',
    '{"tags": ["tag1", "tag2"], "source": "your_source"}'
);
```

To generate embeddings for new entries:

```typescript
// Call OpenAI embedding API
const embedding = await generateEmbedding(content);

// Update the record
UPDATE ezra_knowledge_base 
SET content_vector = embedding
WHERE id = 'your_id';
```

## Usage

### For Loan Officers

1. **Open Ezra:** Click the "Ezra" button in the bottom-right corner
2. **Quick Commands:** Use buttons for common tasks:
   - 💰 Create Quote
   - 🏗️ Structure Deal
   - 🛡️ Handle Objection
   - 📋 Explain Strategy
   - 📝 Client Script

3. **AI Model Selection:** Click the brain icon to switch between:
   - **Gemini** - Fast responses for simple questions
   - **Claude** - Best for calculations and quotes
   - **GPT** - Complex strategy and analysis

4. **Auto-Fill:** When Ezra generates a quote, click "Apply to Quote Tool" to auto-populate fields

### Examples

**Creating a Quote:**
```
"Create a HELOC quote for Maria Lopez with $850K property value, 
$420K existing mortgage, looking for $150K HELOC"
```

**Structuring a Deal:**
```
"How should I structure this deal? 720 credit score, $1.2M property, 
$600K balance, wants $300K for debt consolidation"
```

**Handling Objections:**
```
"Help me respond to a borrower concerned about variable rates"
```

## AI Routing Logic

Ezra automatically routes to the best AI model based on intent:

| Intent | Model | Reason |
|--------|-------|--------|
| quote_calculation | Claude | Best at math and calculations |
| quote_creation | Claude | Structured output with auto-fill |
| complex_strategy | GPT | Deep reasoning and analysis |
| objection_handling | Claude | Natural conversation flow |
| sales_coach | GPT | Comprehensive script generation |
| simple_chat | Gemini | Fast, cost-effective responses |

## API Reference

### JavaScript API

```javascript
// Open Ezra
Ezra.open();

// Send a message programmatically
Ezra.sendMessage("Create a quote for John Doe");

// Apply auto-fill fields
Ezra.applyAutoFill({
    borrower_name: "John Doe",
    property_value: 500000,
    // ... other fields
});

// Switch AI model
Ezra.setModel('claude'); // 'gemini', 'claude', or 'gpt'

// Get current state
const state = Ezra.getState();
```

### Edge Function API

```bash
POST /functions/v1/ezra-chat

{
  "message": "Create a quote for Maria Lopez",
  "model": "claude",
  "intent": "quote_creation",
  "conversationId": "uuid",
  "userId": "uuid",
  "borrowerName": "Maria Lopez",
  "quoteContext": {
    "propertyValue": 850000,
    "existingMortgage": 420000
  }
}
```

Response:
```json
{
  "content": "I'll help you create a HELOC quote...",
  "model": "claude",
  "intent": "quote_creation",
  "autoFillFields": {
    "borrower_name": "Maria Lopez",
    "property_value": 850000,
    "heloc_amount": 150000,
    "combined_ltv": 67,
    "interest_rate": 8.25
  },
  "metadata": {
    "tokensUsed": 1250,
    "latency": 1500
  }
}
```

## Customization

### Adding Quick Commands

Edit `js/ezra-chat.js`:

```javascript
const EZRA_CONFIG = {
    quickCommands: [
        { label: 'Your Command', icon: '🔥', action: 'your_action' },
        // ... existing commands
    ]
};
```

### Customizing Styles

CSS variables in `ezra-chat.js`:

```css
:root {
    --ezra-primary: #1e3a5f;
    --ezra-accent: #d4af37;
    --ezra-bg: #ffffff;
    /* ... etc */
}
```

## Troubleshooting

### Widget Not Appearing
- Check browser console for errors
- Verify `ezra-chat.js` is loaded
- Ensure Supabase client is initialized

### AI Responses Not Working
- Check Edge Function logs
- Verify API keys are set correctly
- Check network tab for failed requests

### Auto-Fill Not Working
- Verify field IDs match between Ezra and the form
- Check that `applyAutoFill` is being called
- Look for JavaScript errors in console

### Vector Search Not Returning Results
- Ensure pgvector extension is enabled
- Check that knowledge base entries have embeddings
- Verify the search threshold (default 0.7)

## Security Considerations

1. **API Keys:** Store AI provider keys as Supabase secrets, never in client code
2. **RLS:** All tables have Row Level Security enabled
3. **Rate Limiting:** Consider adding rate limits to the Edge Function
4. **Data Privacy:** Conversations are tied to authenticated users only

## Future Enhancements

- [ ] Real-time collaboration on quotes
- [ ] Voice input for hands-free operation
- [ ] Integration with CRM for borrower lookup
- [ ] Automated follow-up suggestions
- [ ] Deal probability scoring with ML
- [ ] Multi-language support

## Support

For issues or questions:
1. Check the browser console for errors
2. Review Edge Function logs in Supabase
3. Verify database migrations ran successfully
4. Contact: Eddie Barragan - Executive Branch Manager, West Capital Lending
