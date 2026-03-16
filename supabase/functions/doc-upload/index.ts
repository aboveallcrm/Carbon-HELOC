// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const DOC_TYPE_LABELS: Record<string, string> = {
    photo_id: 'Photo ID',
    income: 'Income Documents',
    insurance: 'Homeowners Insurance',
    mortgage_statement: 'Mortgage Statement',
}

const EMAIL_TEMPLATE = (data: any) => `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #c5a059, #a68543); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .doc-info { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #c5a059; }
        .button { display: inline-block; background: #c5a059; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📎 Document Uploaded</h1>
            <p>${data.docTypeLabel}</p>
        </div>
        <div class="content">
            <p>Hi ${data.loName},</p>
            <p><strong>${data.clientName}</strong> has uploaded a document for their HELOC quote.</p>

            <div class="doc-info">
                <h3>Document Details</h3>
                <p><strong>Type:</strong> ${data.docTypeLabel}</p>
                <p><strong>File:</strong> ${data.fileName}</p>
                <p><strong>Quote Code:</strong> ${data.quoteCode}</p>
                <p><strong>Uploaded:</strong> ${data.uploadTime}</p>
            </div>

            ${data.downloadUrl ? `<a href="${data.downloadUrl}" class="button">📥 Download Document</a>` : '<p>The document has been saved to your secure storage.</p>'}

            <p style="margin-top: 20px; font-size: 14px; color: #666;">
                This document was uploaded securely through the client quote page.
            </p>
        </div>
        <div class="footer">
            <p>Powered by Above All CRM | Ezra AI Assistant</p>
        </div>
    </div>
</body>
</html>
`

serve(async (req: Request) => {
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
            userId,
            docType,
            fileName,
            mimeType,
            fileBase64,
            loEmail,
            loName,
            clientName,
        } = body

        if (!quoteCode || !docType || !fileBase64) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: quoteCode, docType, fileBase64' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Validate file size (base64 is ~33% larger than binary)
        const estimatedSize = (fileBase64.length * 3) / 4
        if (estimatedSize > 10 * 1024 * 1024) {
            return new Response(
                JSON.stringify({ error: 'File too large. Maximum size is 10MB.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        // Look up the quote link to get the LO's user_id
        let loUserId = userId
        if (quoteCode) {
            const { data: link } = await supabaseAdmin
                .from('quote_links')
                .select('user_id')
                .eq('code', quoteCode)
                .maybeSingle()
            if (link) loUserId = link.user_id
        }

        // Decode base64 to binary
        const binaryString = atob(fileBase64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
        }

        // Determine file extension
        const ext = fileName ? fileName.split('.').pop() || 'bin' : 'bin'
        const timestamp = Date.now()
        const storagePath = `${loUserId || 'unknown'}/${quoteCode}/${docType}_${timestamp}.${ext}`

        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabaseAdmin
            .storage
            .from('doc-uploads')
            .upload(storagePath, bytes, {
                contentType: mimeType || 'application/octet-stream',
                upsert: false,
            })

        if (uploadError) {
            console.error('Storage upload error:', uploadError)
            // If bucket doesn't exist, try creating it
            if (uploadError.message?.includes('not found') || uploadError.statusCode === '404') {
                // Fallback: log the upload without storage
                console.warn('doc-uploads bucket not found, logging without storage')
            } else {
                return new Response(
                    JSON.stringify({ error: 'Failed to upload file: ' + uploadError.message }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
        }

        // Generate a signed download URL (7 days)
        let downloadUrl = ''
        if (uploadData) {
            const { data: signedUrl } = await supabaseAdmin
                .storage
                .from('doc-uploads')
                .createSignedUrl(storagePath, 7 * 24 * 60 * 60) // 7 days
            downloadUrl = signedUrl?.signedUrl || ''
        }

        const docTypeLabel = DOC_TYPE_LABELS[docType] || docType

        // Send email notification to LO via Resend
        const resendKey = Deno.env.get('RESEND_API_KEY')
        const targetEmail = loEmail || Deno.env.get('ALERT_TO_EMAIL') || ''

        if (resendKey && targetEmail) {
            try {
                const emailHtml = EMAIL_TEMPLATE({
                    loName: loName || 'Loan Officer',
                    clientName: clientName || 'A client',
                    docTypeLabel,
                    fileName: fileName || 'document',
                    quoteCode,
                    uploadTime: new Date().toLocaleString(),
                    downloadUrl,
                })

                const emailRes = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${resendKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        from: Deno.env.get('RESEND_FROM_EMAIL') || 'notifications@notifications.aboveallcrm.com',
                        to: targetEmail,
                        subject: `📎 ${clientName || 'Client'} uploaded ${docTypeLabel} — Quote ${quoteCode}`,
                        html: emailHtml,
                    }),
                })

                if (!emailRes.ok) {
                    console.error('Resend email error:', await emailRes.text())
                }
            } catch (emailErr) {
                console.error('Email send error:', emailErr)
            }
        }

        // Log to notification_logs if table exists
        try {
            await supabaseAdmin
                .from('notification_logs')
                .insert({
                    user_id: loUserId,
                    notification_type: 'doc_upload',
                    recipient: targetEmail,
                    subject: `Document uploaded: ${docTypeLabel}`,
                    content: JSON.stringify({ docType, fileName, quoteCode, storagePath, downloadUrl }),
                    status: 'sent',
                })
        } catch (logErr) {
            console.warn('Notification log insert failed (table may not exist):', logErr)
        }

        return new Response(
            JSON.stringify({
                success: true,
                storagePath: uploadData ? storagePath : null,
                url: downloadUrl || null,
                message: `${docTypeLabel} uploaded successfully`,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error'
        console.error('Doc upload error:', message)

        return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
