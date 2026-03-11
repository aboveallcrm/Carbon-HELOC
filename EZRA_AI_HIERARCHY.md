# Ezra AI Provider Hierarchy - Cost-First Implementation

## Overview
Ezra uses a cost-first fallback chain to minimize API costs while maintaining response quality. The system exhausts all free options before spending a penny.

## Execution Order

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT-SIDE (FREE)                                         │
│  └── KB templates → Cached responses → Learned objections   │
└─────────────────────────────────────────────────────────────┘
                              ↓ (if no KB match)
┌─────────────────────────────────────────────────────────────┐
│  SERVER-SIDE: FREE TIER                                     │
│  1. Gemini (flash/pro)     - $0 (Google free tier)          │
│  2. OpenRouter (free)      - $0 (Llama, etc.)               │
└─────────────────────────────────────────────────────────────┘
                              ↓ (if no API key / fails)
┌─────────────────────────────────────────────────────────────┐
│  SERVER-SIDE: LOW COST ($0.10-0.50/M)                       │
│  3. Kimi 8k                - $0.50/M                        │
│  4. Groq                   - $0.10/M (FASTEST + CHEAPEST)   │
│  5. DeepSeek               - $0.50/M                        │
└─────────────────────────────────────────────────────────────┘
                              ↓ (if all above fail)
┌─────────────────────────────────────────────────────────────┐
│  SERVER-SIDE: MEDIUM ($0.60/M)                              │
│  6. OpenAI GPT-4o-mini     - $0.60/M                        │
└─────────────────────────────────────────────────────────────┘
                              ↓ (last resort)
┌─────────────────────────────────────────────────────────────┐
│  SERVER-SIDE: EXPENSIVE ($$$)                               │
│  7. Grok (xAI)             - $$$                            │
│  8. Anthropic (Claude)     - $$$                            │
└─────────────────────────────────────────────────────────────┘
```

## Cost Summary

| Tier | Providers | Cost | When Used | Expected % |
|------|-----------|------|-----------|------------|
| **KB** | Templates, cache | **FREE** | Always first | ~30% |
| **Free** | Gemini, OpenRouter | **$0** | 90%+ of API calls | ~60% |
| **Low** | Kimi 8k, Groq, DeepSeek | **$0.10-0.50/M** | If free fails | ~9% |
| **Medium** | OpenAI | **$0.60/M** | Rare | ~1% |
| **Expensive** | Grok, Anthropic | **$$$** | Emergency only | <1% |

## Environment Variables Required

```bash
# Free Tier (Primary)
GEMINI_API_KEY=your_gemini_key

# Low Cost Tier (Fallbacks)
GROQ_API_KEY=your_groq_key
KIMI_API_KEY=your_kimi_key
DEEPSEEK_API_KEY=your_deepseek_key

# Medium Cost (Last resort before expensive)
OPENAI_API_KEY=your_openai_key

# Expensive (Emergency only - not implemented yet)
# GROK_API_KEY=your_grok_key
# ANTHROPIC_API_KEY=your_anthropic_key
```

## Key Optimizations

1. **KB First** - Client-side templates handle common objections/follow-ups (zero API cost)
2. **Gemini Flash** - Default for most tasks (free tier)
3. **Kimi 8k** - Cheapest model only, no 32k/128k unless explicitly requested
4. **Groq** - Cheapest paid option at $0.10/M tokens (fastest)
5. **Expensive providers last** - Grok and Anthropic only if everything else fails

## Implementation Details

### File: `supabase/functions/quote-chat/index.ts`

The fallback chain is implemented as sequential try/catch blocks:

1. Each provider is tried in order
2. If a provider succeeds, `responseText` is set and subsequent providers are skipped
3. If a provider fails, the error is logged and the next provider is tried
4. If all providers fail, a 503 error is returned

### Response Extraction

Different providers return responses in different formats:

```typescript
const extractText = (provider: string, data: any): string => {
  switch (provider) {
    case "gemini":
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    case "openai":
    case "groq":
    case "deepseek":
    case "kimi":
    default:
      return data.choices?.[0]?.message?.content || "";
  }
};
```

## Console Logging

Each successful provider logs to the console:
```
✅ Gemini (free tier) succeeded
✅ Kimi 8k ($0.50/M) succeeded
✅ Groq ($0.10/M) succeeded
✅ DeepSeek ($0.50/M) succeeded
✅ OpenAI GPT-4o-mini ($0.60/M) succeeded
```

This helps monitor which providers are being used and their costs.

## Future Enhancements

1. **OpenRouter Integration** - Add OpenRouter free tier as Tier 1.5
2. **Per-Feature Routing**:
   - Note Taker → Max Gemini (simple summarization)
   - Deal Analysis → Can use Kimi/DeepSeek for complex reasoning
   - Client Chat → Stays at Gemini level for cost efficiency
   - Strategy Generation → Can use higher-tier models when needed
3. **Usage Tracking** - Track costs per provider in database
4. **Auto-Failover** - Automatically disable failing providers for 5 minutes
5. **Expensive Tier** - Add Grok and Anthropic as true last resort

## Deployment Checklist

- [ ] Set `GEMINI_API_KEY` in Supabase secrets (primary)
- [ ] Set `GROQ_API_KEY` in Supabase secrets (cheapest paid fallback)
- [ ] Set `KIMI_API_KEY` in Supabase secrets (quality fallback)
- [ ] Set `DEEPSEEK_API_KEY` in Supabase secrets (reasoning fallback)
- [ ] Set `OPENAI_API_KEY` in Supabase secrets (reliable fallback)
- [ ] Deploy function: `supabase functions deploy quote-chat`
- [ ] Test with no keys (should return 503)
- [ ] Test with only Gemini (should use Gemini)
- [ ] Test with Gemini failing (should fall through to next available)
