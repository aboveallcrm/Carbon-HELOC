// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"

const RADAR_API = "https://api.radar.io/v1/search/autocomplete"
const FETCH_TIMEOUT_MS = 10_000

let corsHeaders: Record<string, string> = {}

function jsonResponse(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}

serve(async (req: Request) => {
    corsHeaders = getCorsHeaders(req)

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

        // 2. Get Radar API key from user_integrations
        const { data: integrations } = await supabaseAdmin
            .from('user_integrations')
            .select('provider, metadata')
            .eq('user_id', userId)
            .in('provider', ['heloc_keys', 'heloc_settings'])

        let radarKey = ''
        for (const row of (integrations || [])) {
            if (row.provider === 'heloc_settings' && row.metadata?.radar?.apiKey) {
                radarKey = row.metadata.radar.apiKey
            }
            if (row.provider === 'heloc_keys' && row.metadata?.radar_api_key) {
                radarKey = row.metadata.radar_api_key || radarKey
            }
        }

        // Fallback to platform-level env var
        if (!radarKey) {
            radarKey = Deno.env.get('RADAR_API_KEY') ?? ''
        }

        if (!radarKey) {
            return jsonResponse({ error: 'No Radar API key configured. Go to Settings → Integrations → Radar.io.' }, 400)
        }

        // 3. Parse request
        const body = await req.json()
        const { query } = body
        if (!query || typeof query !== 'string' || query.length < 2) {
            return jsonResponse({ error: 'Query must be at least 2 characters' }, 400)
        }

        // 4. Forward to Radar API
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

        const radarUrl = `${RADAR_API}?query=${encodeURIComponent(query)}&layers=address&country=US`
        const radarResp = await fetch(radarUrl, {
            headers: { 'Authorization': radarKey },
            signal: controller.signal,
        })
        clearTimeout(timeout)

        const radarData = await radarResp.json()

        if (!radarResp.ok) {
            return jsonResponse({ error: 'Radar API error', status: radarResp.status, detail: radarData }, 502)
        }

        // 5. Return addresses
        return jsonResponse({
            addresses: radarData.addresses || [],
        })

    } catch (err) {
        if ((err as Error).name === 'AbortError') {
            return jsonResponse({ error: 'Radar API timed out' }, 504)
        }
        const message = err instanceof Error ? err.message : String(err)
        console.error('radar-proxy error:', message)
        return jsonResponse({ error: message }, 500)
    }
})
