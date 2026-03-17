// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"

serve(async (req: Request) => {
  // get-prompt is public-facing (called by n8n bots, external integrations).
  // Use shared CORS which covers known app origins; external callers don't send Origin headers.
  const corsHeaders = getCorsHeaders(req)

  function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== "GET") {
    return json({ error: "Method not allowed" }, 405)
  }

  try {
    const SB_URL = Deno.env.get("SUPABASE_URL")
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!SB_URL || !SB_KEY) {
      return json({ error: "Missing env vars" }, 500)
    }

    const url = new URL(req.url)
    const bot = url.searchParams.get("bot")
    const category = url.searchParams.get("category")
    const lead_id = url.searchParams.get("lead_id") || null

    if (!bot || !category) {
      return json({ error: "Missing required params: bot, category" }, 400)
    }

    const sb = createClient(SB_URL, SB_KEY)

    // Call existing RPC for A/B-tested prompt
    const { data, error: rpcErr } = await sb.rpc("get_ab_tested_prompt", {
      p_bot: bot,
      p_cat: category,
      p_lead_id: lead_id,
    })

    if (rpcErr) {
      console.error("get_ab_tested_prompt RPC error:", rpcErr)
      return json({ error: "Failed to fetch prompt" }, 500)
    }

    if (!data || data.length === 0) {
      return json({ error: "No active prompt found for this bot/category" }, 404)
    }

    const result = data[0]

    // Fire-and-forget: log prompt usage directly into lead_analytics
    // (Can't use log_prompt_usage RPC because auth.uid() is null for public calls)
    sb.from("lead_analytics")
      .insert({
        user_id: null,
        event_type: "prompt_usage",
        event_data: {
          prompt_id: result.test_id,
          bot,
          category,
          variant: result.variant,
          outcome: "fetched",
          ts: new Date().toISOString(),
        },
      })
      .then(() => {})
      .catch((err: unknown) => console.error("Failed to log prompt usage:", err))

    return json({
      success: true,
      prompt: result.prompt_text,
      variant: result.variant,
      test_id: result.test_id,
      bot,
      category,
    })
  } catch (err) {
    console.error("get-prompt error:", err.message || err)
    return json({ error: "Internal server error" }, 500)
  }
})
