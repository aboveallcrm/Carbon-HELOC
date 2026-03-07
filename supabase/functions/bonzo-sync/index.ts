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

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders })
    }
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    try {
        // 1. Authenticate caller via JWT
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing authorization header' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Invalid or expired token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        const userId = user.id

        // 2. Get the user's Bonzo API key — check both storage providers
        const { data: integrations } = await supabaseAdmin
            .from('user_integrations')
            .select('provider, metadata')
            .eq('user_id', userId)
            .in('provider', ['heloc_keys', 'heloc_settings'])

        // Prefer JWT API key (apiKey2) over Xcode hash (apiKey)
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
            return new Response(JSON.stringify({ error: 'No Bonzo API key configured. Go to Settings → Integrations → Bonzo and enter your API key.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // 3. Parse request body for optional filters
        const body = await req.json().catch(() => ({}))
        const syncAll = body.sync_all === true
        const maxLeads = body.max_leads || (syncAll ? 999999 : 100)
        const perPage = 100 // Bonzo API max per page

        // 4. Fetch prospects from Bonzo API v3
        // In v3, contacts are called "prospects": GET /v3/prospects
        const bonzoHeaders: Record<string, string> = {
            'Authorization': `Bearer ${bonzoApiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        }

        let contacts: any[] = []
        let bonzoError = null
        let currentPage = 1
        let hasMore = true

        // Auto-paginate: fetch pages until we have enough or run out
        while (hasMore && contacts.length < maxLeads) {
            const listUrl = `${BONZO_API}/prospects?page=${currentPage}&per_page=${perPage}`
            const listResp = await fetch(listUrl, {
                method: 'GET',
                headers: bonzoHeaders,
            })

            if (!listResp.ok) {
                const errText = await listResp.text().catch(() => '')
                bonzoError = `Bonzo API returned ${listResp.status}: ${errText.substring(0, 300)}`
                break
            }

            const listData = await listResp.json()
            let pageContacts = listData.data || listData.prospects || listData || []
            if (!Array.isArray(pageContacts)) pageContacts = [pageContacts]

            contacts = contacts.concat(pageContacts)

            // Check if there are more pages (v3 returns meta.last_page or links.next)
            const lastPage = listData.meta?.last_page || listData.last_page || 1
            if (currentPage >= lastPage || pageContacts.length < perPage) {
                hasMore = false
            } else {
                currentPage++
            }
        }

        // Trim to maxLeads if needed
        if (contacts.length > maxLeads) {
            contacts = contacts.slice(0, maxLeads)
        }

        if (bonzoError && contacts.length === 0) {
            return new Response(JSON.stringify({ error: bonzoError }),
                { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // 5. For each prospect, insert or update in leads table (same dedup logic as bonzo-webhook)
        let imported = 0
        let updated = 0
        let skipped = 0
        const errors: string[] = []

        for (const contact of contacts) {
            try {
                const firstName = contact.first_name || contact.firstName || contact.fname || ''
                const lastName = contact.last_name || contact.lastName || contact.lname || ''
                const email = (contact.email || contact.emailAddress || '').toLowerCase().trim()
                const phone = contact.phone || contact.phoneNumber || contact.mobile || ''
                const bonzoId = contact.id || contact.contact_id || null

                // Bonzo v3 may nest mortgage data under contact.mortgage or keep flat
                const mortgage = contact.mortgage || {}
                // Also check custom fields array — Bonzo returns [{key, value}] or {key: value}
                const customArr = Array.isArray(contact.custom) ? contact.custom : []
                const customMap: Record<string, string> = {}
                for (const cf of customArr) {
                    if (cf && cf.key) customMap[cf.key] = cf.value || ''
                }

                // Credit score: check mortgage data, top-level, custom fields
                const creditScore = contact.credit_score || mortgage.credit_score
                    || customMap['credit_score'] || customMap['heloc_credit_score']
                    || customMap['Credit Score'] || customMap['credit_rating']
                    || contact.credit_rating || ''

                // Property/loan fields from mortgage data or top-level
                const propertyValue = contact.property_value || mortgage.property_value
                    || customMap['property_value'] || customMap['heloc_home_value'] || contact.home_value || ''
                const propertyAddress = contact.property_address || contact.address || mortgage.property_address || ''
                const mortgageBalance = contact.mortgage_balance || mortgage.loan_amount
                    || customMap['mortgage_balance'] || customMap['heloc_mortgage_balance']
                    || customMap['Mortgage Balance'] || contact.loan_amount || ''
                const cashOutAmount = contact.cash_out_amount || mortgage.cash_out_amount
                    || customMap['cash_out_amount'] || customMap['heloc_cash_back'] || ''
                const loanType = contact.loan_type || mortgage.loan_type || ''
                const propertyType = contact.property_type || mortgage.property_type || ''

                // Skip contacts with no identifying info
                if (!email && !phone && !firstName) {
                    skipped++
                    continue
                }

                // Dedup by email
                const normalizedPhone = (phone || '').replace(/\D/g, '')
                let existingLead = null

                if (email) {
                    const { data: emailMatch } = await supabaseAdmin
                        .from('leads')
                        .select('id, first_name, last_name, email, phone, metadata')
                        .eq('user_id', userId)
                        .ilike('email', email)
                        .limit(1)
                        .maybeSingle()
                    if (emailMatch) existingLead = emailMatch
                }

                // Dedup by phone if no email match
                if (!existingLead && normalizedPhone && normalizedPhone.length >= 7) {
                    const { data: phoneCandidates } = await supabaseAdmin
                        .from('leads')
                        .select('id, first_name, last_name, email, phone, metadata')
                        .eq('user_id', userId)
                        .not('phone', 'is', null)
                        .limit(500)
                    if (phoneCandidates) {
                        existingLead = phoneCandidates.find(
                            (l: any) => (l.phone || '').replace(/\D/g, '') === normalizedPhone
                        ) || null
                    }
                }

                if (existingLead) {
                    // Update existing lead with any missing fields
                    const updates: Record<string, any> = {}
                    if (!existingLead.first_name && firstName) updates.first_name = firstName
                    if (!existingLead.last_name && lastName) updates.last_name = lastName
                    if (!existingLead.email && email) updates.email = email
                    if (!existingLead.phone && phone) updates.phone = phone

                    const existingMeta = existingLead.metadata || {}
                    updates.metadata = {
                        ...existingMeta,
                        bonzo_contact_id: bonzoId || existingMeta.bonzo_contact_id,
                        last_bonzo_sync: new Date().toISOString(),
                        credit_score: existingMeta.credit_score || creditScore,
                        property_address: existingMeta.property_address || propertyAddress,
                        home_value: existingMeta.home_value || propertyValue,
                        mortgage_balance: existingMeta.mortgage_balance || mortgageBalance,
                        cash_out: existingMeta.cash_out || cashOutAmount,
                        loan_type: existingMeta.loan_type || loanType,
                        property_type: existingMeta.property_type || propertyType,
                    }

                    await supabaseAdmin
                        .from('leads')
                        .update(updates)
                        .eq('id', existingLead.id)

                    updated++
                } else {
                    // Insert new lead
                    const { error: insertErr } = await supabaseAdmin
                        .from('leads')
                        .insert({
                            user_id: userId,
                            first_name: firstName,
                            last_name: lastName,
                            email: email,
                            phone: phone,
                            source: 'bonzo',
                            crm_source: 'bonzo',
                            crm_contact_id: bonzoId,
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
                        errors.push(`${firstName} ${lastName} (${email}): ${insertErr.message}`)
                    } else {
                        imported++
                    }
                }
            } catch (contactErr) {
                errors.push(`Contact processing error: ${contactErr instanceof Error ? contactErr.message : String(contactErr)}`)
            }
        }

        return new Response(JSON.stringify({
            success: true,
            imported,
            updated,
            skipped,
            total_from_bonzo: contacts.length,
            pages_fetched: currentPage,
            errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
        }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('bonzo-sync error:', message)
        return new Response(JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
})
