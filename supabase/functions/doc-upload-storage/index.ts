/**
 * Document Upload with Supabase Storage
 * Stores uploaded documents securely with proper organization
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Authenticate via JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    const { fileData, fileName, fileType, docType, quoteId, leadId } = await req.json()
    const userId = user.id  // Use authenticated user ID, not from request body

    if (!fileData || !fileName || !docType) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Decode base64 file
    const binaryData = Uint8Array.from(atob(fileData), c => c.charCodeAt(0))

    // Generate organized file path: userId/quoteId/docType/timestamp_filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_')
    const filePath = `${userId}/${quoteId || 'general'}/${docType}/${timestamp}_${safeFileName}`

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseClient
      .storage
      .from('loan-documents')
      .upload(filePath, binaryData, {
        contentType: fileType || 'application/octet-stream',
        upsert: false
      })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return new Response(
        JSON.stringify({ error: 'Failed to upload document', details: uploadError }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
      )
    }

    // Get signed URL (24 hour expiry) — loan documents should NOT be public
    const { data: signedUrlData, error: signedUrlError } = await supabaseClient
      .storage
      .from('loan-documents')
      .createSignedUrl(filePath, 86400) // 24 hours
    const publicUrl = signedUrlData?.signedUrl || ''

    // Store document metadata in database
    const { data: docRecord, error: dbError } = await supabaseClient
      .from('loan_documents')
      .insert({
        user_id: userId,
        quote_id: quoteId,
        lead_id: leadId,
        doc_type: docType,
        file_name: fileName,
        file_path: filePath,
        file_url: publicUrl,
        file_size: binaryData.length,
        mime_type: fileType,
        status: 'uploaded',
        uploaded_at: new Date().toISOString()
      })
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      // Don't fail if DB insert fails - file is still uploaded
    }

    // Log activity
    await supabaseClient.from('activity_logs').insert({
      user_id: userId,
      action: 'document_uploaded',
      entity_type: 'document',
      entity_id: docRecord?.id,
      metadata: { docType, fileName, quoteId }
    })

    return new Response(
      JSON.stringify({
        success: true,
        documentId: docRecord?.id,
        fileUrl: publicUrl,
        filePath: filePath,
        message: 'Document uploaded successfully'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
