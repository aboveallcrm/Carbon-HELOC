// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"

// GoHighLevel API v2021-07-28 (matches ghl-proxy)
const GHL_API = "https://services.leadconnectorhq.com"
const GHL_VERSION = "2021-07-28"
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
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), GHL_FETCH_TIMEOUT_MS)
    try {
        const resp = await fetch(url, { ...options, signal: controller.signal })
        clearTimeout(timeout)
        return resp
    } catch (err) {
        clearTimeout(timeout)
        throw err
    }
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

        const ghlHeaders: Record<string, string> = {
            'Authorization': `Bearer ${ghlApiKey}`,
            'Version': GHL_VERSION,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
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
                const result = await dispatchToGHL(ghlHeaders, ghlLocationId, item)

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
    locationId: string,
    item: any
): Promise<any> {
    const lead = item.lead
    const channel = item.channel // 'sms' | 'email'

    // If we have a contact_id, use it directly as GHL contact ID
    // Otherwise search by email/phone
    let ghlContactId = item.metadata?.ghl_contact_id || ''

    if (!ghlContactId && lead) {
        // Search for existing GHL contact
        const searchParams = new URLSearchParams()
        searchParams.set('locationId', locationId)
        if (lead.email) searchParams.set('query', lead.email)
        else if (lead.phone) searchParams.set('query', lead.phone)

        const searchResp = await timedFetch(
            `${GHL_API}/contacts/?${searchParams.toString()}`,
            { method: 'GET', headers: ghlHeaders }
        )

        if (searchResp.ok) {
            const searchData = await searchResp.json()
            const contacts = searchData.contacts || []
            if (contacts.length > 0) {
                ghlContactId = contacts[0].id
            }
        }

        // If no contact found, create one
        if (!ghlContactId && lead) {
            const createResp = await timedFetch(`${GHL_API}/contacts/`, {
                method: 'POST',
                headers: ghlHeaders,
                body: JSON.stringify({
                    locationId,
                    firstName: lead.first_name || '',
                    lastName: lead.last_name || '',
                    email: lead.email || '',
                    phone: lead.phone || '',
                }),
            })

            if (createResp.ok) {
                const createData = await createResp.json()
                ghlContactId = createData.contact?.id || ''
            } else {
                const errText = await createResp.text()
                throw new Error(`GHL create contact failed (${createResp.status}): ${errText}`)
            }
        }
    }

    if (!ghlContactId) {
        throw new Error('Could not resolve GHL contact ID')
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
        headers: ghlHeaders,
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

    // Search for existing GHL contact by email or phone
    let ghlContactId = lead.metadata?.ghl_contact_id || ''
    let operation = 'create'

    if (!ghlContactId) {
        const searchParams = new URLSearchParams()
        searchParams.set('locationId', locationId)
        if (lead.email) searchParams.set('query', lead.email)
        else if (lead.phone) searchParams.set('query', lead.phone)

        const searchResp = await timedFetch(
            `${GHL_API}/contacts/?${searchParams.toString()}`,
            { method: 'GET', headers: ghlHeaders }
        )

        if (searchResp.ok) {
            const searchData = await searchResp.json()
            const contacts = searchData.contacts || []
            if (contacts.length > 0) {
                ghlContactId = contacts[0].id
                operation = 'update'
            }
        }
    } else {
        operation = 'update'
    }

    // Build contact payload
    const contactPayload: any = {
        firstName: lead.first_name || '',
        lastName: lead.last_name || '',
        email: lead.email || '',
        phone: lead.phone || '',
        tags: ['carbon-heloc'],
    }

    // Add metadata fields as custom fields if available
    if (lead.metadata) {
        const customFields: any[] = []
        if (lead.metadata.credit_score) customFields.push({ key: 'credit_score', field_value: String(lead.metadata.credit_score) })
        if (lead.metadata.home_value) customFields.push({ key: 'home_value', field_value: String(lead.metadata.home_value) })
        if (lead.metadata.mortgage_balance) customFields.push({ key: 'mortgage_balance', field_value: String(lead.metadata.mortgage_balance) })
        if (lead.metadata.loan_amount) customFields.push({ key: 'loan_amount', field_value: String(lead.metadata.loan_amount) })
        if (customFields.length > 0) contactPayload.customFields = customFields
    }

    let ghlResp: Response
    if (operation === 'update' && ghlContactId) {
        ghlResp = await timedFetch(`${GHL_API}/contacts/${ghlContactId}`, {
            method: 'PUT',
            headers: ghlHeaders,
            body: JSON.stringify(contactPayload),
        })
    } else {
        contactPayload.locationId = locationId
        ghlResp = await timedFetch(`${GHL_API}/contacts/`, {
            method: 'POST',
            headers: ghlHeaders,
            body: JSON.stringify(contactPayload),
        })
    }

    const ghlData = await ghlResp.json().catch(() => ({}))

    if (!ghlResp.ok) {
        await recordSyncError(supabaseAdmin, userId, 'ghl', `sync_single_lead_${operation}`, `GHL ${operation} failed (${ghlResp.status})`, {
            lead_id: leadId,
            detail: ghlData,
        })
        return jsonResponse({
            error: `GHL ${operation} failed`,
            status: ghlResp.status,
            detail: ghlData,
        }, 502)
    }

    // Store GHL contact ID back on lead metadata
    const newContactId = ghlData.contact?.id || ghlContactId
    if (newContactId) {
        const existingMeta = lead.metadata || {}
        await supabaseAdmin
            .from('leads')
            .update({ metadata: { ...existingMeta, ghl_contact_id: newContactId } })
            .eq('id', leadId)
    }

    return jsonResponse({
        success: true,
        operation,
        ghl_contact_id: newContactId,
        data: ghlData,
    })
}
