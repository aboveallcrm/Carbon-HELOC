/**
 * Ezra AI Chat - Edge Function
 * Handles AI model routing and responses
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { message, model, intent, conversationId, userId } = await req.json();

    if (!message || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Get conversation history
    const { data: history } = await supabaseClient
      .from('ezra_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20);

    // Search knowledge base
    const { data: knowledge } = await supabaseClient
      .rpc('search_ezra_knowledge', {
        query_embedding: Array(1536).fill(0), // Would be actual embedding
        match_threshold: 0.7,
        match_count: 5
      });

    // Build response (simplified - would call actual AI)
    const response = {
      content: generateResponse(message, intent, knowledge),
      model: model || 'claude',
      intent: intent || 'general',
      autoFillFields: extractAutoFillFields(message)
    };

    // Save message
    await supabaseClient.from('ezra_messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: response.content,
      model_used: model
    });

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generateResponse(message: string, intent: string, knowledge: any[]) {
  // Simplified response generation
  const responses: Record<string, string> = {
    quote_creation: `I'll help you create a HELOC quote. Based on the information provided, here's what I recommend:\n\n**Quote Summary**\n• Analyze the borrower's profile\n• Calculate optimal loan structure\n• Provide competitive rate options`,
    
    objection_handling: `Here's how to handle that objection:\n\n**Explanation**\nAddress the concern directly with facts\n\n**Analogy**\nUse a relatable comparison\n\n**Script**\n"I understand your concern. Let me show you why this works in your favor..."`,
    
    sales_coach: `**Quote Summary**\nPresent the key benefits clearly\n\n**Strategy**\nFocus on value, not just rate\n\n**What To Say**\n"This HELOC gives you flexibility. You only pay interest on what you use..."`
  };

  return responses[intent] || `I'm here to help! I can assist you with:\n\n• Building HELOC quotes\n• Structuring loan scenarios\n• Handling objections\n• Calculating payments\n• Generating client scripts\n\nWhat would you like to work on?`;
}

function extractAutoFillFields(message: string) {
  // Extract structured data from message
  const fields: Record<string, any> = {};
  
  const nameMatch = message.match(/(?:for|name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if (nameMatch) fields.borrower_name = nameMatch[1];
  
  const amounts = message.match(/\$?(\d+(?:,\d{3})*)/g);
  if (amounts) {
    fields.property_value = parseInt(amounts[0].replace(/,/g, ''));
    if (amounts[1]) fields.mortgage_balance = parseInt(amounts[1].replace(/,/g, ''));
    if (amounts[2]) fields.heloc_amount = parseInt(amounts[2].replace(/,/g, ''));
  }
  
  const creditMatch = message.match(/(\d{3})/);
  if (creditMatch) fields.credit_score = parseInt(creditMatch[1]);
  
  return Object.keys(fields).length > 0 ? fields : null;
}
