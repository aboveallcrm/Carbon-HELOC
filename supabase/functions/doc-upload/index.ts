// @ts-nocheck - Deno URL imports are resolved at runtime by Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { getCorsHeaders } from "../_shared/cors.ts"

const QUOTE_CODE_RE = /^[a-z0-9]{6,12}$/i
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024
const MAX_UPLOADS_PER_QUOTE = 20
const ALLOWED_DOC_TYPES = new Set(['photo_id', 'income', 'insurance', 'mortgage_statement'])
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])

const DOC_TYPE_LABELS: Record<string, string> = {
    photo_id: 'Photo ID',
    income: 'Income Documents',
    insurance: 'Homeowners Insurance',
    mortgage_statement: 'Mortgage Statement',
}

function escapeHtml(value: unknown): string {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function normalizeText(value: unknown, maxLength = 120): string {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function sanitizeExtension(fileName: string): string {
    const raw = fileName.split('.').pop() || 'bin'
    const clean = raw.replace(/[^a-z0-9]/gi, '').toLowerCase()
    return clean || 'bin'
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
            <h1>Document Uploaded</h1>
            <p>${escapeHtml(data.docTypeLabel)}</p>
        </div>
        <div class="content">
            <p>Hi ${escapeHtml(data.loName)},</p>
            <p><strong>${escapeHtml(data.clientName)}</strong> has uploaded a document for their HELOC quote.</p>

            <div class="doc-info">
                <h3>Document Details</h3>
                <p><strong>Type:</strong> ${escapeHtml(data.docTypeLabel)}</p>
                <p><strong>File:</strong> ${escapeHtml(data.fileName)}</p>
                <p><strong>Quote Code:</strong> ${escapeHtml(data.quoteCode)}</p>
                <p><strong>Uploaded:</strong> ${escapeHtml(data.uploadTime)}</p>
            </div>

            ${data.downloadUrl ? `<a href="${data.downloadUrl}" class="button">Download Document</a>` : '<p>The document has been saved to your secure storage.</p>'}

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
    const corsHeaders = getCorsHeaders(req)

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
            docType,
            fileName,
            mimeType,
            fileBase64,
        } = body

        if (!quoteCode || !docType || !fileBase64) {
            return new Response(
                JSON.stringify({ error: 'Missing required fields: quoteCode, docType, fileBase64' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!QUOTE_CODE_RE.test(quoteCode)) {
            return new Response(
                JSON.stringify({ error: 'Invalid quote code' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!ALLOWED_DOC_TYPES.has(docType)) {
            return new Response(
                JSON.stringify({ error: 'Unsupported document type' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!ALLOWED_MIME_TYPES.has(mimeType || '')) {
            return new Response(
                JSON.stringify({ error: 'Unsupported file type' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (!/^[A-Za-z0-9+/=]+$/.test(fileBase64)) {
            return new Response(
                JSON.stringify({ error: 'Invalid file payload' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const estimatedSize = (fileBase64.length * 3) / 4
        if (estimatedSize > MAX_FILE_SIZE_BYTES) {
            return new Response(
                JSON.stringify({ error: 'File too large. Maximum size is 10MB.' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const { data: link, error: linkError } = await supabaseAdmin
            .from('quote_links')
            .select('user_id, quote_data, lo_info')
            .eq('code', quoteCode)
            .maybeSingle()

        if (linkError || !link?.user_id) {
            return new Response(
                JSON.stringify({ error: 'Quote not found' }),
                { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        if (link.quote_data?.linkOptions?.showDocUpload === false) {
            return new Response(
                JSON.stringify({ error: 'Document uploads are disabled for this quote' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const loUserId = link.user_id
        const { data: existingFiles } = await supabaseAdmin
            .storage
            .from('doc-uploads')
            .list(`${loUserId}/${quoteCode.toLowerCase()}`, { limit: MAX_UPLOADS_PER_QUOTE + 1 })

        if ((existingFiles || []).length >= MAX_UPLOADS_PER_QUOTE) {
            return new Response(
                JSON.stringify({ error: 'Upload limit reached for this quote' }),
                { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('full_name, notification_email, email')
            .eq('id', loUserId)
            .maybeSingle()

        const binaryString = atob(fileBase64)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i)
        }

        const safeFileName = normalizeText(fileName || 'document', 120)
        const ext = sanitizeExtension(safeFileName)
        const timestamp = Date.now()
        const storagePath = `${loUserId}/${quoteCode.toLowerCase()}/${docType}_${timestamp}.${ext}`

        const { data: uploadData, error: uploadError } = await supabaseAdmin
            .storage
            .from('doc-uploads')
            .upload(storagePath, bytes, {
                contentType: mimeType || 'application/octet-stream',
                upsert: false,
            })

        if (uploadError) {
            console.error('Storage upload error:', uploadError)
            if (!uploadError.message?.includes('not found') && uploadError.statusCode !== '404') {
                return new Response(
                    JSON.stringify({ error: 'Failed to upload file: ' + uploadError.message }),
                    { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
        }

        let downloadUrl = ''
        if (uploadData) {
            const { data: signedUrl } = await supabaseAdmin
                .storage
                .from('doc-uploads')
                .createSignedUrl(storagePath, 7 * 24 * 60 * 60)
            downloadUrl = signedUrl?.signedUrl || ''
        }

        const docTypeLabel = DOC_TYPE_LABELS[docType] || docType
        const resendKey = Deno.env.get('RESEND_API_KEY')
        const targetEmail = profile?.notification_email || profile?.email || Deno.env.get('ALERT_TO_EMAIL') || ''
        const loName = normalizeText(profile?.full_name || link.lo_info?.name || 'Loan Officer')
        const clientName = normalizeText(link.quote_data?.clientName || 'A client')

        if (resendKey && targetEmail) {
            try {
                const emailHtml = EMAIL_TEMPLATE({
                    loName,
                    clientName,
                    docTypeLabel,
                    fileName: safeFileName || 'document',
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
                        subject: `${clientName || 'Client'} uploaded ${docTypeLabel} - Quote ${quoteCode}`,
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

        try {
            await supabaseAdmin
                .from('notification_logs')
                .insert({
                    user_id: loUserId,
                    notification_type: 'doc_upload',
                    recipient: targetEmail,
                    subject: `Document uploaded: ${docTypeLabel}`,
                    content: JSON.stringify({ docType, fileName: safeFileName, quoteCode, storagePath, downloadUrl }),
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
