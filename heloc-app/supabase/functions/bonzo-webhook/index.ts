/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase, not by the IDE TS checker.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-webhook-token',
}

serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders })
    }

    // Only accept POST
    if (req.method !== 'POST') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    try {
        // Extract params from URL
        const url = new URL(req.url)
        const user_id = url.searchParams.get('user_id')
        const source = url.searchParams.get('source') || 'webhook'
        const token = url.searchParams.get('token') || req.headers.get('x-webhook-token') || ''

        if (!user_id) {
            return new Response(
                JSON.stringify({ error: 'Missing user_id query parameter' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Initialize Supabase Admin Client
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Verify the webhook token matches the user's stored token
        const { data: integration } = await supabaseAdmin
            .from('user_integrations')
            .select('metadata')
            .eq('user_id', user_id)
            .eq('provider', 'webhook_config')
            .maybeSingle()

        const storedToken = integration?.metadata?.webhook_token
        if (storedToken && storedToken !== token) {
            return new Response(
                JSON.stringify({ error: 'Invalid webhook token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Verify the user_id actually exists in auth.users
        const { data: userExists } = await supabaseAdmin.auth.admin.getUserById(user_id)
        if (!userExists?.user) {
            return new Response(
                JSON.stringify({ error: 'Invalid user_id' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Parse the incoming payload
        const payload = await req.json()

        // Normalize lead data from various CRM formats (GHL, Bonzo, LeadMailbox, Zapier, n8n)
        const leadData = {
            firstName: payload.firstName || payload.first_name || payload.fname || payload.firstname || '',
            lastName: payload.lastName || payload.last_name || payload.lname || payload.lastname || '',
            email: payload.email || payload.emailAddress || payload.email_address || '',
            phone: payload.phone || payload.phoneNumber || payload.mobile || payload.homephone || payload.mobilephone || '',
            sourceId: payload.id || payload.contactId || payload.contact_id || null,
            // Property & financial fields
            creditScore: payload.credit_score || payload.creditScore || payload.credit_rating || payload.field_041 || '',
            propertyAddress: payload.property_address || payload.propertyAddress || payload.address || payload.address1 ||
                payload.mail_address || (payload.street ? [payload.street, payload.city, payload.state, payload.zip].filter(Boolean).join(', ') : '') || '',
            homeValue: payload.home_value || payload.homeValue || payload.property_value || payload.field_006 || payload.field_007 || '',
            mortgageBalance: payload.mortgage_balance || payload.mortgageBalance || payload.current_balance || payload.balance || payload.current_loan_amount || payload.field_044 || '',
            cashOut: payload.cash_out_amount || payload.cashOut || payload.cash_out || payload.cash_needed || payload.field_036 || payload.field_039 || '',
            propertyType: payload.property_type || payload.propertyType || payload.occupancy || payload.occupancy_type || payload.property_use || payload.propertyUse || '',
        }

        // Validate crm_source against allowed values
        const validCrmSources = ['manual', 'ghl', 'bonzo', 'csv', 'webhook', 'leadmailbox', 'zapier', 'n8n']
        const crmSource = validCrmSources.includes(source) ? source : 'webhook'

        // ---- DEDUPLICATION: check for existing lead with same email or phone ----
        const normalizedEmail = (leadData.email || '').toLowerCase().trim()
        const normalizedPhone = (leadData.phone || '').replace(/\D/g, '') // digits only

        let existingLead = null
        if (normalizedEmail) {
            const { data: emailMatch } = await supabaseAdmin
                .from('leads')
                .select('id, first_name, last_name, email, phone, metadata')
                .eq('user_id', user_id)
                .ilike('email', normalizedEmail)
                .limit(1)
                .maybeSingle()
            if (emailMatch) existingLead = emailMatch
        }
        if (!existingLead && normalizedPhone && normalizedPhone.length >= 7) {
            // Phone dedup: fetch recent leads and compare digits-only
            const { data: phoneCandidates } = await supabaseAdmin
                .from('leads')
                .select('id, first_name, last_name, email, phone, metadata')
                .eq('user_id', user_id)
                .not('phone', 'is', null)
                .limit(500)
            if (phoneCandidates) {
                existingLead = phoneCandidates.find(
                    (l: { phone?: string | null }) => (l.phone || '').replace(/\D/g, '') === normalizedPhone
                ) || null
            }
        }

        if (existingLead) {
            // Duplicate found — update existing lead with any new data instead of creating a duplicate
            const updates: Record<string, unknown> = {}
            if (!existingLead.first_name && leadData.firstName) updates.first_name = leadData.firstName
            if (!existingLead.last_name && leadData.lastName) updates.last_name = leadData.lastName
            if (!existingLead.email && leadData.email) updates.email = leadData.email
            if (!existingLead.phone && leadData.phone) updates.phone = leadData.phone
            // Merge raw payload + property fields into metadata (fill gaps, don't overwrite existing)
            const existingMeta = existingLead.metadata || {}
            updates.metadata = {
                ...existingMeta,
                raw: payload,
                last_webhook_at: new Date().toISOString(),
                credit_score: existingMeta.credit_score || leadData.creditScore || '',
                property_address: existingMeta.property_address || leadData.propertyAddress || '',
                home_value: existingMeta.home_value || leadData.homeValue || '',
                mortgage_balance: existingMeta.mortgage_balance || leadData.mortgageBalance || '',
                cash_out: existingMeta.cash_out || leadData.cashOut || '',
                property_type: existingMeta.property_type || leadData.propertyType || '',
            }

            if (Object.keys(updates).length > 0) {
                await supabaseAdmin
                    .from('leads')
                    .update(updates)
                    .eq('id', existingLead.id)
            }

            return new Response(
                JSON.stringify({ message: 'Duplicate lead — existing record updated', source, lead_id: existingLead.id, duplicate: true }),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ---- No duplicate found — insert new lead ----
        const { data, error } = await supabaseAdmin
            .from('leads')
            .insert({
                user_id: user_id,
                first_name: leadData.firstName,
                last_name: leadData.lastName,
                email: leadData.email,
                phone: leadData.phone,
                source: source,
                crm_source: crmSource,
                crm_contact_id: leadData.sourceId,
                status: 'New',
                metadata: {
                    raw: payload,
                    credit_score: leadData.creditScore,
                    property_address: leadData.propertyAddress,
                    home_value: leadData.homeValue,
                    mortgage_balance: leadData.mortgageBalance,
                    cash_out: leadData.cashOut,
                    property_type: leadData.propertyType,
                }
            })
            .select()

        if (error) throw error

        const leadId = data?.[0]?.id

        // Fire email notification if user has it enabled
        const resendApiKey = Deno.env.get('RESEND_API_KEY')
        if (resendApiKey) {
            try {
                // Fetch user email + notification preference
                const { data: profile } = await supabaseAdmin
                    .from('profiles')
                    .select('email, lead_notifications_email')
                    .eq('id', user_id)
                    .single()

                if (profile?.lead_notifications_email !== false && profile?.email) {
                    const clientName = [leadData.firstName, leadData.lastName].filter(Boolean).join(' ') || 'Unknown'
                    // Build property details rows if available
                    const propRows: string[] = []
                    if (leadData.creditScore) propRows.push(`<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Credit Score</td><td style="padding:6px 0;">${leadData.creditScore}</td></tr>`)
                    if (leadData.propertyAddress) propRows.push(`<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Property</td><td style="padding:6px 0;">${leadData.propertyAddress}</td></tr>`)
                    if (leadData.homeValue) propRows.push(`<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Home Value</td><td style="padding:6px 0;">$${Number(leadData.homeValue).toLocaleString()}</td></tr>`)
                    if (leadData.mortgageBalance) propRows.push(`<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">1st Mortgage</td><td style="padding:6px 0;">$${Number(leadData.mortgageBalance).toLocaleString()}</td></tr>`)
                    if (leadData.cashOut) propRows.push(`<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Cash Out</td><td style="padding:6px 0;">$${Number(leadData.cashOut).toLocaleString()}</td></tr>`)
                    const propSection = propRows.length > 0
                        ? `<tr><td colspan="2" style="padding:10px 0 4px 0;font-weight:600;color:#1d4ed8;font-size:13px;">Property Details</td></tr>${propRows.join('')}`
                        : ''

                    const emailBody = {
                        from: 'Above All HELOC <leads@notifications.aboveallcrm.com>',
                        to: [profile.email],
                        subject: `🔔 New Lead: ${clientName}`,
                        html: `
                            <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
                                <h2 style="color:#1d4ed8;">New Lead Received</h2>
                                <table style="width:100%;border-collapse:collapse;">
                                    <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Name</td><td style="padding:6px 0;font-weight:600;">${clientName}</td></tr>
                                    <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Email</td><td style="padding:6px 0;">${leadData.email || '—'}</td></tr>
                                    <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Phone</td><td style="padding:6px 0;">${leadData.phone || '—'}</td></tr>
                                    <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Source</td><td style="padding:6px 0;">${source}</td></tr>
                                    ${propSection}
                                </table>
                                <p style="margin-top:20px;font-size:13px;color:#9ca3af;">Log in to your Above All HELOC dashboard to view the full lead.</p>
                                <p style="font-size:11px;color:#d1d5db;">To stop these emails, go to Settings → My Profile → Notification Preferences.</p>
                            </div>
                        `,
                    }

                    await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${resendApiKey}`,
                        },
                        body: JSON.stringify(emailBody),
                    })
                }
            } catch (emailErr) {
                // Email failure is non-fatal — log it but don't block the response
                console.error('Lead notification email failed:', emailErr)
            }
        }

        return new Response(
            JSON.stringify({ message: 'Lead received', source, lead_id: leadId }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err) {
        const message = err instanceof Error ? err.message : (err?.message || JSON.stringify(err) || 'Unknown error')
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
