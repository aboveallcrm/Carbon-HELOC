import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";

// TODO: Confirm the production project env contains the provider keys used by the cascade:
// OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, GROQ_API_KEY, KIMI_API_KEY, PERPLEXITY_API_KEY, and GROK_API_KEY.
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
}

const AI_FETCH_TIMEOUT_MS = 25_000;
const AI_RATE_LIMIT_WINDOW_MS = Number(Deno.env.get("AI_PROXY_RATE_LIMIT_WINDOW_MS") || 60_000);
const AI_RATE_LIMIT_MAX_REQUESTS = Number(Deno.env.get("AI_PROXY_RATE_LIMIT_MAX_REQUESTS") || 20);

// Cost per 1M tokens (USD) for estimation
const COST_PER_1M: Record<string, { input: number; output: number }> = {
  gemini:    { input: 0.075, output: 0.30 },
  groq:      { input: 0.59,  output: 0.79 },
  openai:    { input: 2.50,  output: 10.00 },
  deepseek:  { input: 0.27,  output: 1.10 },
  grok:      { input: 5.00,  output: 15.00 },
  anthropic: { input: 3.00,  output: 15.00 },
  perplexity:{ input: 1.00,  output: 1.00 },
  kimi:      { input: 0.30,  output: 1.20 },
};

