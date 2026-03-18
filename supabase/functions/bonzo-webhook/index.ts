// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase, not by the IDE TS checker.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"

serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req)

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

        // Verify the webhook token matches the user's stored token (mandatory)
        if (!token) {
            return new Response(
                JSON.stringify({ error: 'Missing webhook token. Provide via ?token= or x-webhook-token header', v: 2 }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const { data: integration, error: webhookConfigErr } = await supabaseAdmin
            .from('user_integrations')
            .select('metadata')
            .eq('user_id', user_id)
            .eq('provider', 'webhook_config')
            .maybeSingle()

        const storedToken = integration?.metadata?.webhook_token
        if (!storedToken) {
            return new Response(
                JSON.stringify({ error: 'No webhook token configured for this user. Set one in Settings > Integrations.', v: 2 }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }
        if (storedToken !== token) {
            return new Response(
                JSON.stringify({ error: 'Invalid webhook token', v: 2 }),
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
        const rawPayload = await req.json()

        // Bonzo event hooks send { event, prospect: {...} } — unwrap if present
        const payload = rawPayload.prospect || rawPayload
        // Bonzo mortgage data may be nested under payload.mortgage
        const mortgage = payload.mortgage || {}
        // Bonzo custom fields may be an array of {key, value} objects
        const customArr = Array.isArray(payload.custom) ? payload.custom : []
        const customMap: Record<string, string> = {}
        for (const cf of customArr) {
            if (cf && cf.key) customMap[cf.key] = cf.value || ''
        }

        // Normalize lead data from various CRM formats (GHL, Bonzo, LeadMailbox, Zapier, n8n)
        const leadData = {
            firstName: payload.firstName || payload.first_name || payload.fname || payload.firstname || '',
            lastName: payload.lastName || payload.last_name || payload.lname || payload.lastname || '',
            email: payload.email || payload.emailAddress || payload.email_address || '',
            phone: payload.phone || payload.phoneNumber || payload.mobile || payload.homephone || payload.mobilephone || '',
            sourceId: payload.id || payload.contactId || payload.contact_id || null,
            // Property & financial fields — check top-level, mortgage nested object, and custom fields
            creditScore: payload.credit_score || payload.creditScore || mortgage.credit_score
                || customMap['credit_score'] || customMap['heloc_credit_score'] || customMap['Credit Score']
                || payload.credit_rating || customMap['credit_rating'] || payload.field_041 || '',
            propertyAddress: payload.property_address || payload.propertyAddress || mortgage.property_address
                || payload.address || payload.address1 || payload.mail_address
                || (payload.street ? [payload.street, payload.city, payload.state, payload.zip].filter(Boolean).join(', ') : '') || '',
            homeValue: payload.home_value || payload.homeValue || payload.property_value || mortgage.property_value
                || customMap['property_value'] || customMap['heloc_home_value']
                || payload.field_006 || payload.field_007 || '',
            mortgageBalance: payload.mortgage_balance || payload.mortgageBalance || mortgage.loan_amount
                || payload.current_balance || payload.balance || payload.current_loan_amount
                || customMap['mortgage_balance'] || customMap['heloc_mortgage_balance'] || customMap['Mortgage Balance']
                || payload.field_044 || '',
            cashOut: payload.cash_out_amount || payload.cashOut || payload.cash_out || mortgage.cash_out_amount
                || customMap['cash_out_amount'] || customMap['heloc_cash_back']
                || payload.cash_needed || payload.field_036 || payload.field_039 || '',
            loanType: payload.loan_type || payload.loanType || mortgage.loan_type
                || customMap['loan_type'] || customMap['heloc_loan_type'] || customMap['Loan Type'] || '',
            propertyType: payload.property_type || payload.propertyType || mortgage.property_type
                || customMap['property_type'] || customMap['heloc_property_type'] || customMap['Property Type']
                || payload.occupancy || '',
        }

        // Map Bonzo tags/event to pipeline status
        const bonzoStatusMap: Record<string, string> = {
            new_lead: 'new', contacted: 'contacted', qualified: 'qualified', quoted: 'quoted',
            app_submitted: 'application_sent', in_underwriting: 'in_underwriting',
            approved: 'approved', docs_out: 'docs_out', funded: 'funded',
            on_hold: 'on_hold', lost: 'lost', reactivation: 'reactivation'
        }
        const bonzoTags: string[] = Array.isArray(payload.tags)
            ? payload.tags.map((t: any) => typeof t === 'string' ? t.toLowerCase() : (t?.name || '').toLowerCase())
            : (typeof payload.tags === 'string' ? payload.tags.toLowerCase().split(',').map((s: string) => s.trim()) : [])
        const bonzoEvent = (rawPayload.event || '').toLowerCase()
        // Determine status from tags (last matching tag wins — most specific)
        let derivedStatus = 'new'
        for (const tag of bonzoTags) {
            if (bonzoStatusMap[tag]) derivedStatus = bonzoStatusMap[tag]
        }
        // Event-based override
        if (bonzoEvent === 'prospect.lost' || bonzoEvent === 'lost') derivedStatus = 'lost'

        // Pipeline stage change event — try to reverse-map stage to Carbon status
        if (bonzoEvent === 'prospects.pipeline_stages.updated' || bonzoEvent === 'pipeline_stages.updated') {
            const stageId = rawPayload.pipeline_stage_id || rawPayload.pipelineStageId || payload.pipeline_stage_id
            const stageName = (rawPayload.pipeline_stage_name || rawPayload.stageName || payload.pipeline_stage_name || '').toLowerCase()
            if (stageId && user_id) {
                // Look up user's stage mapping to reverse-resolve Carbon status
                const { data: intRows } = await supabaseAdmin
                    .from('user_integrations').select('metadata')
                    .eq('user_id', user_id).in('provider', ['heloc_keys', 'heloc_settings'])
                let stageMap: Record<string, string> = {}
                for (const row of (intRows || [])) {
                    const bm = row.metadata?.bonzo?.bonzo_stage_map
                    if (bm) stageMap = bm
                }
                // Reverse lookup: find Carbon status whose mapped stage matches inbound stageId
                for (const [carbonStatus, mappedStageId] of Object.entries(stageMap)) {
                    if (String(mappedStageId) === String(stageId)) { derivedStatus = carbonStatus; break }
                }
                // Fallback: match by stage name against bonzoStatusMap keys
                if (derivedStatus === 'new' && stageName) {
                    const nameMatch = bonzoStatusMap[stageName] || bonzoStatusMap[stageName.replace(/[\s-]/g, '_')]
                    if (nameMatch) derivedStatus = nameMatch
                }
            }
        }
        // Campaign change event — if moved to reactivation campaign, set status
        if (bonzoEvent === 'prospects.campaigns.updated' || bonzoEvent === 'campaigns.updated') {
            const campaignId = rawPayload.campaign_id || rawPayload.campaignId || payload.campaign_id
            if (campaignId && user_id) {
                const { data: intRows } = await supabaseAdmin
                    .from('user_integrations').select('metadata')
                    .eq('user_id', user_id).in('provider', ['heloc_keys', 'heloc_settings'])
                for (const row of (intRows || [])) {
                    const reactivationCampaignId = row.metadata?.bonzo?.bonzo_reactivation_campaign_id
                    if (reactivationCampaignId && String(reactivationCampaignId) === String(campaignId)) {
                        derivedStatus = 'reactivation'
                    }
                }
            }
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
            // Phone dedup: fetch leads and compare digits-only
            const { data: phoneCandidates } = await supabaseAdmin
                .from('leads')
                .select('id, first_name, last_name, email, phone, metadata')
                .eq('user_id', user_id)
                .not('phone', 'is', null)
                .limit(2000)
            if (phoneCandidates) {
                existingLead = phoneCandidates.find(
                    (l: any) => (l.phone || '').replace(/\D/g, '') === normalizedPhone
                ) || null
            }
        }

        if (existingLead) {
            // Duplicate found — update existing lead with any new data instead of creating a duplicate
            const updates: Record<string, any> = {}
            if (!existingLead.first_name && leadData.firstName) updates.first_name = leadData.firstName
            if (!existingLead.last_name && leadData.lastName) updates.last_name = leadData.lastName
            if (!existingLead.email && leadData.email) updates.email = leadData.email
            if (!existingLead.phone && leadData.phone) updates.phone = leadData.phone
            // Update status if webhook provides a more advanced stage
            if (derivedStatus !== 'new') updates.status = derivedStatus
            // Fill loan_type and property_type columns
            if (!existingLead.loan_type && leadData.loanType) updates.loan_type = leadData.loanType
            if (!existingLead.property_type && leadData.propertyType) updates.property_type = leadData.propertyType
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
                loan_type: existingMeta.loan_type || leadData.loanType || '',
                property_type: existingMeta.property_type || leadData.propertyType || '',
                bonzo_tags: bonzoTags.length > 0 ? bonzoTags : (existingMeta.bonzo_tags || []),
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
                status: derivedStatus,
                loan_type: leadData.loanType || null,
                property_type: leadData.propertyType || null,
                metadata: {
                    raw: payload,
                    credit_score: leadData.creditScore,
                    property_address: leadData.propertyAddress,
                    home_value: leadData.homeValue,
                    mortgage_balance: leadData.mortgageBalance,
                    cash_out: leadData.cashOut,
                    loan_type: leadData.loanType,
                    property_type: leadData.propertyType,
                    bonzo_tags: bonzoTags,
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
