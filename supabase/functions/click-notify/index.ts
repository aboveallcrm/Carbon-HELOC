// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"

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

    // Fetch pending notifications (batch of 50)
    const { data: pending, error: fetchErr } = await sb
      .from("click_notifications")
      .select("id, link_id, lead_id, user_id, click_id, click_data, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50)

    if (fetchErr) {
      console.error("Failed to fetch pending notifications:", fetchErr)
      return json({ error: "Failed to fetch notifications" }, 500)
    }

    if (!pending || pending.length === 0) {
      return json({ processed: 0, sent: 0, failed: 0, message: "No pending notifications" })
    }

    // Cache webhook URLs per user to avoid repeated lookups
    const webhookCache: Record<string, string | null> = {}
    let sent = 0
    let failed = 0

    for (const row of pending) {
      try {
        // Look up n8n webhook URL (cached per user)
        if (!(row.user_id in webhookCache)) {
          const { data: intRow } = await sb
            .from("user_integrations")
            .select("metadata")
            .eq("user_id", row.user_id)
            .eq("provider", "heloc_keys")
            .maybeSingle()

          webhookCache[row.user_id] = intRow?.metadata?.n8n_webhook_url || null
        }

        const webhookUrl = webhookCache[row.user_id]

        if (!webhookUrl) {
          // No webhook configured — mark as failed
          await sb
            .from("click_notifications")
            .update({ status: "failed", notification_sent_at: new Date().toISOString() })
            .eq("id", row.id)
          failed++
          continue
        }

        // Look up lead info
        let lead = null
        if (row.lead_id) {
          const { data: leadRow } = await sb
            .from("leads")
            .select("first_name, last_name, email, phone, engagement_score")
            .eq("id", row.lead_id)
            .maybeSingle()
          lead = leadRow
        }

        // Build webhook payload
        const payload = {
          event: "link_clicked",
          lead: lead ? {
            id: row.lead_id,
            first_name: lead.first_name,
            last_name: lead.last_name,
            email: lead.email,
            phone: lead.phone,
            engagement_score: lead.engagement_score,
          } : { id: row.lead_id },
          click: row.click_data || {},
          link_id: row.link_id,
          notification_id: row.id,
          timestamp: new Date().toISOString(),
        }

        // Send webhook with 10-second timeout
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10000)

        const resp = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        })

        clearTimeout(timeout)

        if (resp.ok) {
          await sb
            .from("click_notifications")
            .update({ status: "sent", notification_sent_at: new Date().toISOString() })
            .eq("id", row.id)
          sent++
        } else {
          console.error(`Webhook failed for notification ${row.id}: ${resp.status} ${resp.statusText}`)
          await sb
            .from("click_notifications")
            .update({ status: "failed", notification_sent_at: new Date().toISOString() })
            .eq("id", row.id)
          failed++
        }
      } catch (err) {
        console.error(`Error processing notification ${row.id}:`, err.message || err)
        await sb
          .from("click_notifications")
          .update({ status: "failed", notification_sent_at: new Date().toISOString() })
          .eq("id", row.id)
        failed++
      }
    }

    return json({
      processed: pending.length,
      sent,
      failed,
    })
  } catch (err) {
    console.error("click-notify error:", err.message || err)
    return json({ error: "Internal server error" }, 500)
  }
})