function estimateCost(provider: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_PER_1M[provider] || COST_PER_1M["openai"];
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

function extractUsage(provider: string, aiData: any): { inputTokens: number; outputTokens: number; totalTokens: number } {
  let inputTokens = 0, outputTokens = 0;
  if (provider === "gemini") {
    inputTokens = aiData.usageMetadata?.promptTokenCount || 0;
    outputTokens = aiData.usageMetadata?.candidatesTokenCount || 0;
  } else if (provider === "anthropic") {
    inputTokens = aiData.usage?.input_tokens || 0;
    outputTokens = aiData.usage?.output_tokens || 0;
  } else {
    // OpenAI-compatible: openai, groq, deepseek, grok, kimi, perplexity
    inputTokens = aiData.usage?.prompt_tokens || 0;
    outputTokens = aiData.usage?.completion_tokens || 0;
  }
  return { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
}

function extractResponseText(provider: string, aiData: any): string {
  if (provider === "gemini") {
    return aiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else if (provider === "anthropic") {
    return aiData.content?.[0]?.text || "";
  } else {
    return aiData.choices?.[0]?.message?.content || "";
  }
}

// Provider key lookup from env
const ENV_KEY_MAP: Record<string, string> = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  groq: "GROQ_API_KEY",
  grok: "GROK_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  kimi: "KIMI_API_KEY",
};

const DEFAULT_MODELS: Record<string, string> = {
  openai: "gpt-4o",
  gemini: "gemini-2.0-flash",
  anthropic: "claude-sonnet-4-5-20250929",
  deepseek: "deepseek-chat",
  groq: "llama-3.3-70b-versatile",
  grok: "grok-2-latest",
  kimi: "moonshot-v1-8k",
};

const DEFAULT_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  grok: "https://api.x.ai/v1/chat/completions",
  kimi: "https://api.moonshot.cn/v1/chat/completions",
  perplexity: "https://api.perplexity.ai/chat/completions",
};

// Get a single key (first available) for a provider
function getProviderKey(provider: string, userKey?: string): string {
  const all = getAllProviderKeys(provider, userKey);
  return all[0] || "";
}

// Get ALL available keys for a provider (user key + env key + numbered variants)
// This allows the cascade to exhaust every cheap key before moving to expensive providers
function getAllProviderKeys(provider: string, userKey?: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();

  const addKey = (k: string) => {
    if (k && !seen.has(k)) { seen.add(k); keys.push(k); }
  };

  // Per-user key first
  if (userKey) addKey(userKey);

  const envName = ENV_KEY_MAP[provider];
  if (!envName) return keys;

  // Primary env key
  addKey(Deno.env.get(envName) || "");

  // Numbered variants: GEMINI_API_KEY_1 through _10
  for (let i = 1; i <= 10; i++) {
    addKey(Deno.env.get(envName.replace("_KEY", `_KEY_${i}`)) || "");
  }

  return keys;
}

interface CallResult {
  ok: boolean;
  text: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  provider: string;
  model: string;
  aiData?: any;
  status?: number;
}

async function callProvider(
  provider: string,
  aiModel: string,
  aiKey: string,
  aiMaxTokens: number,
  systemPrompt: string,
  userMessage: string,
  endpointUrl: string,
  imageBase64?: string,
  imageMimeType?: string,
): Promise<CallResult> {
  let requestBody: string;
  let aiHeaders: Record<string, string>;
  let actualUrl: string;

  const isVision = !!imageBase64;
  const model = aiModel || DEFAULT_MODELS[provider] || "gpt-4o";

  if (provider === "gemini") {
    actualUrl = (endpointUrl || "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent")
      .replace("{model}", model) + "?key=" + aiKey;
    aiHeaders = { "Content-Type": "application/json" };

    const parts: any[] = [];
    if (systemPrompt) parts.push({ text: systemPrompt + "\n\n" });
    if (isVision) {
      parts.push({ inline_data: { mime_type: imageMimeType, data: imageBase64 } });
    }
    parts.push({ text: userMessage });

    requestBody = JSON.stringify({
      contents: [{ parts }],
      generationConfig: { maxOutputTokens: aiMaxTokens },
    });

  } else if (provider === "anthropic") {
    actualUrl = endpointUrl || "https://api.anthropic.com/v1/messages";
    aiHeaders = {
      "Content-Type": "application/json",
      "x-api-key": aiKey,
      "anthropic-version": "2023-06-01",
    };

    const content: any[] = [];
    if (isVision) {
      content.push({ type: "image", source: { type: "base64", media_type: imageMimeType, data: imageBase64 } });
    }
    content.push({ type: "text", text: userMessage });

    requestBody = JSON.stringify({
      model,
      max_tokens: aiMaxTokens,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages: [{ role: "user", content }],
    });

  } else {
    // OpenAI-compatible: openai, groq, deepseek, grok, kimi, perplexity
    actualUrl = endpointUrl || DEFAULT_URLS[provider] || "https://api.openai.com/v1/chat/completions";
    aiHeaders = {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + aiKey,
    };

    const messages: any[] = [];
    if (systemPrompt) messages.push({ role: "system", content: systemPrompt });

    if (isVision) {
      messages.push({
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } },
          { type: "text", text: userMessage },
        ],
      });
    } else {
      messages.push({ role: "user", content: userMessage });
    }

    requestBody = JSON.stringify({ model, max_tokens: aiMaxTokens, messages });
  }

  // Fetch with timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(actualUrl, {
      method: "POST",
      headers: aiHeaders,
      body: requestBody,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const aiData = await resp.json();
    const text = extractResponseText(provider, aiData);
    const usage = extractUsage(provider, aiData);
    return { ok: resp.ok && !!text, text, usage, provider, model, aiData, status: resp.status };
  } catch (err) {
    clearTimeout(timeout);
    return { ok: false, text: "", usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, provider, model, status: 0 };
  }
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: any, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    // 1. Authenticate the calling user via their JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return json({ error: "Invalid or expired token" }, 401);

    const userId = user.id;

    // 2. Parse request body
    const body = await req.json();
    const {
      action, provider, model, maxTokens, systemPrompt, userMessage, endpointUrl,
      imageBase64, imageMimeType, intent,
    } = body;

    // 3. Look up the user's AI key from user_integrations
    const { data: integration, error: intError } = await supabaseAdmin
      .from("user_integrations")
      .select("metadata")
      .eq("user_id", userId)
      .eq("provider", "heloc_keys")
      .maybeSingle();

    if (intError) return json({ error: "Failed to look up AI key" }, 500);

    // Per-user key and config overrides
    const userAiKey = integration?.metadata?.ai_api_key || "";
    const aiProvider = integration?.metadata?.ai_provider || provider || "openai";
    const aiModel = integration?.metadata?.ai_model || model || DEFAULT_MODELS[aiProvider] || "gpt-4o";
    const aiMaxTokens = integration?.metadata?.ai_max_tokens || maxTokens || 500;
    const aiEndpointUrl = integration?.metadata?.ai_endpoint_url || "";
    const aiSystemPrompt = integration?.metadata?.ai_system_prompt || systemPrompt || "";

    // Resolve key: per-user first, then platform env
    let aiKey = userAiKey;
    let keySource = "user";
    if (!aiKey) {
      aiKey = getProviderKey(aiProvider, "");
      if (aiKey) keySource = "platform";
    }

    // ── Token budget check (for generate/generate_cascade/analyze_image actions) ──
    // RPC returns: budget_tokens_used, budget_tokens_limit, budget_tier (prefixed to avoid PL/pgSQL ambiguity)
    let tokenBudget: { tokens_used: number; tokens_limit: number; tier: string } | null = null;
    if (action === "generate" || action === "generate_cascade" || action === "analyze_image") {
      const { data: budgetData } = await supabaseAdmin.rpc("get_or_create_token_budget", { p_user_id: userId });
      if (budgetData && budgetData.length > 0) {
        const b = budgetData[0];
        tokenBudget = { tokens_used: b.budget_tokens_used, tokens_limit: b.budget_tokens_limit, tier: b.budget_tier };
        // Check if budget exceeded (skip for unlimited = -1)
        if (tokenBudget.tokens_limit !== -1 && tokenBudget.tokens_used >= tokenBudget.tokens_limit) {
          return json({
            error: "Monthly AI token budget exceeded",
            tokens_used: tokenBudget.tokens_used,
            tokens_limit: tokenBudget.tokens_limit,
            tier: tokenBudget.tier,
            upgrade_hint: "Upgrade your tier for more AI tokens",
          }, 429);
        }
      }
    }

    // ── Obsidian+ custom system prompt injection ──
    let finalSystemPrompt = aiSystemPrompt;
    if (action !== "check_status" && action !== "test") {
      try {
        const { data: settingsRow } = await supabaseAdmin
          .from("user_integrations")
          .select("metadata")
          .eq("user_id", userId)
          .eq("provider", "heloc_settings")
          .maybeSingle();
        const customPrompt = settingsRow?.metadata?.ai?.customSystemPrompt;
        // Look up tier
        const { data: profileRow } = await supabaseAdmin
          .from("profiles").select("tier").eq("id", userId).maybeSingle();
        const userTier = profileRow?.tier || "carbon";
        const tierLevel = { carbon: 0, titanium: 1, platinum: 2, obsidian: 3, diamond: 4 }[userTier] || 0;
        if (customPrompt && tierLevel >= 3) {
          finalSystemPrompt = customPrompt + "\n\n" + finalSystemPrompt;
        }
      } catch (_e) {
        // Non-blocking: if settings lookup fails, proceed with original prompt
      }
    }

    // ── check_status ──
    if (action === "check_status") {
      return json({
        success: true, configured: !!aiKey,
        provider: aiProvider, model: aiModel, keySource,
      });
    }

    if (!aiKey) {
      return json({ error: "No AI key configured for " + aiProvider + ". Contact your Super Admin." }, 403);
    }

    // ── test ──
    if (action === "test") {
      const rateLimit = await checkAiProxyRateLimit(supabaseAdmin, userId);
      if (!rateLimit.allowed) {
        return json({ error: "AI temporarily unavailable — please try again in a moment", retry_after_sec: rateLimit.retryAfterSec }, 429);
      }

      const result = await callProvider(aiProvider, aiModel, aiKey, 50, "", 'Say "Connection successful!"', aiEndpointUrl);
      if (result.ok) {
        // Log test call too
        await logUsage(supabaseAdmin, userId, result.provider, result.model, "test", intent || "test", result.usage);
        await logUsageEvent(supabaseAdmin, userId, "ai_call", {
          provider: result.provider,
          model: result.model,
          action: "test",
          intent: intent || "test",
          total_tokens: result.usage.totalTokens,
        });
        return json({ success: true, text: result.text, provider: result.provider, model: result.model, usage: result.usage });
      }
      return json({ error: "AI provider returned an error", status: result.status, details: JSON.stringify(result.aiData || {}).substring(0, 500) }, 502);
    }

    // ── generate (single provider) ──
    if (action === "generate") {
      if (!userMessage) return json({ error: "Missing userMessage for generate action" }, 400);
      const rateLimit = await checkAiProxyRateLimit(supabaseAdmin, userId);
      if (!rateLimit.allowed) {
        return json({ error: "AI temporarily unavailable — please try again in a moment", retry_after_sec: rateLimit.retryAfterSec }, 429);
      }

      const result = await callProvider(aiProvider, aiModel, aiKey, aiMaxTokens, finalSystemPrompt, userMessage, aiEndpointUrl);
      if (!result.ok) {
        return json({ error: "AI provider returned an error", status: result.status, details: JSON.stringify(result.aiData || {}).substring(0, 500) }, 502);
      }
      await logUsage(supabaseAdmin, userId, result.provider, result.model, "generate", intent || "generate", result.usage);
      await logUsageEvent(supabaseAdmin, userId, "ai_call", {
        provider: result.provider,
        model: result.model,
        action: "generate",
        intent: intent || "generate",
        total_tokens: result.usage.totalTokens,
      });
      // Increment token budget
      const budgetUpdate = await incrementBudget(supabaseAdmin, userId, result.usage.totalTokens);
      return json({ success: true, text: result.text, provider: result.provider, model: result.model, usage: result.usage, ...budgetUpdate });
    }

    // ── generate_cascade (try cheapest providers first, exhaust all keys per provider) ──
    if (action === "generate_cascade") {
      if (!userMessage) return json({ error: "Missing userMessage for generate_cascade action" }, 400);
      const rateLimit = await checkAiProxyRateLimit(supabaseAdmin, userId);
      if (!rateLimit.allowed) {
        return json({ error: "AI temporarily unavailable — please try again in a moment", retry_after_sec: rateLimit.retryAfterSec }, 429);
      }

      // Order: cheapest first — exhaust ALL Gemini keys, then ALL Groq keys, before OpenAI/Anthropic
      const cascadeOrder = ["gemini", "groq", "kimi", "perplexity", "grok", "openai", "anthropic"];
      const attempts: string[] = [];

      for (const prov of cascadeOrder) {
        const keys = getAllProviderKeys(prov, prov === aiProvider ? userAiKey : "");
        if (keys.length === 0) continue;

        const provModel = DEFAULT_MODELS[prov] || "gpt-4o";

        // Try every available key for this provider before moving on
        for (let ki = 0; ki < keys.length; ki++) {
          const keyLabel = keys.length > 1 ? `${prov}[${ki + 1}/${keys.length}]` : prov;
          attempts.push(keyLabel);

          const result = await callProvider(prov, provModel, keys[ki], aiMaxTokens, finalSystemPrompt, userMessage, "");
          if (result.ok) {
            await logUsage(supabaseAdmin, userId, prov, provModel, "generate_cascade", intent || "generate", result.usage, { cascade_attempts: attempts, key_index: ki });
            await logUsageEvent(supabaseAdmin, userId, "ai_call", {
              provider: prov,
              model: provModel,
              action: "generate_cascade",
              intent: intent || "generate",
              total_tokens: result.usage.totalTokens,
              cascade_attempts: attempts,
            });
            const budgetUpdate = await incrementBudget(supabaseAdmin, userId, result.usage.totalTokens);
            return json({ success: true, text: result.text, provider: prov, model: provModel, usage: result.usage, cascadeAttempts: attempts, ...budgetUpdate });
          }
          // Key failed (rate limit, quota, error) — try next key for same provider
        }
        // All keys for this provider exhausted — move to next provider
      }
      return json({ error: "AI temporarily unavailable — please try again in a moment", code: "all_providers_failed", cascadeAttempts: attempts }, 502);
    }

    // ── analyze_image (vision — skip Groq, no vision support) ──
    if (action === "analyze_image") {
      if (!imageBase64 || !imageMimeType) return json({ error: "Missing imageBase64 or imageMimeType" }, 400);
      const message = userMessage || "Analyze this image and describe what you see in detail.";
      const rateLimit = await checkAiProxyRateLimit(supabaseAdmin, userId);
      if (!rateLimit.allowed) {
        return json({ error: "AI temporarily unavailable — please try again in a moment", retry_after_sec: rateLimit.retryAfterSec }, 429);
      }

      // Vision cascade: Gemini → Grok → OpenAI → Anthropic (Groq/Kimi/Perplexity have no vision)
      // Exhaust all keys per provider before moving to the next
      const visionCascade = ["gemini", "grok", "openai", "anthropic"];
      const attempts: string[] = [];

      for (const prov of visionCascade) {
        const keys = getAllProviderKeys(prov, prov === aiProvider ? userAiKey : "");
        if (keys.length === 0) continue;

        const provModel = DEFAULT_MODELS[prov] || "gpt-4o";

        for (let ki = 0; ki < keys.length; ki++) {
          const keyLabel = keys.length > 1 ? `${prov}[${ki + 1}/${keys.length}]` : prov;
          attempts.push(keyLabel);

          const result = await callProvider(prov, provModel, keys[ki], aiMaxTokens, finalSystemPrompt, message, "", imageBase64, imageMimeType);
          if (result.ok) {
            await logUsage(supabaseAdmin, userId, prov, provModel, "analyze_image", intent || "document_analysis", result.usage, { cascade_attempts: attempts, key_index: ki });
            await logUsageEvent(supabaseAdmin, userId, "ai_call", {
              provider: prov,
              model: provModel,
              action: "analyze_image",
              intent: intent || "document_analysis",
              total_tokens: result.usage.totalTokens,
              cascade_attempts: attempts,
            });
            const budgetUpdate = await incrementBudget(supabaseAdmin, userId, result.usage.totalTokens);
            return json({ success: true, text: result.text, provider: prov, model: provModel, usage: result.usage, cascadeAttempts: attempts, ...budgetUpdate });
          }
        }
      }
      return json({ error: "AI temporarily unavailable — please try again in a moment", code: "all_vision_providers_failed", cascadeAttempts: attempts }, 502);
    }

    return json({ error: "Unknown action: " + action }, 400);

  } catch (err) {
    console.error("ai-proxy error:", err);
    return json({ error: (err as Error)?.message || "Internal error" }, 500);
  }
});

