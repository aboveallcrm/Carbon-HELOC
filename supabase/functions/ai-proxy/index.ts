import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Authenticate the calling user via their JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Decode the JWT to get the user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = user.id;

    // 2. Parse request body
    const { action, provider, model, maxTokens, systemPrompt, userMessage, endpointUrl } = await req.json();

    // 3. Look up the user's AI key from user_integrations (provider='heloc_keys')
    const { data: integration, error: intError } = await supabaseUser
      .from("user_integrations")
      .select("metadata")
      .eq("user_id", userId)
      .eq("provider", "heloc_keys")
      .maybeSingle();

    if (intError) {
      return new Response(JSON.stringify({ error: "Failed to look up AI key" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try per-user key first, then fall back to Edge Function env secrets
    let aiKey = integration?.metadata?.ai_api_key;
    let keySource = "user";

    // Also check for per-user AI config overrides
    const aiProvider = integration?.metadata?.ai_provider || provider || "openai";

    // If no per-user key, fall back to platform-level env secrets
    if (!aiKey) {
      const envKeyMap: Record<string, string> = {
        gemini: "GEMINI_API_KEY",
        openai: "OPENAI_API_KEY",
        anthropic: "ANTHROPIC_API_KEY",
        deepseek: "DEEPSEEK_API_KEY",
        groq: "GROQ_API_KEY",
        grok: "GROK_API_KEY",
        perplexity: "PERPLEXITY_API_KEY",
      };
      const envName = envKeyMap[aiProvider];
      if (envName) aiKey = Deno.env.get(envName) || "";
      // Also try numbered variants (GEMINI_API_KEY_1, etc.)
      if (!aiKey && envName) {
        for (let i = 1; i <= 5; i++) {
          aiKey = Deno.env.get(envName.replace("_KEY", `_KEY_${i}`)) || "";
          if (aiKey) break;
        }
      }
      if (aiKey) keySource = "platform";
    }

    if (!aiKey) {
      return new Response(JSON.stringify({ error: "No AI key configured for " + aiProvider + ". Contact your Super Admin." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Default model depends on provider
    const defaultModels: Record<string, string> = {
      openai: "gpt-4o",
      gemini: "gemini-2.0-flash",
      anthropic: "claude-sonnet-4-5-20250929",
      deepseek: "deepseek-chat",
      groq: "llama-3.3-70b-versatile",
      grok: "grok-2-latest",
    };
    const aiModel = integration?.metadata?.ai_model || model || defaultModels[aiProvider] || "gpt-4o";
    const aiMaxTokens = integration?.metadata?.ai_max_tokens || maxTokens || 500;
    // Only trust endpoint URL from DB (admin-configured), never from client request
    const aiEndpointUrl = integration?.metadata?.ai_endpoint_url || "";
    const aiSystemPrompt = integration?.metadata?.ai_system_prompt || systemPrompt || "";

    // Status check — just verify key exists without calling AI provider
    if (action === "check_status") {
      return new Response(JSON.stringify({
        success: true,
        configured: true,
        provider: aiProvider,
        model: aiModel,
        keySource,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Validate action
    if (action === "generate" && !userMessage) {
      return new Response(JSON.stringify({ error: "Missing userMessage for generate action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Build the AI request based on provider
    let requestBody: string;
    let aiHeaders: Record<string, string>;
    let actualUrl: string;
    let responseText = "";

    if (aiProvider === "gemini") {
      actualUrl = (aiEndpointUrl || "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent")
        .replace("{model}", aiModel) + "?key=" + aiKey;
      aiHeaders = { "Content-Type": "application/json" };

      if (action === "test") {
        requestBody = JSON.stringify({
          contents: [{ parts: [{ text: 'Say "Connection successful!"' }] }],
          generationConfig: { maxOutputTokens: 50 },
        });
      } else {
        requestBody = JSON.stringify({
          contents: [{ parts: [{ text: (aiSystemPrompt ? aiSystemPrompt + "\n\n" : "") + userMessage }] }],
          generationConfig: { maxOutputTokens: aiMaxTokens },
        });
      }
    } else if (aiProvider === "anthropic") {
      actualUrl = aiEndpointUrl || "https://api.anthropic.com/v1/messages";
      aiHeaders = {
        "Content-Type": "application/json",
        "x-api-key": aiKey,
        "anthropic-version": "2023-06-01",
      };

      if (action === "test") {
        requestBody = JSON.stringify({
          model: aiModel,
          max_tokens: 50,
          messages: [{ role: "user", content: 'Say "Connection successful!"' }],
        });
      } else {
        requestBody = JSON.stringify({
          model: aiModel,
          max_tokens: aiMaxTokens,
          ...(aiSystemPrompt ? { system: aiSystemPrompt } : {}),
          messages: [{ role: "user", content: userMessage }],
        });
      }
    } else {
      // OpenAI-compatible: openai, groq, deepseek, grok, custom
      const defaultUrls: Record<string, string> = {
        openai: "https://api.openai.com/v1/chat/completions",
        deepseek: "https://api.deepseek.com/v1/chat/completions",
        groq: "https://api.groq.com/openai/v1/chat/completions",
        grok: "https://api.x.ai/v1/chat/completions",
      };
      actualUrl = aiEndpointUrl || defaultUrls[aiProvider] || "https://api.openai.com/v1/chat/completions";
      aiHeaders = {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + aiKey,
      };

      if (action === "test") {
        requestBody = JSON.stringify({
          model: aiModel,
          max_tokens: 50,
          messages: [{ role: "user", content: 'Say "Connection successful!"' }],
        });
      } else {
        const messages: Array<{ role: string; content: string }> = [];
        if (aiSystemPrompt) messages.push({ role: "system", content: aiSystemPrompt });
        messages.push({ role: "user", content: userMessage });
        requestBody = JSON.stringify({
          model: aiModel,
          max_tokens: aiMaxTokens,
          messages,
        });
      }
    }

    // 6. Call the AI provider
    const aiResponse = await fetch(actualUrl, {
      method: "POST",
      headers: aiHeaders,
      body: requestBody,
    });

    const aiData = await aiResponse.json();

    // 7. Extract response text based on provider
    if (aiProvider === "gemini") {
      responseText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else if (aiProvider === "anthropic") {
      responseText = aiData.content?.[0]?.text || "";
    } else {
      responseText = aiData.choices?.[0]?.message?.content || "";
    }

    if (!responseText && !aiResponse.ok) {
      return new Response(JSON.stringify({
        error: "AI provider returned an error",
        status: aiResponse.status,
        details: JSON.stringify(aiData).substring(0, 500),
      }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      text: responseText,
      provider: aiProvider,
      model: aiModel,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("ai-proxy error:", err);
    return new Response(JSON.stringify({ error: (err as Error)?.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
