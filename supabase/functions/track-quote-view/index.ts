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

        // ===== POSITIVE-INTENT DETECTION → automation_alerts =====
        // When the client signals buying intent, fire a celebratory in-app + email alert to the LO.
        const POSITIVE_INTENT_EVENTS: Record<string, { weight: number; titleTpl: string; bodyTpl: string }> = {
            'apply_redirect':        { weight: 50,  titleTpl: '🔥 {name} just clicked Apply Now!',           bodyTpl: '{name} clicked Apply Now on their quote — they are ready. Lock it in!' },
            'application_submitted': { weight: 100, titleTpl: '🎉 {name} submitted the application!',         bodyTpl: '{name} just submitted their application! Time to close.' },
            'schedule_call_clicked': { weight: 40,  titleTpl: '📞 {name} wants to schedule a call',          bodyTpl: '{name} clicked schedule-a-call on their quote. Reach out today!' },
            'call_me_now':           { weight: 80,  titleTpl: '🚨 {name} requested a callback NOW',           bodyTpl: '{name} requested an immediate callback. Move fast!' },
            'video_completed':       { weight: 25,  titleTpl: '👀 {name} watched your full video',            bodyTpl: '{name} watched the full video on their quote — strong engagement signal.' },
            'repeat_visit':          { weight: 30,  titleTpl: '🔄 {name} came back to their quote',           bodyTpl: '{name} returned to view their quote again. Strike while it is warm!' }
        }

        if (POSITIVE_INTENT_EVENTS[event] && resolvedLeadId !== 'none') {
            try {
                let clientName = ''
                const { data: lead } = await supabaseAdmin
                    .from('leads')
                    .select('first_name, last_name, email')
                    .eq('id', resolvedLeadId)
                    .maybeSingle()
                if (lead) {
                    clientName = [lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email || 'Your client'
                } else {
                    clientName = 'Your client'
                }

                const quoteCode = providedCode || String(eventData.code || '')
                const sig = POSITIVE_INTENT_EVENTS[event]

                // Throttle: skip if a positive_intent alert exists for this lead+event in last 30 min
                const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString()
                const { data: recent } = await supabaseAdmin
                    .from('automation_alerts')
                    .select('id')
                    .eq('user_id', resolvedUserId)
                    .eq('lead_id', resolvedLeadId)
                    .eq('event_type', 'positive_intent')
                    .gte('created_at', cutoff)
                    .ilike('payload->>signal_source', event)
                    .maybeSingle()

                if (!recent) {
                    await supabaseAdmin.from('automation_alerts').insert({
                        user_id: resolvedUserId,
                        lead_id: resolvedLeadId,
                        event_type: 'positive_intent',
                        title: sig.titleTpl.replace(/\{name\}/g, clientName),
                        body: sig.bodyTpl.replace(/\{name\}/g, clientName),
                        payload: { quote_code: quoteCode, signal_source: event, signal_score: sig.weight, device: isMobile ? 'mobile' : 'desktop' },
                        seen: false
                    })

                    // Fire email alert (fire-and-forget)
                    try {
                        const alertEmailUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-alert-email`
                        fetch(alertEmailUrl, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
                            },
                            body: JSON.stringify({
                                user_id: resolvedUserId,
                                template: 'positive_intent',
                                client_name: clientName,
                                signal: event,
                                quote_code: quoteCode,
                                title: sig.titleTpl.replace(/\{name\}/g, clientName),
                                body: sig.bodyTpl.replace(/\{name\}/g, clientName)
                            })
                        }).catch((emailErr: unknown) => console.warn('email alert failed:', emailErr))
                    } catch (emailErr) {
                        console.warn('email alert dispatch error:', emailErr)
                    }
                }
            } catch (piErr) {
                console.error('Positive-intent alert error:', piErr)
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
