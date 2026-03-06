// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Bonzo API v3 — production base URL (api.getbonzo.com does NOT exist)
const BONZO_API = "https://app.getbonzo.com/api/v3"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function jsonResponse(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders })
    }
    if (req.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed' }, 405)
    }

    try {
        // 1. Authenticate caller via JWT
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401)

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (authError || !user) return jsonResponse({ error: 'Invalid or expired token' }, 401)

        const userId = user.id

        // 2. Get Bonzo API key from user_integrations (both providers)
        const { data: integrations } = await supabaseAdmin
            .from('user_integrations')
            .select('provider, metadata')
            .eq('user_id', userId)
            .in('provider', ['heloc_keys', 'heloc_settings'])

        let bonzoApiKey = ''
        for (const row of (integrations || [])) {
            if (row.provider === 'heloc_keys') {
                bonzoApiKey = row.metadata?.bonzo_api_key || row.metadata?.bonzo_api_key_2 || bonzoApiKey
            }
            if (row.provider === 'heloc_settings') {
                bonzoApiKey = row.metadata?.bonzo?.apiKey || row.metadata?.bonzo?.apiKey2 || bonzoApiKey
            }
        }

        if (!bonzoApiKey) {
            return jsonResponse({ error: 'No Bonzo API key configured. Go to Settings → Integrations → Bonzo.' }, 400)
        }

        // 3. Parse request
        const body = await req.json()
        const { action, payload, contactId } = body

        const bonzoHeaders: Record<string, string> = {
            'Authorization': `Bearer ${bonzoApiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }

        // 4. Route to appropriate Bonzo API v3 call
        // In v3, "contacts" are called "prospects"
        let bonzoResp: Response
        let bonzoUrl: string

        switch (action) {
            case 'create_contact': {
                // POST /v3/prospects — store a new prospect
                // v3 also has POST /v3/prospects/create-or-update-and-message for upsert+message
                bonzoUrl = `${BONZO_API}/prospects`
                bonzoResp = await fetch(bonzoUrl, {
                    method: 'POST',
                    headers: bonzoHeaders,
                    body: JSON.stringify(payload),
                })
                break
            }

            case 'search_contact': {
                // v3 doesn't have a dedicated search endpoint.
                // Use GET /v3/prospects with query params for filtering.
                // The payload may contain { email: '...' } — pass as query string.
                const params = new URLSearchParams()
                if (payload?.email) params.set('email', payload.email)
                if (payload?.phone) params.set('phone', payload.phone)
                if (payload?.page) params.set('page', String(payload.page))
                if (payload?.per_page) params.set('per_page', String(payload.per_page))
                bonzoUrl = `${BONZO_API}/prospects?${params.toString()}`
                bonzoResp = await fetch(bonzoUrl, {
                    method: 'GET',
                    headers: bonzoHeaders,
                })
                break
            }

            case 'update_contact': {
                if (!contactId) return jsonResponse({ error: 'Missing contactId for update' }, 400)
                // PUT /v3/prospects/{prospect}
                bonzoUrl = `${BONZO_API}/prospects/${contactId}`
                bonzoResp = await fetch(bonzoUrl, {
                    method: 'PUT',
                    headers: bonzoHeaders,
                    body: JSON.stringify(payload),
                })
                break
            }

            case 'send_sms': {
                if (!contactId) return jsonResponse({ error: 'Missing contactId for SMS' }, 400)
                // POST /v3/prospects/{prospect}/sms
                bonzoUrl = `${BONZO_API}/prospects/${contactId}/sms`
                bonzoResp = await fetch(bonzoUrl, {
                    method: 'POST',
                    headers: bonzoHeaders,
                    body: JSON.stringify(payload),
                })
                break
            }

            case 'send_email': {
                if (!contactId) return jsonResponse({ error: 'Missing contactId for email' }, 400)
                // POST /v3/prospects/{prospect}/email
                bonzoUrl = `${BONZO_API}/prospects/${contactId}/email`
                bonzoResp = await fetch(bonzoUrl, {
                    method: 'POST',
                    headers: bonzoHeaders,
                    body: JSON.stringify(payload),
                })
                break
            }

            case 'get_contact': {
                if (!contactId) return jsonResponse({ error: 'Missing contactId' }, 400)
                // GET /v3/prospects/{prospect}
                bonzoUrl = `${BONZO_API}/prospects/${contactId}`
                bonzoResp = await fetch(bonzoUrl, {
                    method: 'GET',
                    headers: bonzoHeaders,
                })
                break
            }

            case 'list_campaigns': {
                // GET /v3/campaigns
                bonzoUrl = `${BONZO_API}/campaigns`
                bonzoResp = await fetch(bonzoUrl, {
                    method: 'GET',
                    headers: bonzoHeaders,
                })
                break
            }

            case 'list_tags': {
                // GET /v3/tags
                bonzoUrl = `${BONZO_API}/tags`
                bonzoResp = await fetch(bonzoUrl, {
                    method: 'GET',
                    headers: bonzoHeaders,
                })
                break
            }

            default:
                return jsonResponse({ error: 'Unknown action: ' + action }, 400)
        }

        // 5. Return Bonzo's response
        const bonzoData = await bonzoResp.json().catch(() => ({}))
        const bonzoStatus = bonzoResp.status

        return jsonResponse({
            success: bonzoResp.ok,
            status: bonzoStatus,
            data: bonzoData,
        }, bonzoResp.ok ? 200 : 502)

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('bonzo-proxy error:', message)
        return jsonResponse({ error: message }, 500)
    }
})
