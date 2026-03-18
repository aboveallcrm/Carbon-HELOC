// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"

// Bonzo API v3 — production base URL (api.getbonzo.com does NOT exist)
const BONZO_API = "https://app.getbonzo.com/api/v3"

const BONZO_FETCH_TIMEOUT_MS = 15_000
const MAX_CONTACTS = 2_000

// corsHeaders is set per-request in the serve handler
let corsHeaders: Record<string, string> = {}

function jsonResp(body: any, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
}

// Helper: fetch with AbortController timeout
async function timedFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), BONZO_FETCH_TIMEOUT_MS)
    try {
        const resp = await fetch(url, { ...options, signal: controller.signal })
        clearTimeout(timeout)
        return resp
    } catch (err) {
        clearTimeout(timeout)
        throw err
    }
}

// Extract array of prospects from any Bonzo response shape
function extractProspects(responseData: any): any[] {
    if (!responseData) return []
    // Laravel-style paginated: { data: [...] }
    if (Array.isArray(responseData.data)) return responseData.data
    // Keyed as prospects
    if (Array.isArray(responseData.prospects)) return responseData.prospects
    // Keyed as contacts (legacy)
    if (Array.isArray(responseData.contacts)) return responseData.contacts
    // Direct array
    if (Array.isArray(responseData)) return responseData
    // Single object wrapped
    if (responseData.data && typeof responseData.data === 'object' && !Array.isArray(responseData.data)) {
        // Could be { data: { prospects: [...] } }
        if (Array.isArray(responseData.data.prospects)) return responseData.data.prospects
        if (Array.isArray(responseData.data.data)) return responseData.data.data
        // Single prospect in data
        return [responseData.data]
    }
    return []
}

// Extract pagination info from any Bonzo response shape
function extractPagination(responseData: any): { lastPage: number; total: number } {
    // Laravel-style: { meta: { last_page, total }, links: { next } }
    const meta = responseData?.meta || {}
    const lastPage = meta.last_page || responseData?.last_page || responseData?.total_pages || 0
    const total = meta.total || responseData?.total || 0
    return { lastPage, total }
}

// Build custom fields map — handles both array [{key,value}] and flat object {key: value}
function buildCustomMap(contact: any): Record<string, string> {
    const map: Record<string, string> = {}
    // Array format: [{key: 'credit_score', value: '740'}]
    const customArr = contact.custom || contact.custom_fields || contact.customFields || []
    if (Array.isArray(customArr)) {
        for (const cf of customArr) {
            if (cf && cf.key) map[cf.key] = String(cf.value || '')
            if (cf && cf.name) map[cf.name] = String(cf.value || '')
        }
    }
    // Flat object format: { custom: { credit_score: '740' } } or { custom_fields: { ... } }
    if (customArr && typeof customArr === 'object' && !Array.isArray(customArr)) {
        for (const [k, v] of Object.entries(customArr)) {
            map[k] = String(v || '')
        }
    }
    return map
}

// Extract a field trying multiple paths
function pick(contact: any, mortgage: any, customMap: Record<string, string>, ...keys: string[]): string {
    for (const k of keys) {
        if (contact[k]) return String(contact[k])
        if (mortgage[k]) return String(mortgage[k])
        if (customMap[k]) return customMap[k]
    }
    return ''
}

