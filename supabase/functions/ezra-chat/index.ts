/**
 * Ezra AI Loan Structuring Assistant - Edge Function
 * 
 * Handles:
 * - AI model routing (Gemini, Claude, GPT)
 * - Vector search for knowledge base
 * - Conversation history management
 * - Quote calculations and structuring
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// ============================================
// CORS HEADERS
// ============================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// AI PROVIDER CONFIGURATION
// ============================================
const AI_CONFIG = {
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
    apiKey: Deno.env.get('GEMINI_API_KEY'),
    maxTokens: 2048,
    temperature: 0.7,
  },
  claude: {
    endpoint: 'https://api.anthropic.com/v1/messages',
    apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    maxTokens: 4096,
    temperature: 0.7,
    model: 'claude-3-sonnet-20240229',
  },
  gpt: {
    endpoint: 'https://api.openai.com/v1/chat/completions',
    apiKey: Deno.env.get('OPENAI_API_KEY'),
    maxTokens: 4096,
    temperature: 0.7,
    model: 'gpt-4-turbo-preview',
  },
  openaiEmbedding: {
    endpoint: 'https://api.openai.com/v1/embeddings',
    apiKey: Deno.env.get('OPENAI_API_KEY'),
    model: 'text-embedding-3-small',
  },
};

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message, model, intent, conversationId, userId, borrowerName, quoteContext } = await req.json();

    // Validate required fields
    if (!message || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: message, userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Get conversation history
    const history = await getConversationHistory(supabaseClient, conversationId);

    // Search knowledge base for relevant context
    const knowledgeContext = await searchKnowledgeBase(supabaseClient, message);

    // Route to appropriate AI model
    const response = await routeToAIModel(message, model || 'claude', intent, history, knowledgeContext, quoteContext);

    // Parse auto-fill fields if present
    const autoFillFields = extractAutoFillFields(response.content);

    // Save message to database
    await saveMessage(supabaseClient, conversationId, userId, 'assistant', response.content, model, {
      intent,
      tokensUsed: response.tokensUsed,
      latency: response.latency,
    });

    return new Response(
      JSON.stringify({
        content: response.content,
        model: response.model,
        intent: intent || 'general',
        autoFillFields,
        metadata: {
          tokensUsed: response.tokensUsed,
          latency: response.latency,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Ezra Edge Function Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================
// AI MODEL ROUTING
// ============================================
async function routeToAIModel(message: string, model: string, intent: string, history: any[], knowledgeContext: string[], quoteContext?: any) {
  const startTime = Date.now();

  // Build system prompt
  const systemPrompt = buildSystemPrompt(intent, knowledgeContext, quoteContext);

  // Route to specific model
  switch (model) {
    case 'gemini':
      return callGemini(message, systemPrompt, history, startTime);
    case 'gpt':
      return callGPT(message, systemPrompt, history, startTime);
    case 'claude':
    default:
      return callClaude(message, systemPrompt, history, startTime);
  }
}

// ============================================
// GEMINI API CALL
// ============================================
async function callGemini(message: string, systemPrompt: string, history: any[], startTime: number) {
  const contents = [
    { role: 'user', parts: [{ text: systemPrompt }] },
    { role: 'model', parts: [{ text: 'Understood. I will act as Ezra, the AI loan structuring assistant.' }] },
    ...history.map(h => ({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.content }],
    })),
    { role: 'user', parts: [{ text: message }] },
  ];

  const response = await fetch(`${AI_CONFIG.gemini.endpoint}?key=${AI_CONFIG.gemini.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: {
        maxOutputTokens: AI_CONFIG.gemini.maxTokens,
        temperature: AI_CONFIG.gemini.temperature,
      },
    }),
  });

  const data = await response.json();
  
  return {
    content: data.candidates?.[0]?.content?.parts?.[0]?.text || 'I apologize, I could not generate a response.',
    model: 'gemini',
    tokensUsed: data.usageMetadata?.totalTokenCount || 0,
    latency: Date.now() - startTime,
  };
}

// ============================================
// CLAUDE API CALL
// ============================================
async function callClaude(message: string, systemPrompt: string, history: any[], startTime: number) {
  const messages = [
    ...history.map(h => ({
      role: h.role,
      content: h.content,
    })),
    { role: 'user', content: message },
  ];

  const response = await fetch(AI_CONFIG.claude.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': AI_CONFIG.claude.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: AI_CONFIG.claude.model,
      max_tokens: AI_CONFIG.claude.maxTokens,
      temperature: AI_CONFIG.claude.temperature,
      system: systemPrompt,
      messages,
    }),
  });

  const data = await response.json();
  
  return {
    content: data.content?.[0]?.text || 'I apologize, I could not generate a response.',
    model: 'claude',
    tokensUsed: data.usage?.input_tokens + data.usage?.output_tokens || 0,
    latency: Date.now() - startTime,
  };
}

// ============================================
// GPT API CALL
// ============================================
async function callGPT(message: string, systemPrompt: string, history: any[], startTime: number) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map(h => ({
      role: h.role,
      content: h.content,
    })),
    { role: 'user', content: message },
  ];

  const response = await fetch(AI_CONFIG.gpt.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_CONFIG.gpt.apiKey}`,
    },
    body: JSON.stringify({
      model: AI_CONFIG.gpt.model,
      max_tokens: AI_CONFIG.gpt.maxTokens,
      temperature: AI_CONFIG.gpt.temperature,
      messages,
    }),
  });

  const data = await response.json();
  
  return {
    content: data.choices?.[0]?.message?.content || 'I apologize, I could not generate a response.',
    model: 'gpt',
    tokensUsed: data.usage?.total_tokens || 0,
    latency: Date.now() - startTime,
  };
}

// ============================================
// SYSTEM PROMPT BUILDER
// ============================================
function buildSystemPrompt(intent: string, knowledgeContext: string[], quoteContext?: any): string {
  const basePrompt = `You are Ezra, an advanced AI loan structuring assistant for Above All CRM's HELOC Architect platform.

YOUR ROLE:
- Assist loan officers in building HELOC quotes
- Structure optimal loan scenarios
- Analyze borrower situations
- Coach loan officers on what to say to borrowers
- Generate borrower explanations
- Calculate CLTV, payments, and loan sizing

YOU ARE SPEAKING TO LOAN OFFICERS, NOT BORROWERS. Your responses should be professional, concise, and actionable.

${knowledgeContext.length > 0 ? `\nRELEVANT KNOWLEDGE:\n${knowledgeContext.join('\n')}` : ''}

${quoteContext ? `\nCURRENT QUOTE CONTEXT:\n${JSON.stringify(quoteContext, null, 2)}` : ''}

RESPONSE FORMAT:
Use clear sections with headers. Be concise and structured.

When providing quotes, include an AUTO_FILL_FIELDS JSON block at the end:

AUTO_FILL_FIELDS
{
  "borrower_name": "string",
  "property_value": number,
  "existing_mortgage_balance": number,
  "heloc_amount": number,
  "combined_ltv": number,
  "interest_rate": number,
  "origination_fee": number,
  "draw_period_years": number,
  "repayment_term_years": number,
  "interest_only_payment_estimate": number
}`;

  // Add intent-specific instructions
  const intentPrompts: Record<string, string> = {
    quote_calculation: '\n\nFOCUS: Provide accurate calculations for CLTV, payments, and loan sizing. Show your work.',
    quote_creation: '\n\nFOCUS: Build a complete quote structure with all required fields. Include the AUTO_FILL_FIELDS block.',
    complex_strategy: '\n\nFOCUS: Analyze the deal thoroughly. Provide Deal Strategy, Approval Considerations, and Recommended Structure sections.',
    objection_handling: '\n\nFOCUS: Provide Explanation, Analogy, and Suggested Script sections to help the loan officer respond.',
    sales_coach: '\n\nFOCUS: Generate Quote Summary, Loan Strategy, and What To Say To The Client sections.',
  };

  return basePrompt + (intentPrompts[intent] || '');
}

// ============================================
// VECTOR SEARCH
// ============================================
async function searchKnowledgeBase(supabaseClient: any, query: string): Promise<string[]> {
  try {
    // Generate embedding for the query
    const embedding = await generateEmbedding(query);
    
    // Search using the database function
    const { data, error } = await supabaseClient.rpc('search_ezra_knowledge', {
      query_embedding: embedding,
      match_threshold: 0.7,
      match_count: 5,
      filter_category: null,
    });

    if (error) {
      console.error('Vector search error:', error);
      return [];
    }

    return data?.map((item: any) => `${item.category}: ${item.title}\n${item.content}`) || [];
  } catch (error) {
    console.error('Knowledge base search error:', error);
    return [];
  }
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(AI_CONFIG.openaiEmbedding.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${AI_CONFIG.openaiEmbedding.apiKey}`,
    },
    body: JSON.stringify({
      model: AI_CONFIG.openaiEmbedding.model,
      input: text,
    }),
  });

  const data = await response.json();
  return data.data?.[0]?.embedding || [];
}

// ============================================
// DATABASE OPERATIONS
// ============================================
async function getConversationHistory(supabaseClient: any, conversationId: string): Promise<any[]> {
  if (!conversationId) return [];

  const { data, error } = await supabaseClient
    .from('ezra_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(20);

  if (error) {
    console.error('Error loading conversation history:', error);
    return [];
  }

  return data || [];
}

async function saveMessage(
  supabaseClient: any,
  conversationId: string,
  userId: string,
  role: string,
  content: string,
  model?: string,
  metadata?: any
): Promise<void> {
  if (!conversationId) return;

  await supabaseClient.from('ezra_messages').insert({
    conversation_id: conversationId,
    role,
    content,
    model_used: model,
    metadata,
  });

  // Update conversation summary
  await updateConversationSummary(supabaseClient, conversationId, content);
}

async function updateConversationSummary(supabaseClient: any, conversationId: string, latestMessage: string): Promise<void> {
  // Simple summary - in production, you might use AI to generate this
  const summary = latestMessage.substring(0, 200) + (latestMessage.length > 200 ? '...' : '');
  
  await supabaseClient
    .from('ezra_conversations')
    .update({ 
      conversation_summary: summary,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId);
}

// ============================================
// AUTO-FILL EXTRACTION
// ============================================
function extractAutoFillFields(content: string): Record<string, any> | null {
  const match = content.match(/AUTO_FILL_FIELDS\s*\n```json\s*\n([\s\S]*?)\n```|AUTO_FILL_FIELDS\s*\n({[\s\S]*?})/);
  
  if (match) {
    try {
      const jsonStr = match[1] || match[2];
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse AUTO_FILL_FIELDS:', e);
    }
  }
  
  return null;
}
