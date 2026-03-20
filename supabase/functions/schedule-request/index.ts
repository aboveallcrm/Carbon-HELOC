// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"

const QUOTE_CODE_RE = /^[a-z0-9]{6,12}$/i
const VALID_REQUEST_TYPES = new Set(['schedule_call', 'call_me_now'])
const MAX_REQUESTS_PER_QUOTE_PER_HOUR = 5
const MAX_PHONE_ATTEMPTS_PER_10_MIN = 2

function normalizeText(value: unknown, maxLength = 160): string {
    return String(value || '')
        .replace(/[<>"'`]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength)
}

function normalizePhone(value: unknown): string {
    const digits = String(value || '').replace(/\D/g, '')
    if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1)
    return digits
}

function isValidEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function sanitizeHttpsUrl(value: unknown): string {
    const url = String(value || '').trim()
    return /^https:\/\//i.test(url) ? url : ''
}

// Simple HTML template for email notifications
const EMAIL_TEMPLATE = (data: any) => `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #c5a059, #a68543); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .client-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #c5a059; }
        .button { display: inline-block; background: #c5a059; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎯 New Client Request</h1>
            <p>${data.requestType === 'call_me_now' ? 'URGENT: Call Me Now!' : 'Schedule Request'}</p>
        </div>
        <div class="content">
            <p>Hi ${data.loName},</p>
            <p>A client has requested to ${data.requestType === 'call_me_now' ? 'speak with you immediately' : 'schedule a call'} through Ezra.</p>
            
            <div class="client-info">
                <h3>Client Information</h3>
                <p><strong>Name:</strong> ${data.clientName || 'Not provided'}</p>
                <p><strong>Phone:</strong> <a href="tel:${data.clientPhone}">${data.clientPhone}</a></p>
                ${data.clientEmail ? `<p><strong>Email:</strong> <a href="mailto:${data.clientEmail}">${data.clientEmail}</a></p>` : ''}
                <p><strong>Quote Code:</strong> ${data.quoteCode}</p>
                <p><strong>Preferred Time:</strong> ${data.preferredTime}</p>
                <p><strong>Request Time:</strong> ${data.requestTime}</p>
            </div>
            
            <p><strong>Action Required:</strong></p>
            <a href="tel:${data.clientPhone}" class="button">📞 Call Client Now</a>
            
            ${data.calendarLink ? `<a href="${data.calendarLink}" class="button" style="background: #0f172a; margin-left: 10px;">📅 Send Calendar Link</a>` : ''}
            
            <p style="margin-top: 20px; font-size: 14px; color: #666;">
                ${data.requestType === 'call_me_now' 
                    ? '⚡ This is a "Call Me Now" request - the client is waiting for your call!' 
                    : 'The client is expecting to hear from you soon.'}
            </p>
        </div>
        <div class="footer">
            <p>Powered by Above All CRM | Ezra AI Assistant</p>
        </div>
    </div>
</body>
</html>
`

// SMS message template
const SMS_TEMPLATE = (data: any) => 
    `🏠 Above All CRM: ${data.clientName} wants to ${data.requestType === 'call_me_now' ? 'talk NOW' : 'schedule a call'}! 📞 ${data.clientPhone} | Quote: ${data.quoteCode}`

serve(async (req: Request) => {
    const corsHeaders = getCorsHeaders(req)

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (req.method !== 'POST') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    try {
        const body = await req.json()
        const {
            quoteCode,
            clientName,
            clientPhone,
            clientEmail,
            requestType = 'schedule_call',
            preferredTime = 'asap',
            metadata = {}
        } = body

        // Validate required fields
        if (!quoteCode || !clientPhone) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: quoteCode and clientPhone' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }
        if (!QUOTE_CODE_RE.test(quoteCode)) {
            return new Response(
                JSON.stringify({ error: 'Invalid quote code' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }
        if (!VALID_REQUEST_TYPES.has(requestType)) {
            return new Response(
                JSON.stringify({ error: 'Invalid request type' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const normalizedPhone = normalizePhone(clientPhone)
        if (normalizedPhone.length < 10 || normalizedPhone.length > 15) {
            return new Response(
                JSON.stringify({ error: 'Invalid phone number' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const normalizedEmail = normalizeText(clientEmail || '', 160).toLowerCase()
        if (normalizedEmail && !isValidEmail(normalizedEmail)) {
            return new Response(
                JSON.stringify({ error: 'Invalid email address' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const safeClientName = normalizeText(clientName || '', 120)
        const safePreferredTime = normalizeText(preferredTime || 'asap', 120)
        const metadataJson = JSON.stringify(metadata || {})
        if (metadataJson.length > 5000) {
            return new Response(
                JSON.stringify({ error: 'Metadata payload too large' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Initialize Supabase Admin Client
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // 1. Look up quote link to get user_id and lead_id
        const { data: link, error: linkError } = await supabaseAdmin
            .from('quote_links')
            .select('id, user_id, lead_id, lo_info')
            .eq('code', quoteCode)
            .maybeSingle()

        if (linkError || !link) {
            return new Response(
                JSON.stringify({ error: 'Quote not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString()
        const { count: recentQuoteCount } = await supabaseAdmin
            .from('schedule_requests')
            .select('id', { count: 'exact', head: true })
            .eq('quote_code', quoteCode)
            .gte('created_at', hourAgo)

        if ((recentQuoteCount || 0) >= MAX_REQUESTS_PER_QUOTE_PER_HOUR) {
            return new Response(
                JSON.stringify({ error: 'Too many requests for this quote. Please try again later.' }),
                { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const { count: recentPhoneCount } = await supabaseAdmin
            .from('schedule_requests')
            .select('id', { count: 'exact', head: true })
            .eq('quote_code', quoteCode)
            .eq('client_phone', normalizedPhone)
            .gte('created_at', tenMinutesAgo)

        if ((recentPhoneCount || 0) >= MAX_PHONE_ATTEMPTS_PER_10_MIN) {
            return new Response(
                JSON.stringify({ error: 'Please wait a few minutes before sending another request.' }),
                { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // 2. Get LO profile with notification preferences
        const { data: profile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('id, full_name, notification_phone, notification_email, sms_enabled, email_notifications_enabled, crm_webhook_url, crm_type, calendar_link')
            .eq('id', link.user_id)
            .maybeSingle()

        if (profileError) {
            console.error('Profile lookup error:', profileError)
        }

        const loName = normalizeText(profile?.full_name || 'Loan Officer', 120)
        const loPhone = profile?.notification_phone || ''
        const loEmail = profile?.notification_email || ''
        const calendarLink = sanitizeHttpsUrl(link.lo_info?.calendarLink || profile?.calendar_link || '')

        // 3. Create schedule request in database
        const { data: request, error: requestError } = await supabaseAdmin
            .rpc('create_schedule_request', {
                p_user_id: link.user_id,
                p_lead_id: link.lead_id,
                p_quote_code: quoteCode,
                p_client_name: safeClientName,
                p_client_phone: normalizedPhone,
                p_client_email: normalizedEmail,
                p_request_type: requestType,
                p_preferred_time: safePreferredTime,
                p_metadata: metadata
            })

        if (requestError) {
            console.error('Create schedule request error:', requestError)
            return new Response(
                JSON.stringify({ error: 'Failed to create schedule request' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const requestId = request

        // 4. Prepare notification data
        const notificationData = {
            loName,
            clientName: safeClientName || 'A client',
            clientPhone: normalizedPhone,
            clientEmail: normalizedEmail,
            quoteCode,
            requestType,
            preferredTime: safePreferredTime === 'asap' ? 'As soon as possible' : safePreferredTime,
            requestTime: new Date().toLocaleString(),
            calendarLink
        }

        const notificationResults: any = {
            email: { sent: false },
            sms: { sent: false },
            webhook: { sent: false },
            crm: { sent: false }
        }

        // 5. Send Email Notification (if enabled and email exists)
        if (profile?.email_notifications_enabled !== false && loEmail) {
            try {
                // Use Supabase's built-in email or external service
                // For now, we'll log it and you can integrate with your email provider
                const { error: emailError } = await supabaseAdmin
                    .from('notification_logs')
                    .insert({
                        user_id: link.user_id,
                        schedule_request_id: requestId,
                        notification_type: 'email',
                        recipient: loEmail,
                        subject: `${requestType === 'call_me_now' ? '🚨 URGENT:' : '📅'} New Client ${requestType === 'call_me_now' ? 'Call Request' : 'Schedule Request'}`,
                        content: EMAIL_TEMPLATE(notificationData),
                        status: 'pending'
                    })

                if (!emailError) {
                    notificationResults.email.sent = true
                    notificationResults.email.recipient = loEmail
                }
            } catch (emailErr) {
                console.error('Email notification error:', emailErr)
            }
        }

        // 6. Send SMS Notification (if enabled and phone exists)
        if (profile?.sms_enabled && loPhone) {
            try {
                // Log SMS for now - integrate with Twilio or similar
                const { error: smsError } = await supabaseAdmin
                    .from('notification_logs')
                    .insert({
                        user_id: link.user_id,
                        schedule_request_id: requestId,
                        notification_type: 'sms',
                        recipient: loPhone,
                        content: SMS_TEMPLATE(notificationData),
                        status: 'pending'
                    })

                if (!smsError) {
                    notificationResults.sms.sent = true
                    notificationResults.sms.recipient = loPhone
                }
            } catch (smsErr) {
                console.error('SMS notification error:', smsErr)
            }
        }

        // 7. Send Webhook to CRM (if configured)
        if (profile?.crm_webhook_url) {
            try {
                const webhookPayload = {
                    event: 'schedule_request_created',
                    timestamp: new Date().toISOString(),
                    data: {
                        requestId,
                        quoteCode,
                        clientName: safeClientName,
                        clientPhone: normalizedPhone,
                        clientEmail: normalizedEmail,
                        requestType,
                        preferredTime: safePreferredTime,
                        loInfo: {
                            id: link.user_id,
                            name: loName,
                            phone: loPhone,
                            email: loEmail
                        }
                    }
                }

                // Send webhook
                const webhookResponse = await fetch(profile.crm_webhook_url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Source': 'above-all-crm',
                        'X-Event': 'schedule_request'
                    },
                    body: JSON.stringify(webhookPayload)
                })

                notificationResults.webhook.sent = webhookResponse.ok
                notificationResults.webhook.status = webhookResponse.status

                // Log webhook
                await supabaseAdmin
                    .from('notification_logs')
                    .insert({
                        user_id: link.user_id,
                        schedule_request_id: requestId,
                        notification_type: 'webhook',
                        recipient: profile.crm_webhook_url,
                        content: JSON.stringify(webhookPayload),
                        status: webhookResponse.ok ? 'sent' : 'failed',
                        provider_response: { status: webhookResponse.status, statusText: webhookResponse.statusText }
                    })

                // Mark as CRM synced if successful
                if (webhookResponse.ok) {
                    notificationResults.crm.sent = true
                }
            } catch (webhookErr) {
                console.error('Webhook error:', webhookErr)
            }
        }

        // 8. Mark request as notified
        await supabaseAdmin
            .rpc('mark_schedule_notified', {
                p_request_id: requestId,
                p_crm_synced: notificationResults.crm.sent
            })

        // 9. Return success response
        return new Response(
            JSON.stringify({
                success: true,
                requestId,
                message: requestType === 'call_me_now' 
                    ? 'Call request sent! Your loan officer will be notified immediately.' 
                    : 'Schedule request sent! Your loan officer will contact you soon.',
                notifications: notificationResults
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('Schedule request error:', message)
        
        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
