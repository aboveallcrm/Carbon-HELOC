// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"
import { fetchWithRetry } from "../_shared/retry.ts"

// GoHighLevel API — version varies by endpoint group
const GHL_API = "https://services.leadconnectorhq.com"
const GHL_VERSION_CONTACTS = "2021-07-28"     // Contacts, Notes, Tasks, Workflows, Campaigns, Opportunities
const GHL_VERSION_CONVERSATIONS = "2021-04-15" // Conversations, Calendars, Voice AI
const GHL_FETCH_TIMEOUT_MS = 15_000

let corsHeaders: Record<string, string> = {}

function jsonResponse(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}

async function timedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const { response } = await fetchWithRetry(url, options, {
        timeoutMs: GHL_FETCH_TIMEOUT_MS,
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

        // 2. Get GHL API key and location ID from user_integrations
        const { data: integrations } = await supabaseAdmin
            .from('user_integrations')
            .select('provider, metadata')
            .eq('user_id', userId)
            .in('provider', ['heloc_keys', 'heloc_settings'])

        let ghlApiKey = ''
        let ghlLocationId = ''
        for (const row of (integrations || [])) {
            if (row.provider === 'heloc_keys') {
                ghlApiKey = row.metadata?.ghl_api_key || ghlApiKey
                ghlLocationId = row.metadata?.ghl_location_id || ghlLocationId
            }
            if (row.provider === 'heloc_settings') {
                ghlApiKey = row.metadata?.ghl?.apiKey || ghlApiKey
                ghlLocationId = row.metadata?.ghl?.locationId || ghlLocationId
            }
        }

        if (!ghlApiKey) {
            return jsonResponse({ error: 'No GHL API key configured. Go to Settings → Integrations → GHL.' }, 400)
        }

        // 3. Parse request
        const body = await req.json()
        const { action, payload, contactId, locationId: reqLocationId } = body

        // Use locationId from request body if provided, else from settings
        const locId = reqLocationId || ghlLocationId

        // Select correct API version based on action
        const conversationActions = ['send_email', 'send_sms']
        const apiVersion = conversationActions.includes(action)
            ? GHL_VERSION_CONVERSATIONS
            : GHL_VERSION_CONTACTS

        const ghlHeaders: Record<string, string> = {
            'Authorization': `Bearer ${ghlApiKey}`,
            'Version': apiVersion,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }

        // 4. Route to appropriate GHL API call
        let ghlResp: Response
        let ghlUrl: string

        switch (action) {
            case 'get_location': {
                if (!locId) return jsonResponse({ error: 'Missing locationId' }, 400)
                ghlUrl = `${GHL_API}/locations/${locId}`
                ghlResp = await timedFetch(ghlUrl, {
                    method: 'GET',
                    headers: ghlHeaders,
                })
                break
            }

            case 'search_contacts': {
                // POST /contacts/search (advanced search, replaces deprecated GET /contacts/)
                if (!locId) return jsonResponse({ error: 'Missing locationId' }, 400)
                const searchBody: any = { locationId: locId }
                // Support simple query string or advanced filters
                if (payload?.query || payload?.email || payload?.phone) {
                    searchBody.query = payload.query || payload.email || payload.phone
                }
                if (payload?.filters) searchBody.filters = payload.filters
                if (payload?.limit) searchBody.pageLimit = payload.limit
                if (payload?.searchAfter) searchBody.searchAfter = payload.searchAfter
                ghlUrl = `${GHL_API}/contacts/search`
                ghlResp = await timedFetch(ghlUrl, {
                    method: 'POST',
                    headers: ghlHeaders,
                    body: JSON.stringify(searchBody),
                })
                break
            }

            case 'create_contact': {
                if (!locId) return jsonResponse({ error: 'Missing locationId' }, 400)
                const contactPayload = { ...payload, locationId: locId }
                ghlUrl = `${GHL_API}/contacts/`
                ghlResp = await timedFetch(ghlUrl, {
                    method: 'POST',
                    headers: ghlHeaders,
                    body: JSON.stringify(contactPayload),
                })
                break
            }

            case 'update_contact': {
                if (!contactId) return jsonResponse({ error: 'Missing contactId for update' }, 400)
                ghlUrl = `${GHL_API}/contacts/${contactId}`
                ghlResp = await timedFetch(ghlUrl, {
                    method: 'PUT',
                    headers: ghlHeaders,
                    body: JSON.stringify(payload),
                })
                break
            }

            case 'upsert_contact': {
                // POST /contacts/upsert — atomic create-or-update, returns { contact, new: true/false }
                if (!locId) return jsonResponse({ error: 'Missing locationId' }, 400)
                ghlUrl = `${GHL_API}/contacts/upsert`
                ghlResp = await timedFetch(ghlUrl, {
                    method: 'POST',
                    headers: ghlHeaders,
                    body: JSON.stringify({ ...payload, locationId: locId }),
                })
                break
            }

            case 'add_tags': {
                if (!contactId) return jsonResponse({ error: 'Missing contactId for tags' }, 400)
                ghlUrl = `${GHL_API}/contacts/${contactId}/tags`
                ghlResp = await timedFetch(ghlUrl, {
                    method: 'POST',
                    headers: ghlHeaders,
                    body: JSON.stringify(payload),
                })
                break
            }

            case 'remove_tags': {
                // DELETE /contacts/{id}/tags with body { tags: [...] }
                if (!contactId) return jsonResponse({ error: 'Missing contactId for remove_tags' }, 400)
                ghlUrl = `${GHL_API}/contacts/${contactId}/tags`
                ghlResp = await timedFetch(ghlUrl, {
                    method: 'DELETE',
                    headers: ghlHeaders,
                    body: JSON.stringify(payload),
                })
                break
            }

            case 'add_note': {
                if (!contactId) return jsonResponse({ error: 'Missing contactId for note' }, 400)
                ghlUrl = `${GHL_API}/contacts/${contactId}/notes`
                ghlResp = await timedFetch(ghlUrl, {
                    method: 'POST',
                    headers: ghlHeaders,
                    body: JSON.stringify(payload),
                })
                break
            }

            case 'create_opportunity': {
                ghlUrl = `${GHL_API}/opportunities/`
                ghlResp = await timedFetch(ghlUrl, {
                    method: 'POST',
                    headers: ghlHeaders,
                    body: JSON.stringify(payload),
                })
                break
            }

            case 'update_opportunity': {
                if (!payload?.opportunityId) return jsonResponse({ error: 'Missing opportunityId for update_opportunity' }, 400)
                const oppId = payload.opportunityId
                const { opportunityId: _id, ...oppPayload } = payload
                ghlUrl = `${GHL_API}/opportunities/${oppId}`
                ghlResp = await timedFetch(ghlUrl, {
                    method: 'PUT',
                    headers: ghlHeaders,
                    body: JSON.stringify(oppPayload),
                })
                break
            }

            case 'create_task': {
                if (!contactId) return jsonResponse({ error: 'Missing contactId for task' }, 400)
                ghlUrl = `${GHL_API}/contacts/${contactId}/tasks`
                ghlResp = await timedFetch(ghlUrl, {
                    method: 'POST',
                    headers: ghlHeaders,
                    body: JSON.stringify(payload),
                })
                break
            }

            case 'send_email': {
                // POST /conversations/messages with type=Email (Version: 2021-04-15)
                if (!payload?.contactId && !contactId) return jsonResponse({ error: 'Missing contactId for send_email' }, 400)
                if (!payload?.html && !payload?.message) return jsonResponse({ error: 'Missing html or message body for send_email' }, 400)
                const emailPayload = { ...payload, type: 'Email', contactId: payload.contactId || contactId }
                // GHL expects `html` — remap `message` if caller used that field name
                if (emailPayload.message && !emailPayload.html) {
                    emailPayload.html = emailPayload.message
                    delete emailPayload.message
                }
                ghlUrl = `${GHL_API}/conversations/messages`
                ghlResp = await timedFetch(ghlUrl, {
                    method: 'POST',
                    headers: ghlHeaders,
                    body: JSON.stringify(emailPayload),
                })
                break
            }

            case 'send_sms': {
                // POST /conversations/messages with type=SMS (Version: 2021-04-15)
                if (!payload?.contactId && !contactId) return jsonResponse({ error: 'Missing contactId for send_sms' }, 400)
                if (!payload?.message && !payload?.body) return jsonResponse({ error: 'Missing message body for send_sms' }, 400)
                const smsPayload = { ...payload, type: 'SMS', contactId: payload.contactId || contactId }
                // GHL expects `body` for SMS — remap `message` if caller used that field name
                if (smsPayload.message && !smsPayload.body) {
                    smsPayload.body = smsPayload.message
                    delete smsPayload.message
                }
                ghlUrl = `${GHL_API}/conversations/messages`
                ghlResp = await timedFetch(ghlUrl, {
                    method: 'POST',
                    headers: ghlHeaders,
                    body: JSON.stringify(smsPayload),
                })
                break
            }

            default:
                return jsonResponse({ error: 'Unknown action: ' + action }, 400)
        }

        // 5. Return GHL's response
        const ghlData = await ghlResp.json().catch(() => ({}))
        const ghlStatus = ghlResp.status

        return jsonResponse({
            success: ghlResp.ok,
            status: ghlStatus,
            data: ghlData,
        }, ghlResp.ok ? 200 : 502)

    } catch (err) {
        if ((err as Error).name === 'AbortError') {
            return jsonResponse({ error: 'Upstream GHL service timed out' }, 504)
        }
        const message = err instanceof Error ? err.message : String(err)
        console.error('ghl-proxy error:', message)
        return jsonResponse({ error: message }, 500)
    }
})