// Increment token budget after a successful AI call (returns updated budget for client display)
async function incrementBudget(
  supabase: any, userId: string, totalTokens: number,
): Promise<{ tokens_used?: number; tokens_limit?: number; tier?: string }> {
  try {
    // RPC returns budget_tokens_used, budget_tokens_limit, budget_tier (prefixed columns)
    const { data } = await supabase.rpc("increment_token_usage", { p_user_id: userId, p_tokens: totalTokens });
    if (data && data.length > 0) {
      return { tokens_used: data[0].budget_tokens_used, tokens_limit: data[0].budget_tokens_limit, tier: data[0].budget_tier };
    }
  } catch (e) {
    console.error("Failed to increment token budget:", e);
  }
  return {};
}

// Log AI usage to ai_usage_log table (fire-and-forget, don't block response)
async function logUsage(
  supabase: any, userId: string, provider: string, model: string,
  action: string, intent: string,
  usage: { inputTokens: number; outputTokens: number; totalTokens: number },
  metadata?: Record<string, any>,
) {
  try {
    const cost = estimateCost(provider, usage.inputTokens, usage.outputTokens);
    await supabase.from("ai_usage_log").insert({
      user_id: userId,
      provider,
      model,
      action,
      intent,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      estimated_cost_usd: cost,
      metadata: metadata || {},
    });
  } catch (e) {
    console.error("Failed to log AI usage:", e);
  }
}

