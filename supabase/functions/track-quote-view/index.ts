// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"

const QUOTE_CODE_RE = /^[a-z0-9]{6,12}$/i

// 1x1 transparent PNG pixel (base64)
const PIXEL_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const PIXEL_BYTES = Uint8Array.from(atob(PIXEL_B64), c => c.charCodeAt(0))

function sanitizeEventType(value: unknown): string | null {
    const clean = String(value || '').trim().toLowerCase()
    return /^[a-z0-9_]{1,64}$/.test(clean) ? clean : null
}

function sanitizeEventData(value: unknown): Record<string, string | number | boolean> {
    const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    const cleaned: Record<string, string | number | boolean> = {}

    for (const [key, raw] of Object.entries(source).slice(0, 20)) {
        if (!/^[a-z0-9_]{1,40}$/i.test(key)) continue
        if (typeof raw === 'string') cleaned[key] = raw.slice(0, 300)
        else if (typeof raw === 'number' && Number.isFinite(raw)) cleaned[key] = raw
        else if (typeof raw === 'boolean') cleaned[key] = raw
    }

    return cleaned
}

function pixelResponse(corsHeaders: Record<string, string>, cacheControl = 'no-store, no-cache, must-revalidate') {
    return new Response(PIXEL_BYTES, {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'image/png', 'Cache-Control': cacheControl }
    })
}

serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req)

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders })
    }

    try {
        const url = new URL(req.url)
        const queryLeadId = url.searchParams.get('lead_id')
        const queryUserId = url.searchParams.get('user_id')
        const queryCode = url.searchParams.get('code')
        const event = sanitizeEventType(url.searchParams.get('event') || 'quote_opened')

        if (!event) {
            return new Response(
                JSON.stringify({ error: 'Invalid event type' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        let eventData: Record<string, string | number | boolean> = {}
        if (req.method === 'POST') {
            try {
                eventData = sanitizeEventData(await req.json())
            } catch {
                eventData = {}
            }
        } else {
            eventData = sanitizeEventData({
                section: url.searchParams.get('section') || undefined,
                button_name: url.searchParams.get('button') || undefined,
                duration_sec: parseInt(url.searchParams.get('duration') || '0'),
                code: queryCode || undefined,
            })
        }

        const providedCode = String(eventData.code || queryCode || '').trim()
        let resolvedLeadId = queryLeadId
        let resolvedUserId = queryUserId

        if (providedCode && QUOTE_CODE_RE.test(providedCode)) {
            const { data: link } = await supabaseAdmin
                .from('quote_links')
                .select('lead_id, user_id')
                .eq('code', providedCode)
                .maybeSingle()

            if (link?.user_id) {
                resolvedUserId = link.user_id
                resolvedLeadId = link.lead_id || resolvedLeadId

                if (queryUserId && queryUserId !== link.user_id) {
                    throw new Error('Invalid tracking context')
                }
                if (queryLeadId && link.lead_id && queryLeadId !== link.lead_id) {
                    throw new Error('Invalid tracking context')
                }
            }
        }

        if (!resolvedLeadId || !resolvedUserId) {
            if (req.method === 'GET') return pixelResponse(corsHeaders)

            return new Response(
                JSON.stringify({ error: 'Missing lead_id or user_id' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const { count } = await supabaseAdmin
            .from('lead_analytics')
            .select('id', { count: 'exact', head: true })
            .eq('lead_id', resolvedLeadId)
            .gte('created_at', today.toISOString())

        if ((count || 0) >= 100) {
            if (req.method === 'GET') return pixelResponse(corsHeaders, 'no-store')

            return new Response(
                JSON.stringify({ message: 'Rate limited', ok: true }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const rawIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || req.headers.get('cf-connecting-ip')
            || 'unknown'
        const maskedIp = rawIp !== 'unknown' ? rawIp.replace(/\.\d+$/, '.xxx') : 'unknown'

        const userAgent = req.headers.get('user-agent') || ''
        const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent)
        eventData.device = isMobile ? 'mobile' : 'desktop'

        await supabaseAdmin.from('lead_analytics').insert({
            lead_id: resolvedLeadId,
            user_id: resolvedUserId,
            event_type: event,
            event_data: eventData,
            ip_address: maskedIp,
            user_agent: userAgent.substring(0, 500)
        })

        if (event === 'quote_opened' && resolvedLeadId !== 'none') {
            try {
                let clientName = ''
                const { data: lead } = await supabaseAdmin
                    .from('leads')
                    .select('first_name, last_name, email')
                    .eq('id', resolvedLeadId)
                    .maybeSingle()

                if (lead) {
                    clientName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email || ''
                }

                const quoteCode = providedCode || String(eventData.code || '')

                await supabaseAdmin.from('quote_view_notifications').insert({
                    user_id: resolvedUserId,
                    lead_id: resolvedLeadId,
                    quote_code: quoteCode,
                    client_name: clientName,
                    device: isMobile ? 'mobile' : 'desktop'
                })
            } catch (notifErr) {
                console.error('Notification insert error:', notifErr)
            }
        }

        if (req.method === 'GET') return pixelResponse(corsHeaders)

        return new Response(
            JSON.stringify({ message: 'Event tracked', ok: true }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('Track quote view error:', message)

        if (req.method === 'GET') return pixelResponse(corsHeaders, 'no-store')

        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
