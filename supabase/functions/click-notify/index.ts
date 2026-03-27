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
    const internalSecret = Deno.env.get("CLICK_NOTIFY_SECRET") || ""
    const providedSecret = req.headers.get("x-click-notify-secret") || ""
    const authHeader = req.headers.get("Authorization") || ""

    let isAuthorized = false
    if (internalSecret && providedSecret && providedSecret === internalSecret) {
      isAuthorized = true
    } else if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "")
      const { data: { user }, error: authError } = await sb.auth.getUser(token)
      if (!authError && user) {
        const { data: profile } = await sb
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle()
        isAuthorized = profile?.role === "admin" || profile?.role === "super_admin"
      }
    }

    if (!isAuthorized) {
      return json({ error: "Unauthorized" }, 401)
    }

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

    // ── AUTOMATION ALERTS: Send pending alerts via email + optional webhook ──
    let alertsSent = 0
    let alertsFailed = 0
    try {
      const { data: alerts } = await sb
        .from("automation_alerts")
        .select("id, user_id, lead_id, event_type, title, body, payload, delivered_email, delivered_webhook")
        .eq("delivered_email", false)
        .order("created_at", { ascending: true })
        .limit(30)

      if (alerts && alerts.length > 0) {
        const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || ""
        const RESEND_FROM = Deno.env.get("RESEND_FROM_EMAIL") || "alerts@notifications.aboveallcrm.com"

        // Cache user emails + webhook URLs
        const userCache: Record<string, { email: string; webhookUrl: string | null }> = {}

        for (const alert of alerts) {
          try {
            if (!(alert.user_id in userCache)) {
              // Get user email from profiles
              const { data: prof } = await sb
                .from("profiles")
                .select("id")
                .eq("id", alert.user_id)
                .maybeSingle()

              // Get email from auth.users via admin API
              const { data: { user: authUser } } = await sb.auth.admin.getUserById(alert.user_id)
              const userEmail = authUser?.email || ""

              // Get webhook URL
              const { data: intRow } = await sb
                .from("user_integrations")
                .select("metadata")
                .eq("user_id", alert.user_id)
                .eq("provider", "heloc_keys")
                .maybeSingle()

              userCache[alert.user_id] = {
                email: userEmail,
                webhookUrl: intRow?.metadata?.n8n_webhook_url || null,
              }
            }

            const user = userCache[alert.user_id]

            // Send email via Resend
            if (RESEND_API_KEY && user.email) {
              try {
                const eventEmoji: Record<string, string> = {
                  hot_lead: "\uD83D\uDD25",
                  application_submitted: "\uD83C\uDF89",
                  repeat_visitor: "\uD83D\uDC40",
                  stale_lead: "\u23F0",
                  quote_expiry: "\u26A0\uFE0F",
                }
                const emoji = eventEmoji[alert.event_type] || "\uD83D\uDD14"

                await fetch("https://api.resend.com/emails", {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${RESEND_API_KEY}`,
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    from: RESEND_FROM,
                    to: user.email,
                    subject: `${emoji} ${alert.title}`,
                    html: `
                      <div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:20px;">
                        <h2 style="color:#0f172a;margin:0 0 12px 0;">${emoji} ${alert.title}</h2>
                        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 16px 0;">${alert.body}</p>
                        ${alert.payload?.phone ? `<a href="tel:${alert.payload.phone}" style="display:inline-block;background:#3b82f6;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;margin-right:8px;">Call Now</a>` : ''}
                        ${alert.payload?.email ? `<a href="mailto:${alert.payload.email}" style="display:inline-block;background:#10b981;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;">Send Email</a>` : ''}
                        <p style="color:#94a3b8;font-size:11px;margin-top:24px;">Above All CRM Automation Alert</p>
                      </div>
                    `,
                  }),
                })
              } catch (emailErr) {
                console.error(`Email failed for alert ${alert.id}:`, emailErr.message)
              }
            }

            // Send to n8n webhook (optional, Platinum+ — webhook URL presence implies Platinum)
            let webhookSent = false
            if (user.webhookUrl) {
              try {
                const wResp = await fetch(user.webhookUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    event: alert.event_type,
                    title: alert.title,
                    body: alert.body,
                    lead: alert.payload || {},
                    alert_id: alert.id,
                    timestamp: new Date().toISOString(),
                  }),
                  signal: AbortSignal.timeout(10000),
                })
                webhookSent = wResp.ok
              } catch (_) {
                // Webhook delivery is best-effort
              }
            }

            // Mark as delivered
            await sb
              .from("automation_alerts")
              .update({ delivered_email: true, delivered_webhook: webhookSent })
              .eq("id", alert.id)

            alertsSent++
          } catch (alertErr) {
            console.error(`Error processing alert ${alert.id}:`, alertErr.message)
            alertsFailed++
          }
        }
      }
    } catch (alertBatchErr) {
      console.error("Automation alerts processing error:", alertBatchErr.message)
    }

    return json({
      processed: pending.length,
      sent,
      failed,
      automation_alerts: { sent: alertsSent, failed: alertsFailed },
    })
  } catch (err) {
    console.error("click-notify error:", err.message || err)
    return json({ error: "Internal server error" }, 500)
  }
})
