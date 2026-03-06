// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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
        //    SA Key Management stores in provider='heloc_keys' as bonzo_api_key
        //    Integrations tab stores in provider='heloc_settings' as bonzo.apiKey
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
            return new Response(JSON.stringify({ error: 'No Bonzo API key configured. Go to Settings → Integrations → Bonzo and enter your Xcode key.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // 3. Parse request body for optional filters
        const body = await req.json().catch(() => ({}))
        const page = body.page || 1
        const perPage = body.per_page || 100

        // 4. Fetch contacts from Bonzo API
        // Try paginated list endpoint first, fall back to search
        const bonzoHeaders = {
            'Authorization': 'Bearer ' + bonzoApiKey,
            'Content-Type': 'application/json',
        }

        let contacts: any[] = []
        let bonzoError = null

        // Try GET /v1/contacts with pagination
        const listUrl = `https://api.getbonzo.com/v1/contacts?page=${page}&per_page=${perPage}`
        const listResp = await fetch(listUrl, {
            method: 'GET',
            headers: bonzoHeaders,
        })

        if (listResp.ok) {
            const listData = await listResp.json()
            contacts = listData.data || listData.contacts || listData || []
            if (!Array.isArray(contacts)) contacts = [contacts]
        } else {
            // Fall back to POST /v1/contacts/search with empty filter
            const searchResp = await fetch('https://api.getbonzo.com/v1/contacts/search', {
                method: 'POST',
                headers: bonzoHeaders,
                body: JSON.stringify({ page, per_page: perPage }),
            })

            if (searchResp.ok) {
                const searchData = await searchResp.json()
                contacts = searchData.data || searchData.contacts || searchData || []
                if (!Array.isArray(contacts)) contacts = [contacts]
            } else {
                const errText = await searchResp.text().catch(() => '')
                bonzoError = `Bonzo API returned ${searchResp.status}: ${errText.substring(0, 300)}`
            }
        }

        if (bonzoError) {
            return new Response(JSON.stringify({ error: bonzoError }),
                { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // 5. For each contact, insert or update in leads table (same dedup logic as bonzo-webhook)
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
                        credit_score: existingMeta.credit_score || contact.credit_score || '',
                        property_address: existingMeta.property_address || contact.address || '',
                        home_value: existingMeta.home_value || contact.home_value || '',
                        mortgage_balance: existingMeta.mortgage_balance || contact.mortgage_balance || '',
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
                                credit_score: contact.credit_score || '',
                                property_address: contact.address || '',
                                home_value: contact.home_value || '',
                                mortgage_balance: contact.mortgage_balance || '',
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
