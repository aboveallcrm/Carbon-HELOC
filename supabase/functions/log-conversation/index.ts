// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"

// STOP keywords for TCPA compliance
// Match: exact match or prefix (e.g. "stop texting me")
// NOT substring (e.g. "don't stop helping me" should NOT trigger)
const STOP_KEYWORDS = [
  "stop",
  "unsubscribe",
  "opt out",
  "opt-out",
  "do not contact",
  "do not call",
  "dnc",
  "remove me",
]

function detectStopKeyword(content: string): string | null {
  const lower = content.toLowerCase().trim()
  for (const kw of STOP_KEYWORDS) {
    // Exact match or prefix match (keyword followed by space/punctuation/end)
    if (lower === kw || lower.startsWith(kw + " ") || lower.startsWith(kw + ".") ||
        lower.startsWith(kw + "!") || lower.startsWith(kw + ",")) {
      return kw
    }
  }
  return null
}

serve(async (req: Request) => {
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

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405)
  }

  try {
    const SB_URL = Deno.env.get("SUPABASE_URL")
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!SB_URL || !SB_KEY) {
      return json({ error: "Missing env vars" }, 500)
    }

    const sb = createClient(SB_URL, SB_KEY)
    const body = await req.json()

    const {
      context,       // 'ezra' or 'quote-chat'
      content,       // message text (required)
      role,          // 'user' or 'assistant'
      // Ezra context fields
      conversation_id,
      model_used,
      metadata,
      // Quote-chat context fields
      quote_code,
      lead_id,
      user_id: body_user_id, // LO who owns the quote
      channel,
    } = body

    if (!context || !content || !role) {
      return json({ error: "Missing required fields: context, content, role" }, 400)
    }

    let loan_officer_id: string | null = null
    let resolved_lead_id: string | null = lead_id || null

    // ── Auth routing ──────────────────────────────────────────
    if (context === "ezra") {
      // Validate JWT for Ezra (LO-facing)
      const authHeader = req.headers.get("Authorization") || ""
      const token = authHeader.replace("Bearer ", "")

      if (!token) {
        return json({ error: "Authorization required for ezra context" }, 401)
      }

      const { data: { user }, error: authErr } = await sb.auth.getUser(token)
      if (authErr || !user) {
        return json({ error: "Invalid or expired token" }, 401)
      }

      loan_officer_id = user.id

      if (!conversation_id) {
        return json({ error: "conversation_id required for ezra context" }, 400)
      }
    } else if (context === "quote-chat") {
      // Validate quote_code for quote-chat (client-facing)
      if (!quote_code) {
        return json({ error: "quote_code required for quote-chat context" }, 400)
      }

      const { data: ql, error: qlErr } = await sb
        .from("quote_links")
        .select("id, user_id, lead_id")
        .eq("code", quote_code)
        .maybeSingle()

      if (qlErr || !ql) {
        return json({ error: "Invalid quote_code" }, 404)
      }

      loan_officer_id = ql.user_id || body_user_id || null
      resolved_lead_id = resolved_lead_id || ql.lead_id || null
    } else {
      return json({ error: "Invalid context. Must be 'ezra' or 'quote-chat'" }, 400)
    }

    // ── TCPA STOP-word detection ──────────────────────────────
    let dnc_triggered = false
    let matched_keyword: string | null = null

    if (role === "user") {
      matched_keyword = detectStopKeyword(content)

      if (matched_keyword && resolved_lead_id) {
        dnc_triggered = true

        // Insert into consent_vault (using existing schema)
        const { error: cvErr } = await sb.from("consent_vault").insert({
          lead_id: resolved_lead_id,
          user_id: loan_officer_id,
          consent_type: "revocation",
          consent_source: context,
          consent_text: content.substring(0, 2000),
          channels_allowed: [],
          revoke_method: `STOP keyword: ${matched_keyword}`,
          revoked_at: new Date().toISOString(),
          opted_out: true,
          is_active: false,
          dnc_listed: true,
          dnc_listed_at: new Date().toISOString(),
          provider: channel || "chat",
          metadata: { keyword: matched_keyword, source: context },
        })

        if (cvErr) {
          console.error("Failed to insert consent_vault:", cvErr)
          // Non-fatal: continue with message logging
        }

        // Set lead DNC flag
        const { error: dncErr } = await sb
          .from("leads")
          .update({
            dnc: true,
            dnc_reason: `STOP keyword: ${matched_keyword}`,
            dnc_updated_at: new Date().toISOString(),
          })
          .eq("id", resolved_lead_id)

        if (dncErr) {
          console.error("Failed to update lead DNC:", dncErr)
        }
      }
    }

    // ── Log the message ───────────────────────────────────────
    let message_id: string | null = null

    if (context === "ezra") {
      // Insert into ezra_messages
      const { data: msg, error: msgErr } = await sb
        .from("ezra_messages")
        .insert({
          conversation_id,
          role,
          content,
          model_used: model_used || null,
          metadata: metadata || {},
        })
        .select("id")
        .single()

      if (msgErr) {
        console.error("Failed to insert ezra_message:", msgErr)
        return json({ error: "Failed to log message" }, 500)
      }

      message_id = msg.id

      // Touch conversation updated_at
      await sb
        .from("ezra_conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", conversation_id)
    } else {
      // quote-chat: log into ezra_messages with source metadata
      // Find or create a conversation for this quote_code
      let conv_id: string | null = null

      const { data: existing } = await sb
        .from("ezra_conversations")
        .select("id")
        .eq("conversation_id", `quote-chat-${quote_code}`)
        .maybeSingle()

      if (existing) {
        conv_id = existing.id
      } else if (loan_officer_id) {
        // Create a conversation for this quote-chat session
        const { data: newConv, error: convErr } = await sb
          .from("ezra_conversations")
          .insert({
            conversation_id: `quote-chat-${quote_code}`,
            loan_officer_id,
            borrower_id: resolved_lead_id,
            conversation_summary: `Quote chat session for ${quote_code}`,
            status: "active",
          })
          .select("id")
          .single()

        if (convErr) {
          console.error("Failed to create conversation:", convErr)
          return json({ error: "Failed to create conversation record" }, 500)
        }
        conv_id = newConv.id
      }

      if (conv_id) {
        const { data: msg, error: msgErr } = await sb
          .from("ezra_messages")
          .insert({
            conversation_id: conv_id,
            role,
            content,
            model_used: model_used || null,
            metadata: {
              source: "quote-chat",
              quote_code,
              lead_id: resolved_lead_id,
              ...(metadata || {}),
            },
          })
          .select("id")
          .single()

        if (msgErr) {
          console.error("Failed to insert quote-chat message:", msgErr)
          return json({ error: "Failed to log message" }, 500)
        }
        message_id = msg.id
      }
    }

    return json({
      success: true,
      message_id,
      dnc_triggered,
      ...(dnc_triggered ? { keyword: matched_keyword } : {}),
    })
  } catch (err) {
    console.error("log-conversation error:", err.message || err)
    return json({ error: "Internal server error" }, 500)
  }
})
