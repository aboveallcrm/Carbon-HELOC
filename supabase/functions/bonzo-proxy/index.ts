// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"
import { fetchWithRetry } from "../_shared/retry.ts"

// Bonzo API v3 — production base URL (api.getbonzo.com does NOT exist)
const BONZO_API = "https://app.getbonzo.com/api/v3"

const BONZO_FETCH_TIMEOUT_MS = 15_000

// corsHeaders is set per-request in the serve handler
let corsHeaders: Record<string, string> = {}

function jsonResponse(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}

// Helper: fetch with retry + timeout (retries on 429/5xx with exponential backoff)
async function timedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const { response } = await fetchWithRetry(url, options, {
        timeoutMs: BONZO_FETCH_TIMEOUT_MS,
        maxRetries: 2,
    })
    return response
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

        // 2. Get Bonzo API key from user_integrations (both providers)
        const { data: integrations } = await supabaseAdmin
            .from('user_integrations')
            .select('provider, metadata')
            .eq('user_id', userId)
            .in('provider', ['heloc_keys', 'heloc_settings'])

        // Collect all possible Bonzo keys — prefer the JWT API key (apiKey2) over the Xcode (apiKey)
        // The Xcode is a short hash used for event hook auth, NOT a Bearer token for the API
        let bonzoApiKey = ''
        for (const row of (integrations || [])) {
            if (row.provider === 'heloc_keys') {
                bonzoApiKey = row.metadata?.bonzo_api_key_2 || row.metadata?.bonzo_api_key || bonzoApiKey
            }
            if (row.provider === 'heloc_settings') {
                bonzoApiKey = row.metadata?.bonzo?.apiKey2 || row.metadata?.bonzo?.apiKey || bonzoApiKey
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
                // MATCH-ONLY policy (Addendum 6 hardened, 2026-04-13):
                // Carbon NEVER creates new Bonzo prospects. Leads flow FROM Bonzo INTO
                // Supabase via the n8n router / bonzo-sync — not back out. Callers should
                // use search_contact first and update_contact on the match, or skip the
                // enrichment entirely if no match exists.
                return jsonResponse({
                    error: 'create_contact is disabled — Carbon uses match-only writes. Search first and update the match, or skip if no match exists.',
                    skipped: true,
                    reason: 'match_only_policy',
                }, 405)
            }

            case 'search_contact': {
                // v3 uses GET /v3/prospects?search=<term> for filtering by email/phone/name
                // The `email` and `phone` params don't filter — only `search` does
                const params = new URLSearchParams()
                const searchTerm = payload?.email || payload?.phone || payload?.search || ''
                if (searchTerm) params.set('search', searchTerm)
                if (payload?.page) params.set('page', String(payload.page))
                params.set('per_page', String(payload?.per_page || 10))
                bonzoUrl = `${BONZO_API}/prospects?${params.toString()}`
                bonzoResp = await timedFetch(bonzoUrl, {
                    method: 'GET',
                    headers: bonzoHeaders,
                })
                break
            }

            case 'update_contact': {
                if (!contactId) return jsonResponse({ error: 'Missing contactId for update' }, 400)
                // PUT /v3/prospects/{prospect}
                bonzoUrl = `${BONZO_API}/prospects/${contactId}`
                bonzoResp = await timedFetch(bonzoUrl, {
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
                bonzoResp = await timedFetch(bonzoUrl, {
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
                bonzoResp = await timedFetch(bonzoUrl, {
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
                bonzoResp = await timedFetch(bonzoUrl, {
                    method: 'GET',
                    headers: bonzoHeaders,
                })
                break
            }

            case 'list_campaigns': {
                // GET /v3/campaigns
                bonzoUrl = `${BONZO_API}/campaigns`
                bonzoResp = await timedFetch(bonzoUrl, {
                    method: 'GET',
                    headers: bonzoHeaders,
                })
                break
            }

            case 'list_tags': {
                // GET /v3/tags
                bonzoUrl = `${BONZO_API}/tags`
                bonzoResp = await timedFetch(bonzoUrl, {
                    method: 'GET',
                    headers: bonzoHeaders,
                })
                break
            }

            case 'add_tag': {
                // POST /v3/prospects/{prospect}/tags
                const prospectId = body.prospectId || contactId
                if (!prospectId) return jsonResponse({ error: 'Missing prospectId for add_tag' }, 400)
                const tag = body.tag
                if (!tag) return jsonResponse({ error: 'Missing tag for add_tag' }, 400)
                bonzoUrl = `${BONZO_API}/prospects/${prospectId}/tags`
                bonzoResp = await timedFetch(bonzoUrl, {
                    method: 'POST',
                    headers: bonzoHeaders,
                    body: JSON.stringify({ name: tag }),
                })
                break
            }

            case 'list_pipelines': {
                // GET /v3/pipelines
                bonzoUrl = `${BONZO_API}/pipelines`
                bonzoResp = await timedFetch(bonzoUrl, {
                    method: 'GET',
                    headers: bonzoHeaders,
                })
                break
            }

            case 'get_pipeline': {
                // GET /v3/pipelines/fetch/{pipeline} — returns pipeline with stages
                const pipelineId = body.pipelineId
                if (!pipelineId) return jsonResponse({ error: 'Missing pipelineId' }, 400)
                bonzoUrl = `${BONZO_API}/pipelines/fetch/${pipelineId}`
                bonzoResp = await timedFetch(bonzoUrl, {
                    method: 'GET',
                    headers: bonzoHeaders,
                })
                break
            }

            case 'move_pipeline_stage': {
                // POST /v3/prospects/{prospect}/pipeline-stage/{pipelineStage}
                const prospId = body.prospectId || contactId
                const stageId = body.pipelineStageId
                if (!prospId) return jsonResponse({ error: 'Missing prospectId for move_pipeline_stage' }, 400)
                if (!stageId) return jsonResponse({ error: 'Missing pipelineStageId' }, 400)
                bonzoUrl = `${BONZO_API}/prospects/${prospId}/pipeline-stage/${stageId}`
                bonzoResp = await timedFetch(bonzoUrl, {
                    method: 'POST',
                    headers: bonzoHeaders,
                    body: JSON.stringify({}),
                })
                break
            }

            case 'move_to_campaign': {
                // POST /v3/prospects/{prospect}/campaign/{campaign}
                const prospectForCampaign = body.prospectId || contactId
                const campaignId = body.campaignId
                if (!prospectForCampaign) return jsonResponse({ error: 'Missing prospectId for move_to_campaign' }, 400)
                if (!campaignId) return jsonResponse({ error: 'Missing campaignId' }, 400)
                bonzoUrl = `${BONZO_API}/prospects/${prospectForCampaign}/campaign/${campaignId}`
                bonzoResp = await timedFetch(bonzoUrl, {
                    method: 'POST',
                    headers: bonzoHeaders,
                    body: JSON.stringify({}),
                })
                break
            }

            case 'list_custom_statuses': {
                // GET /v3/prospects/custom-status
                bonzoUrl = `${BONZO_API}/prospects/custom-status`
                bonzoResp = await timedFetch(bonzoUrl, {
                    method: 'GET',
                    headers: bonzoHeaders,
                })
                break
            }

            case 'set_custom_status': {
                // POST /v3/prospects/{prospect}/status
                const prospForStatus = body.prospectId || contactId
                if (!prospForStatus) return jsonResponse({ error: 'Missing prospectId for set_custom_status' }, 400)
                bonzoUrl = `${BONZO_API}/prospects/${prospForStatus}/status`
                bonzoResp = await timedFetch(bonzoUrl, {
                    method: 'POST',
                    headers: bonzoHeaders,
                    body: JSON.stringify(payload || { status: body.status }),
                })
                break
            }

            default:
                return jsonResponse({ error: 'Unknown action: ' + action }, 400)
        }

        // 5. Return Bonzo's response
        const bonzoText = await bonzoResp.text().catch(() => '')
        let bonzoData: any = {}
        try { bonzoData = JSON.parse(bonzoText) } catch { bonzoData = { raw: bonzoText.substring(0, 500) } }
        const bonzoStatus = bonzoResp.status

        if (!bonzoResp.ok) {
            const errMsg = bonzoData.message || bonzoData.error || bonzoData.raw || `Bonzo API returned ${bonzoStatus}`
            return jsonResponse({
                error: `Bonzo API error (${bonzoStatus}): ${errMsg}`,
                bonzo_status: bonzoStatus,
                data: bonzoData,
            }, 502)
        }

        return jsonResponse({
            success: true,
            status: bonzoStatus,
            data: bonzoData,
        })

    } catch (err) {
        if ((err as Error).name === 'AbortError') {
            return jsonResponse({ error: 'Upstream Bonzo service timed out' }, 504)
        }
        const message = err instanceof Error ? err.message : String(err)
        console.error('bonzo-proxy error:', message)
        return jsonResponse({ error: message }, 500)
    }
})
