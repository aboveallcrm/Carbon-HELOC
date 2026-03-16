import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const ALERT_TO_EMAIL = Deno.env.get("ALERT_TO_EMAIL") || "";
const FROM_EMAIL = Deno.env.get("RESEND_FROM_EMAIL") || "alerts@notifications.aboveallcrm.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// HTML-escape user input to prevent XSS in email templates
function esc(s: string): string {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth: require valid JWT (authenticated user or service-role)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY not configured");
    }

    if (!ALERT_TO_EMAIL) {
      throw new Error("ALERT_TO_EMAIL not configured");
    }

    const { type, subject, details } = await req.json();

    // Build email HTML based on alert type
    let htmlBody = "";

    if (type === "webhook_failure") {
      htmlBody = `
        <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#1a1a2e;border-radius:12px;padding:24px;color:#fff;">
            <h2 style="color:#ef4444;margin:0 0 16px;">⚠️ Webhook Delivery Failed</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:8px 12px;color:#9ca3af;">Webhook</td><td style="padding:8px 12px;color:#f9fafb;font-weight:600;">${esc(details.webhookName || "Unknown")}</td></tr>
              <tr><td style="padding:8px 12px;color:#9ca3af;">Event</td><td style="padding:8px 12px;color:#a78bfa;">${esc(details.eventType || "Unknown")}</td></tr>
              <tr><td style="padding:8px 12px;color:#9ca3af;">URL</td><td style="padding:8px 12px;color:#60a5fa;word-break:break-all;">${esc(details.url || "N/A")}</td></tr>
              <tr><td style="padding:8px 12px;color:#9ca3af;">Status</td><td style="padding:8px 12px;color:#ef4444;font-weight:600;">${esc(String(details.statusCode || "No response"))}</td></tr>
              <tr><td style="padding:8px 12px;color:#9ca3af;">Error</td><td style="padding:8px 12px;color:#fbbf24;">${esc(details.error || "N/A")}</td></tr>
              <tr><td style="padding:8px 12px;color:#9ca3af;">Time</td><td style="padding:8px 12px;color:#f9fafb;">${esc(details.timestamp || new Date().toISOString())}</td></tr>
              ${details.userId ? `<tr><td style="padding:8px 12px;color:#9ca3af;">User</td><td style="padding:8px 12px;color:#f9fafb;">${esc(details.userId)}</td></tr>` : ""}
            </table>
            <p style="color:#6b7280;font-size:12px;margin:20px 0 0;border-top:1px solid #333;padding-top:12px;">
              Above All Carbon HELOC — Automated Alert
            </p>
          </div>
        </div>`;
    } else if (type === "email_failure") {
      htmlBody = `
        <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#1a1a2e;border-radius:12px;padding:24px;color:#fff;">
            <h2 style="color:#ef4444;margin:0 0 16px;">📧 Email Delivery Failed</h2>
            <table style="width:100%;border-collapse:collapse;font-size:14px;">
              <tr><td style="padding:8px 12px;color:#9ca3af;">Provider</td><td style="padding:8px 12px;color:#f9fafb;font-weight:600;">${esc(details.provider || "GHL")}</td></tr>
              <tr><td style="padding:8px 12px;color:#9ca3af;">Recipient</td><td style="padding:8px 12px;color:#60a5fa;">${esc(details.recipient || "Unknown")}</td></tr>
              <tr><td style="padding:8px 12px;color:#9ca3af;">Subject</td><td style="padding:8px 12px;color:#f9fafb;">${esc(details.emailSubject || "N/A")}</td></tr>
              <tr><td style="padding:8px 12px;color:#9ca3af;">Error</td><td style="padding:8px 12px;color:#fbbf24;">${esc(details.error || "N/A")}</td></tr>
              <tr><td style="padding:8px 12px;color:#9ca3af;">Time</td><td style="padding:8px 12px;color:#f9fafb;">${esc(details.timestamp || new Date().toISOString())}</td></tr>
            </table>
            <p style="color:#6b7280;font-size:12px;margin:20px 0 0;border-top:1px solid #333;padding-top:12px;">
              Above All Carbon HELOC — Automated Alert
            </p>
          </div>
        </div>`;
    } else {
      // Generic alert
      htmlBody = `
        <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#1a1a2e;border-radius:12px;padding:24px;color:#fff;">
            <h2 style="color:#f59e0b;margin:0 0 16px;">🔔 System Alert</h2>
            <p style="color:#f9fafb;font-size:14px;">${esc(subject || "An alert was triggered")}</p>
            <pre style="background:#111;border-radius:8px;padding:12px;color:#a78bfa;font-size:12px;overflow-x:auto;">${esc(JSON.stringify(details, null, 2))}</pre>
            <p style="color:#6b7280;font-size:12px;margin:20px 0 0;border-top:1px solid #333;padding-top:12px;">
              Above All Carbon HELOC — Automated Alert
            </p>
          </div>
        </div>`;
    }

    const emailSubject = subject || (type === "webhook_failure"
      ? `⚠️ Webhook Failed: ${details.webhookName || "Unknown"} — ${details.eventType || ""}`
      : type === "email_failure"
        ? `📧 Email Failed: ${details.recipient || "Unknown"}`
        : "🔔 Above All Carbon Alert");

    // Send via Resend API
    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [ALERT_TO_EMAIL],
        subject: emailSubject,
        html: htmlBody,
      }),
    });

    const resendData = await resendResp.json();

    if (!resendResp.ok) {
      console.error("Resend API error:", resendData);
      return new Response(JSON.stringify({ error: "Email delivery failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, id: resendData.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-alert-email error:", err instanceof Error ? err.message : err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