async function logUsageEvent(
  supabase: any,
  userId: string,
  eventType: string,
  metadata: Record<string, any>,
) {
  try {
    await supabase.from("usage_events").insert({
      user_id: userId,
      event_type: eventType,
      metadata: metadata || {},
    });
  } catch (e) {
    console.error("Failed to log usage event:", e);
  }
}

async function checkAiProxyRateLimit(
  supabase: any,
  userId: string,
): Promise<{ allowed: boolean; retryAfterSec?: number }> {
  const now = new Date();
  const nowIso = now.toISOString();

  try {
    const { data: row, error } = await supabase
      .from("ai_proxy_rate_limits")
      .select("user_id, window_start, request_count")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("Failed to read ai_proxy_rate_limits:", error);
      return { allowed: true };
    }

    if (!row) {
      await supabase.from("ai_proxy_rate_limits").upsert({
        user_id: userId,
        window_start: nowIso,
        request_count: 1,
        updated_at: nowIso,
      });
      return { allowed: true };
    }

    const windowStart = new Date(row.window_start);
    const windowExpiresAt = windowStart.getTime() + AI_RATE_LIMIT_WINDOW_MS;
    if (now.getTime() >= windowExpiresAt) {
      await supabase.from("ai_proxy_rate_limits").upsert({
        user_id: userId,
        window_start: nowIso,
        request_count: 1,
        updated_at: nowIso,
      });
      return { allowed: true };
    }

    const currentCount = Number(row.request_count || 0);
    if (currentCount >= AI_RATE_LIMIT_MAX_REQUESTS) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((windowExpiresAt - now.getTime()) / 1000)),
      };
    }

    await supabase.from("ai_proxy_rate_limits").upsert({
      user_id: userId,
      window_start: row.window_start,
      request_count: currentCount + 1,
      updated_at: nowIso,
    });
    return { allowed: true };
  } catch (e) {
    console.error("Failed to enforce ai-proxy rate limit:", e);
    return { allowed: true };
  }
}
