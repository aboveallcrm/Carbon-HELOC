// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"

// 1x1 transparent PNG pixel (base64)
const PIXEL_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const PIXEL_BYTES = Uint8Array.from(atob(PIXEL_B64), c => c.charCodeAt(0))

serve(async (req: Request) => {
    // track-quote-view is embedded as a tracking pixel/POST in client-facing quote pages
    // served from our known domains. Use shared CORS.
    const corsHeaders = getCorsHeaders(req)

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders })
    }

    try {
        const url = new URL(req.url)
        const lead_id = url.searchParams.get('lead_id')
        const user_id = url.searchParams.get('user_id')
        const event = url.searchParams.get('event') || 'quote_opened'

        if (!lead_id || !user_id) {
            // For GET (pixel) requests, return pixel even on error to avoid broken images
            if (req.method === 'GET') {
                return new Response(PIXEL_BYTES, {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'image/png', 'Cache-Control': 'no-store, no-cache, must-revalidate' }
                })
            }
            return new Response(
                JSON.stringify({ error: 'Missing lead_id or user_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Initialize Supabase Admin Client
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Rate limit: max 100 events per lead per day
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const { count } = await supabaseAdmin
            .from('lead_analytics')
            .select('id', { count: 'exact', head: true })
            .eq('lead_id', lead_id)
            .gte('created_at', today.toISOString())

        if ((count || 0) >= 100) {
            if (req.method === 'GET') {
                return new Response(PIXEL_BYTES, {
                    status: 200,
                    headers: { ...corsHeaders, 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }
                })
            }
            return new Response(
                JSON.stringify({ message: 'Rate limited', ok: true }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Parse event_data from POST body or URL params
        let eventData: Record<string, any> = {}
        if (req.method === 'POST') {
            try { eventData = await req.json() } catch { /* empty body is ok */ }
        } else {
            // GET request — pull extra params
            if (url.searchParams.get('section')) eventData.section = url.searchParams.get('section')
            if (url.searchParams.get('button')) eventData.button_name = url.searchParams.get('button')
            if (url.searchParams.get('duration')) eventData.duration_sec = parseInt(url.searchParams.get('duration') || '0')
        }

        // Mask IP last octet for privacy
        const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || req.headers.get('cf-connecting-ip')
            || 'unknown'
        const maskedIp = rawIp !== 'unknown' ? rawIp.replace(/\.\d+$/, '.xxx') : 'unknown'

        // Detect device type from user agent
        const userAgent = req.headers.get('user-agent') || ''
        const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent)
        eventData.device = isMobile ? 'mobile' : 'desktop'

        // Insert analytics event
        await supabaseAdmin.from('lead_analytics').insert({
            lead_id,
            user_id,
            event_type: event,
            event_data: eventData,
            ip_address: maskedIp,
            user_agent: userAgent.substring(0, 500) // truncate long UAs
        })

        // Send real-time notification to LO when quote is opened
        if (event === 'quote_opened' && user_id && lead_id && lead_id !== 'none') {
            try {
                // Look up client name from leads or quote_links
                let clientName = ''
                const { data: lead } = await supabaseAdmin
                    .from('leads')
                    .select('first_name, last_name, email')
                    .eq('id', lead_id)
                    .maybeSingle()

                if (lead) {
                    clientName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email || ''
                }

                // Get quote code from URL params if available
                const quoteCode = url.searchParams.get('code') || eventData.code || ''

                await supabaseAdmin.from('quote_view_notifications').insert({
                    user_id,
                    lead_id,
                    quote_code: quoteCode,
                    client_name: clientName,
                    device: isMobile ? 'mobile' : 'desktop'
                })
            } catch (notifErr) {
                // Don't fail the whole request if notification insert fails
                console.error('Notification insert error:', notifErr)
            }
        }

        // For GET requests (tracking pixel), return 1x1 pixel image
        if (req.method === 'GET') {
            return new Response(PIXEL_BYTES, {
                status: 200,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'image/png',
                    'Cache-Control': 'no-store, no-cache, must-revalidate'
                }
            })
        }

        // For POST requests, return JSON
        return new Response(
            JSON.stringify({ message: 'Event tracked', ok: true }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('Track quote view error:', message)

        // Always return pixel for GET requests even on error
        if (req.method === 'GET') {
            return new Response(PIXEL_BYTES, {
                status: 200,
                headers: { ...corsHeaders, 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }
            })
        }

        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
