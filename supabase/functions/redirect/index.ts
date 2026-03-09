// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const SB_URL = Deno.env.get("SUPABASE_URL")
    const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

    if (!SB_URL || !SB_KEY) {
      return new Response(JSON.stringify({ error: "Missing env vars" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const url = new URL(req.url)
    const pathParts = url.pathname.split("/").filter(Boolean)
    // pathParts = ["redirect", "slug"] or ["functions", "v1", "redirect", "slug"]
    const slug = pathParts[pathParts.length - 1]

    if (!slug || slug === "redirect") {
      return new Response("Missing slug", { status: 400, headers: corsHeaders })
    }

    const sb = createClient(SB_URL, SB_KEY)

    // Look up the link
    const { data: link, error } = await sb
      .from("links")
      .select("id, destination_url, expires_at, lead_id, user_id, utm_source, utm_medium, utm_campaign")
      .eq("slug", slug)
      .single()

    if (error || !link) {
      return new Response(notFoundHtml(slug), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      })
    }

    // Check expiration
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return new Response(expiredHtml(), {
        status: 410,
        headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
      })
    }

    // Parse device info from User-Agent
    const ua = req.headers.get("user-agent") || ""
    const deviceType = /mobile|android|iphone|ipad/i.test(ua) ? "mobile" : "desktop"

    // Hash IP for privacy
    const forwarded = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown"
    const ip = forwarded.split(",")[0].trim()
    const ipHash = await hashString(ip + slug)

    // Log the click (awaited so it completes before function exits)
    const clickResult = await sb.from("clicks").insert({
      link_id: link.id,
      ip_hash: ipHash,
      ip_address: ip.replace(/\.\d+$/, '.xxx'),
      user_agent: ua.substring(0, 500),
      referer: (req.headers.get("referer") || "").substring(0, 500),
      device_type: deviceType,
    })
    if (clickResult.error) {
      console.error("Click insert error:", JSON.stringify(clickResult.error))
    }

    // Build destination URL with UTM params
    let destination = link.destination_url
    try {
      const destUrl = new URL(destination)
      if (link.utm_source && !destUrl.searchParams.has("utm_source")) {
        destUrl.searchParams.set("utm_source", link.utm_source)
      }
      if (link.utm_medium && !destUrl.searchParams.has("utm_medium")) {
        destUrl.searchParams.set("utm_medium", link.utm_medium)
      }
      if (link.utm_campaign && !destUrl.searchParams.has("utm_campaign")) {
        destUrl.searchParams.set("utm_campaign", link.utm_campaign)
      }
      destination = destUrl.toString()
    } catch {
      // If destination isn't a valid URL, redirect as-is
    }

    // 302 redirect
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        "Location": destination,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    })
  } catch (e) {
    console.error('Redirect error:', (e as Error)?.message || e);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})

async function hashString(input) {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("").substring(0, 16)
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function notFoundHtml(slug) {
  return `<!DOCTYPE html>
<html><head><title>Link Not Found</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0f0f23;color:#e0e0e0;}
.card{text-align:center;padding:2rem;max-width:400px;}.card h1{font-size:3rem;margin:0 0 1rem;}.card p{color:#999;}</style>
</head><body><div class="card"><h1>404</h1><p>Link <code>${escHtml(slug)}</code> not found.</p></div></body></html>`
}

function expiredHtml() {
  return `<!DOCTYPE html>
<html><head><title>Link Expired</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0f0f23;color:#e0e0e0;}
.card{text-align:center;padding:2rem;max-width:400px;}.card h1{font-size:3rem;margin:0 0 1rem;color:#f59e0b;}.card p{color:#999;}</style>
</head><body><div class="card"><h1>Expired</h1><p>This link has expired. Please contact your loan officer for a new quote.</p></div></body></html>`
}
