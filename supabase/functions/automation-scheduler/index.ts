// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"

/**
 * automation-scheduler: Cron-triggered edge function (run every 30min via Supabase cron)
 * Checks for:
 *  1. Stale leads (48hrs no engagement after quote sent) — Platinum+
 *  2. Expiring quote links (within 24hrs) — Platinum+
 * Creates automation_alerts rows (consumed by click-notify for email delivery + in-app toasts)
 */
serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req)
  function json(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders })

  const SB_URL = Deno.env.get("SUPABASE_URL")
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  if (!SB_URL || !SB_KEY) return json({ error: "Missing env vars" }, 500)

  const sb = createClient(SB_URL, SB_KEY)

  // Verify authorization (cron secret or admin JWT)
  const secret = Deno.env.get("AUTOMATION_SCHEDULER_SECRET") || ""
  const providedSecret = req.headers.get("x-scheduler-secret") || ""
  const authHeader = req.headers.get("Authorization") || ""

  let isAuthorized = false
  if (secret && providedSecret === secret) {
    isAuthorized = true
  } else if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "")
    const { data: { user } } = await sb.auth.getUser(token)
    if (user) {
      const { data: prof } = await sb.from("profiles").select("role").eq("id", user.id).maybeSingle()
      isAuthorized = prof?.role === "super_admin"
    }
  }

  if (!isAuthorized) return json({ error: "Unauthorized" }, 401)

  let staleCount = 0
  let expiryCount = 0

  try {
    // 1. Check for stale leads (Platinum+ gated in the RPC function)
    const { data: staleLeads, error: staleErr } = await sb.rpc("check_stale_leads")
    if (staleErr) {
      console.error("check_stale_leads error:", staleErr.message)
    } else if (staleLeads && staleLeads.length > 0) {
      for (const lead of staleLeads) {
        const hours = Math.round(lead.hours_since_sent)
        await sb.from("automation_alerts").insert({
          user_id: lead.alert_user_id,
          lead_id: lead.alert_lead_id,
          event_type: "stale_lead",
          title: `${lead.lead_name} hasn't opened your quote`,
          body: `You sent a quote to ${lead.lead_name} ${hours} hours ago but they haven't opened it yet. A quick follow-up text can make the difference.\n\nSuggested text: "Hi ${lead.lead_name.split(' ')[0]}, I wanted to make sure you received the HELOC quote I sent over. Happy to walk through the numbers whenever works for you!"`,
          payload: {
            lead_name: lead.lead_name,
            email: lead.lead_email,
            phone: lead.lead_phone,
            quote_code: lead.quote_code,
            hours_since_sent: hours,
          },
        })
        staleCount++
      }
    }

    // 2. Check for expiring quotes (Platinum+ gated in the RPC function)
    const { data: expiringQuotes, error: expiryErr } = await sb.rpc("check_expiring_quotes")
    if (expiryErr) {
      console.error("check_expiring_quotes error:", expiryErr.message)
    } else if (expiringQuotes && expiringQuotes.length > 0) {
      for (const q of expiringQuotes) {
        const hours = Math.round(q.hours_until_expiry)
        await sb.from("automation_alerts").insert({
          user_id: q.alert_user_id,
          lead_id: q.alert_lead_id,
          event_type: "quote_expiry",
          title: `${q.lead_name}'s quote expires in ${hours} hours`,
          body: `The quote link you sent to ${q.lead_name} expires in about ${hours} hours. Consider resending with a fresh link or reaching out to close the deal before it expires.`,
          payload: {
            lead_name: q.lead_name,
            email: q.lead_email,
            quote_code: q.quote_code,
            expires_at: q.expires_at,
            hours_until_expiry: hours,
          },
        })
        expiryCount++
      }
    }

    // 3. Trigger click-notify to process any pending automation_alerts (email + webhook delivery)
    // Fire-and-forget: the click-notify function handles its own delivery
    try {
      const clickNotifySecret = Deno.env.get("CLICK_NOTIFY_SECRET") || ""
      await fetch(`${SB_URL}/functions/v1/click-notify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-click-notify-secret": clickNotifySecret,
        },
        body: JSON.stringify({ source: "automation-scheduler" }),
        signal: AbortSignal.timeout(15000),
      })
    } catch (_) {
      // Best-effort trigger
    }

    return json({
      success: true,
      stale_leads_alerted: staleCount,
      expiring_quotes_alerted: expiryCount,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error("automation-scheduler error:", err.message || err)
    return json({ error: "Internal server error" }, 500)
  }
})
