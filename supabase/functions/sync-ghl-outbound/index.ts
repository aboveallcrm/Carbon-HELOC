// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"
import { fetchWithRetry } from "../_shared/retry.ts"

// GoHighLevel API — version varies by endpoint group
const GHL_API = "https://services.leadconnectorhq.com"
const GHL_VERSION_CONTACTS = "2021-07-28"      // Contacts, Notes, Tasks, Opportunities
const GHL_VERSION_CONVERSATIONS = "2021-04-15"  // Conversations (send SMS/email)
const GHL_FETCH_TIMEOUT_MS = 15_000
const BATCH_LIMIT = 10

let corsHeaders: Record<string, string> = {}

function jsonResponse(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}

async function recordSyncError(
    supabaseAdmin: any,
    userId: string,
    provider: string,
    context: string,
    errorMessage: string,
    payload: Record<string, any> = {},
) {
    try {
        await supabaseAdmin.from('sync_errors').insert({
            user_id: userId,
            provider,
            context,
            error_message: errorMessage,
            payload,
        })
    } catch (err) {
        console.error('Failed to record sync error:', err)
    }
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

    let userId = ''

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

        userId = user.id

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

        // Contacts/Tasks/Opportunities use 2021-07-28; Conversations use 2021-04-15
        const ghlHeaders: Record<string, string> = {
            'Authorization': `Bearer ${ghlApiKey}`,
            'Version': GHL_VERSION_CONTACTS,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }
        const ghlConvHeaders: Record<string, string> = {
            ...ghlHeaders,
            'Version': GHL_VERSION_CONVERSATIONS,
        }

        // 3. Parse request body for optional filters
        const body = await req.json().catch(() => ({}))
        const { action } = body

        // action = 'process_queue' (default) | 'sync_lead'
        if (action === 'sync_lead') {
            // One-off sync: push a single lead to GHL
            return await syncSingleLead(supabaseAdmin, ghlHeaders, ghlLocationId, body, userId)
        }

        // 4. Fetch pending outbound_queue items for GHL
        const { data: queueItems, error: fetchError } = await supabaseAdmin
            .from('outbound_queue')
            .select('*, lead:lead_id(id, first_name, last_name, email, phone, status, stage, metadata)')
            .eq('provider', 'ghl')
            .in('status', ['pending', 'retrying'])
            .order('priority', { ascending: true })
            .order('scheduled_at', { ascending: true })
            .limit(BATCH_LIMIT)

        if (fetchError) {
            return jsonResponse({ error: 'Failed to fetch queue: ' + fetchError.message }, 500)
        }

        if (!queueItems || queueItems.length === 0) {
            return jsonResponse({ success: true, processed: 0, message: 'No pending items' })
        }

        // 5. Process each queue item
        const results: any[] = []

        for (const item of queueItems) {
            // Mark as dispatching
            await supabaseAdmin
                .from('outbound_queue')
                .update({ status: 'dispatching', updated_at: new Date().toISOString() })
                .eq('id', item.id)

            try {
                const result = await dispatchToGHL(ghlHeaders, ghlConvHeaders, ghlLocationId, item)

                // Mark as dispatched
                await supabaseAdmin
                    .from('outbound_queue')
                    .update({
                        status: 'dispatched',
                        dispatched_at: new Date().toISOString(),
                        dispatch_result: result,
                        error_message: null,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', item.id)

                results.push({ id: item.id, channel: item.channel, success: true })

            } catch (err) {
                const message = err instanceof Error ? err.message : String(err)
                const newRetry = (item.retry_count || 0) + 1
                const maxRetries = item.max_retries || 3

                await supabaseAdmin
                    .from('outbound_queue')
                    .update({
                        status: newRetry >= maxRetries ? 'failed' : 'retrying',
                        retry_count: newRetry,
                        error_message: message,
                        failed_at: newRetry >= maxRetries ? new Date().toISOString() : null,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', item.id)

                await recordSyncError(supabaseAdmin, userId, 'ghl', 'outbound_queue_dispatch', message, {
                    queue_id: item.id,
                    channel: item.channel,
                    retry_count: newRetry,
                    max_retries: maxRetries,
                })

                results.push({ id: item.id, channel: item.channel, success: false, error: message })
            }
        }

        return jsonResponse({
            success: true,
            processed: results.length,
            succeeded: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length,
            results,
        })

    } catch (err) {
        if ((err as Error).name === 'AbortError') {
            return jsonResponse({ error: 'Upstream GHL service timed out' }, 504)
        }
        const message = err instanceof Error ? err.message : String(err)
        console.error('sync-ghl-outbound error:', message)
        if (userId) {
            const supabaseAdmin = createClient(
                Deno.env.get('SUPABASE_URL') ?? '',
                Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
            )
            await recordSyncError(supabaseAdmin, userId, 'ghl', 'sync_ghl_outbound', message)
        }
        return jsonResponse({ error: message }, 500)
    }
})

/**
 * Dispatch a single outbound_queue item to GHL
 */
async function dispatchToGHL(
    ghlHeaders: Record<string, string>,
    ghlConvHeaders: Record<string, string>,
    locationId: string,
    item: any
): Promise<any> {
    const lead = item.lead
    const channel = item.channel // 'sms' | 'email'

    // MATCH-ONLY policy (Addendum 6, 2026-04-13): never create a new GHL contact.
    // Use an existing contact ID if we have one; otherwise search by email/phone.
    // If nothing matches, fail hard — do NOT upsert. Carbon's contract is that leads
    // flow FROM GHL INTO Supabase, not back out.
    let ghlContactId = item.metadata?.ghl_contact_id || ''
    const leadKnownGhlId = lead?.metadata?.ghl_contact_id || lead?.crm_contact_id || ''
    if (!ghlContactId && leadKnownGhlId) ghlContactId = leadKnownGhlId

    if (!ghlContactId && lead) {
        async function searchContactsGHL(query: string) {
            const resp = await timedFetch(`${GHL_API}/contacts/search`, {
                method: 'POST',
                headers: ghlHeaders,
                body: JSON.stringify({ locationId, query, pageLimit: 1 }),
            })
            if (!resp.ok) return null
            const data = await resp.json().catch(() => ({}))
            const contacts = data?.contacts || data?.data || []
            return Array.isArray(contacts) && contacts[0] ? contacts[0] : null
        }

        if (lead.email) {
            const hit = await searchContactsGHL(lead.email)
            if (hit?.id && hit.email && String(hit.email).toLowerCase() === String(lead.email).toLowerCase()) {
                ghlContactId = hit.id
            }
        }
        if (!ghlContactId && lead.phone) {
            const phoneDigits = String(lead.phone).replace(/\D/g, '')
            if (phoneDigits.length >= 7) {
                const hit = await searchContactsGHL(phoneDigits)
                if (hit?.id) ghlContactId = hit.id
            }
        }
    }

    if (!ghlContactId) {
        throw new Error('skipped_no_match: Lead not found in GHL. Match-only policy — Carbon never creates new GHL contacts. Add the contact to GHL first if you want enrichment.')
    }

    // Send message via GHL conversations API
    const messagePayload: any = {
        type: channel === 'email' ? 'Email' : 'SMS',
        contactId: ghlContactId,
    }

    if (channel === 'email') {
        messagePayload.subject = item.subject || 'Your HELOC Quote'
        messagePayload.html = item.content || ''
    } else {
        messagePayload.body = item.content || ''
    }

    const msgResp = await timedFetch(`${GHL_API}/conversations/messages`, {
        method: 'POST',
        headers: ghlConvHeaders,
        body: JSON.stringify(messagePayload),
    })

    const msgData = await msgResp.json().catch(() => ({}))

    if (!msgResp.ok) {
        throw new Error(`GHL send ${channel} failed (${msgResp.status}): ${JSON.stringify(msgData)}`)
    }

    return {
        ghl_contact_id: ghlContactId,
        ghl_message_id: msgData.messageId || msgData.id,
        channel,
        status: msgResp.status,
    }
}

/**
 * One-off sync: push a single lead's data to GHL as a contact
 */
async function syncSingleLead(
    supabaseAdmin: any,
    ghlHeaders: Record<string, string>,
    locationId: string,
    body: any,
    userId: string
): Promise<Response> {
    const { leadId } = body

    if (!leadId) {
        return jsonResponse({ error: 'Missing leadId for sync_lead action' }, 400)
    }
    if (!locationId) {
        return jsonResponse({ error: 'Missing GHL locationId. Configure in Settings → Integrations → GHL.' }, 400)
    }

    // Fetch lead
    const { data: lead, error: leadErr } = await supabaseAdmin
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .eq('user_id', userId)
        .limit(1)
        .single()

    if (leadErr || !lead) {
        return jsonResponse({ error: 'Lead not found' }, 404)
    }

    // MATCH-ONLY policy (Addendum 6 hardened, 2026-04-13):
    // Carbon NEVER creates a new GHL contact. Period. Leads flow FROM GHL INTO Supabase
    // via the n8n router — not back out. This endpoint enriches existing GHL contacts
    // only (tags). If no match exists, fail hard with skipped_no_match.
    const knownGhlContactId = lead.metadata?.ghl_contact_id || lead.crm_contact_id || ''
    let ghlContactId = knownGhlContactId

    // If we don't have a known contact ID, search GHL by email then phone
    if (!ghlContactId) {
        async function searchContactsGHL(query: string) {
            const resp = await timedFetch(`${GHL_API}/contacts/search`, {
                method: 'POST',
                headers: ghlHeaders,
                body: JSON.stringify({ locationId, query, pageLimit: 1 }),
            })
            if (!resp.ok) return null
            const data = await resp.json().catch(() => ({}))
            const contacts = data?.contacts || data?.data || []
            return Array.isArray(contacts) && contacts[0] ? contacts[0] : null
        }

        if (lead.email) {
            const hit = await searchContactsGHL(lead.email)
            if (hit?.id && hit.email && String(hit.email).toLowerCase() === String(lead.email).toLowerCase()) {
                ghlContactId = hit.id
            }
        }
        if (!ghlContactId && lead.phone) {
            const phoneDigits = String(lead.phone).replace(/\D/g, '')
            if (phoneDigits.length >= 7) {
                const hit = await searchContactsGHL(phoneDigits)
                if (hit?.id) ghlContactId = hit.id
            }
        }
    }

    if (!ghlContactId) {
        // No match — do NOT create. Return skipped status so caller knows to prompt
        // the LO to add the contact in GHL first.
        return jsonResponse({
            success: true,
            skipped: true,
            reason: 'no_match',
            detail: 'Lead not found in GHL. Match-only policy — Carbon never creates new GHL contacts. Add the contact to GHL first if you want enrichment.',
        })
    }

    // Matched — enrich by adding the carbon-heloc tag (won't overwrite existing tags)
    try {
        await timedFetch(`${GHL_API}/contacts/${ghlContactId}/tags`, {
            method: 'POST',
            headers: ghlHeaders,
            body: JSON.stringify({ tags: ['carbon-heloc'] }),
        })
    } catch (_tagErr) {
        console.warn('Failed to add tags to GHL contact:', ghlContactId)
    }

    // Store matched GHL contact ID back on lead metadata for faster future lookups
    if (ghlContactId && ghlContactId !== knownGhlContactId) {
        const existingMeta = lead.metadata || {}
        await supabaseAdmin
            .from('leads')
            .update({ metadata: { ...existingMeta, ghl_contact_id: ghlContactId } })
            .eq('id', leadId)
    }

    return jsonResponse({
        success: true,
        operation: 'enrich',
        ghl_contact_id: ghlContactId,
        matched: true,
    })
}