serve(async (req: Request) => {
    corsHeaders = getCorsHeaders(req)

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders })
    }
    if (req.method !== 'POST') {
        return jsonResp({ error: 'Method not allowed' }, 405)
    }

    const logs: string[] = []

    try {
        // 1. Authenticate caller via JWT
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) return jsonResp({ error: 'Missing authorization header' }, 401)

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (authError || !user) return jsonResp({ error: 'Invalid or expired token' }, 401)

        const userId = user.id

        // 2. Get the user's Bonzo API key — check both storage providers
        const { data: integrations } = await supabaseAdmin
            .from('user_integrations')
            .select('provider, metadata')
            .eq('user_id', userId)
            .in('provider', ['heloc_keys', 'heloc_settings'])

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
            return jsonResp({ error: 'No Bonzo API key configured. Go to Settings → Integrations → Bonzo and enter your API key.' }, 400)
        }

        logs.push('API key found')

        // 3. Parse request body for optional filters
        const body = await req.json().catch(() => ({}))
        const syncAll = body.sync_all === true
        const maxLeads = body.max_leads || (syncAll ? 999999 : 100)
        const perPage = 100

        // 4. Fetch prospects from Bonzo API v3
        const bonzoHeaders: Record<string, string> = {
            'Authorization': `Bearer ${bonzoApiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }

        let contacts: any[] = []
        let bonzoError = null
        let currentPage = 1
        let hasMore = true
        let rawResponseKeys = ''
        let paginationInfo = ''

        while (hasMore && contacts.length < maxLeads && contacts.length < MAX_CONTACTS) {
            const listUrl = `${BONZO_API}/prospects?page=${currentPage}&per_page=${perPage}`
            logs.push(`Fetching: ${listUrl}`)

            let listResp: Response
            try {
                listResp = await timedFetch(listUrl, { method: 'GET', headers: bonzoHeaders })
            } catch (fetchErr) {
                if ((fetchErr as Error).name === 'AbortError') {
                    logs.push(`WARN: Page ${currentPage} timed out after ${BONZO_FETCH_TIMEOUT_MS}ms`)
                    bonzoError = 'Bonzo API timed out'
                    break
                }
                throw fetchErr
            }

            if (!listResp.ok) {
                const errText = await listResp.text().catch(() => '')
                let errDetail = ''
                try { errDetail = JSON.parse(errText)?.message || JSON.parse(errText)?.error || '' } catch {}
                bonzoError = `Bonzo API ${listResp.status}${errDetail ? ': ' + errDetail : ''}`
                logs.push(`ERROR: ${bonzoError}`)
                logs.push(`Response: ${errText.substring(0, 300)}`)
                break
            }

            const listData = await listResp.json()

            // Log the response shape on first page for debugging
            if (currentPage === 1) {
                rawResponseKeys = Object.keys(listData || {}).join(', ')
                logs.push(`Response keys: ${rawResponseKeys}`)
                // Log sample of first item if present
                const sample = extractProspects(listData)[0]
                if (sample) {
                    logs.push(`Sample prospect keys: ${Object.keys(sample).join(', ')}`)
                    logs.push(`Sample name: ${sample.first_name || sample.firstName || sample.fname || '(none)'} ${sample.last_name || sample.lastName || ''}`)
                    logs.push(`Sample email: ${sample.email || sample.emailAddress || '(none)'}`)
                    logs.push(`Sample phone: ${sample.phone || sample.phoneNumber || sample.mobile || '(none)'}`)
                }
            }

            const pageContacts = extractProspects(listData)
            logs.push(`Page ${currentPage}: ${pageContacts.length} prospects`)

            if (pageContacts.length === 0) {
                // If first page returns 0, log the full response for debugging
                if (currentPage === 1) {
                    logs.push(`WARN: 0 prospects on page 1. Response keys: ${Object.keys(listData || {}).join(', ')}`)
                }
                hasMore = false
                break
            }

            contacts = contacts.concat(pageContacts)

            // Check pagination
            const pg = extractPagination(listData)
            paginationInfo = `lastPage=${pg.lastPage}, total=${pg.total}`

            // Determine if there are more pages
            if (pg.lastPage > 0 && currentPage >= pg.lastPage) {
                hasMore = false
            } else if (pageContacts.length < perPage) {
                hasMore = false
            } else if (pg.lastPage === 0 && !listData?.links?.next) {
                // No pagination info and no next link — check if we got a full page
                // If full page, assume there might be more
                hasMore = pageContacts.length >= perPage
            }

            currentPage++

            // Safety valve: max 20 pages or MAX_CONTACTS
            if (currentPage > 20) {
                logs.push('WARN: Hit 20-page safety limit')
                hasMore = false
            }
            if (contacts.length >= MAX_CONTACTS) {
                logs.push(`WARN: Hit MAX_CONTACTS limit (${MAX_CONTACTS})`)
                hasMore = false
            }
        }

        logs.push(`Total fetched from Bonzo: ${contacts.length} (${currentPage - 1} pages)`)

        if (contacts.length > maxLeads) {
            contacts = contacts.slice(0, maxLeads)
        }
        if (contacts.length > MAX_CONTACTS) {
            contacts = contacts.slice(0, MAX_CONTACTS)
            logs.push(`Trimmed to MAX_CONTACTS (${MAX_CONTACTS})`)
        }

        if (bonzoError && contacts.length === 0) {
            return jsonResp({ error: bonzoError, logs }, 502)
        }

        // 5. Pre-fetch all existing leads for in-memory dedup (avoids N+1 queries)
        const { data: existingLeads } = await supabaseAdmin
            .from('leads')
            .select('id, first_name, last_name, email, phone, crm_contact_id, metadata')
            .eq('user_id', userId)

        // Build lookup indexes
        const emailIndex = new Map<string, any>()
        const phoneIndex = new Map<string, any>()
        const bonzoIdIndex = new Map<string, any>()
        for (const lead of (existingLeads || [])) {
            if (lead.email) emailIndex.set(lead.email.toLowerCase().trim(), lead)
            const digits = (lead.phone || '').replace(/\D/g, '')
            if (digits.length >= 7) phoneIndex.set(digits, lead)
            if (lead.crm_contact_id) bonzoIdIndex.set(String(lead.crm_contact_id), lead)
        }
        logs.push(`Pre-fetched ${(existingLeads || []).length} existing leads for dedup`)

        let imported = 0
        let updated = 0
        let skipped = 0
        const errors: string[] = []
        const skipReasons: Record<string, number> = {}

        for (const contact of contacts) {
            try {
                const firstName = contact.first_name || contact.firstName || contact.fname || contact.name?.split(' ')[0] || ''
                const lastName = contact.last_name || contact.lastName || contact.lname || contact.name?.split(' ').slice(1).join(' ') || ''
                const email = (contact.email || contact.emailAddress || contact.email_address || '').toLowerCase().trim()
                const phone = contact.phone || contact.phoneNumber || contact.phone_number || contact.mobile || contact.homephone || contact.cell || ''
                const bonzoId = contact.id || contact.prospect_id || contact.contact_id || null

                const mortgage = contact.mortgage || {}
                const customMap = buildCustomMap(contact)

                const creditScore = pick(contact, mortgage, customMap, 'credit_score', 'creditScore', 'heloc_credit_score', 'Credit Score', 'credit_rating')
                const propertyValue = pick(contact, mortgage, customMap, 'property_value', 'home_value', 'homeValue', 'heloc_home_value')
                const propertyAddress = contact.property_address || contact.address || mortgage.property_address
                    || (contact.street ? [contact.street, contact.city, contact.state, contact.zip].filter(Boolean).join(', ') : '') || ''
                const mortgageBalance = pick(contact, mortgage, customMap, 'mortgage_balance', 'loan_amount', 'heloc_mortgage_balance', 'Mortgage Balance', 'current_balance')
                const cashOutAmount = pick(contact, mortgage, customMap, 'cash_out_amount', 'cash_out', 'cashOut', 'heloc_cash_back', 'cash_needed')
                const loanType = pick(contact, mortgage, customMap, 'loan_type', 'loanType')
                const propertyType = pick(contact, mortgage, customMap, 'property_type', 'propertyType')

                // Only skip if absolutely no identifying info at all
                if (!email && !phone && !firstName && !lastName) {
                    const reason = 'no_identity'
                    skipReasons[reason] = (skipReasons[reason] || 0) + 1
                    skipped++
                    continue
                }

                // In-memory dedup: email → phone → bonzo ID
                const normalizedPhone = (phone || '').replace(/\D/g, '')
                let existingLead = null

                if (email) existingLead = emailIndex.get(email) || null
                if (!existingLead && normalizedPhone && normalizedPhone.length >= 7) {
                    existingLead = phoneIndex.get(normalizedPhone) || null
                }
                if (!existingLead && bonzoId) {
                    existingLead = bonzoIdIndex.get(String(bonzoId)) || null
                }

                if (existingLead) {
                    const updates: Record<string, any> = {}
                    if (!existingLead.first_name && firstName) updates.first_name = firstName
                    if (!existingLead.last_name && lastName) updates.last_name = lastName
                    if (!existingLead.email && email) updates.email = email
                    if (!existingLead.phone && phone) updates.phone = phone
                    if (bonzoId && !existingLead.metadata?.bonzo_contact_id) {
                        updates.crm_contact_id = String(bonzoId)
                    }

                    const existingMeta = existingLead.metadata || {}
                    updates.metadata = {
                        ...existingMeta,
                        bonzo_contact_id: bonzoId || existingMeta.bonzo_contact_id,
                        last_bonzo_sync: new Date().toISOString(),
                        // Use new value if existing is empty/falsy
                        credit_score: existingMeta.credit_score || creditScore || '',
                        property_address: existingMeta.property_address || propertyAddress || '',
                        home_value: existingMeta.home_value || propertyValue || '',
                        mortgage_balance: existingMeta.mortgage_balance || mortgageBalance || '',
                        cash_out: existingMeta.cash_out || cashOutAmount || '',
                        loan_type: existingMeta.loan_type || loanType || '',
                        property_type: existingMeta.property_type || propertyType || '',
                    }

                    await supabaseAdmin
                        .from('leads')
                        .update(updates)
                        .eq('id', existingLead.id)

                    updated++
                } else {
                    const { error: insertErr } = await supabaseAdmin
                        .from('leads')
                        .insert({
                            user_id: userId,
                            first_name: firstName,
                            last_name: lastName,
                            email: email || null,
                            phone: phone || null,
                            source: 'bonzo',
                            crm_source: 'bonzo',
                            crm_contact_id: bonzoId ? String(bonzoId) : null,
                            status: 'new',
                            metadata: {
                                bonzo_contact_id: bonzoId,
                                synced_at: new Date().toISOString(),
                                credit_score: creditScore,
                                property_address: propertyAddress,
                                home_value: propertyValue,
                                mortgage_balance: mortgageBalance,
                                cash_out: cashOutAmount,
                                loan_type: loanType,
                                property_type: propertyType,
                            }
                        })

                    if (insertErr) {
                        errors.push(`${firstName} ${lastName} (${email || phone || bonzoId}): ${insertErr.message}`)
                    } else {
                        imported++
                    }
                }
            } catch (contactErr) {
                errors.push(`Processing error: ${contactErr instanceof Error ? contactErr.message : String(contactErr)}`)
            }
        }

        return jsonResp({
            success: true,
            imported,
            updated,
            skipped,
            total_from_bonzo: contacts.length,
            pages_fetched: currentPage - 1,
            pagination: paginationInfo,
            response_keys: rawResponseKeys,
            skip_reasons: Object.keys(skipReasons).length > 0 ? skipReasons : undefined,
            errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
            logs: logs,
        })

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('bonzo-sync error:', message, logs)
        return jsonResp({ error: 'Sync failed. Please try again.' }, 500)
    }
})
