// Edge Function: Handle GoHighLevel Webhooks
// Receives webhooks from GHL and syncs to Carbon

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getWebhookCorsHeaders } from '../_shared/cors.ts'

const corsHeaders = getWebhookCorsHeaders()

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const payload = await req.json()
    const signature = req.headers.get('X-GHL-Signature')
    
    // Verify webhook signature (if configured)
    // const isValid = verifyGHLSignature(payload, signature)
    // if (!isValid) throw new Error('Invalid webhook signature')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Process based on event type
    const eventType = payload.type || payload.event
    
    switch (eventType) {
      case 'ContactCreate':
      case 'ContactUpdate':
        await handleContactUpsert(supabase, payload)
        break
      case 'ContactDelete':
        await handleContactDelete(supabase, payload)
        break
      case 'OpportunityCreate':
      case 'OpportunityUpdate':
        await handleOpportunityUpdate(supabase, payload)
        break
      case 'OpportunityStatusUpdate':
        await handleOpportunityStatusChange(supabase, payload)
        break
      default:
        // Unhandled event type — ignored
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function handleContactUpsert(supabase: any, payload: any) {
  const contact = payload.contact || payload
  const locationId = contact.locationId || payload.locationId
  
  // Find the user with this GHL integration (uses user_integrations table)
  const { data: integrations } = await supabase
    .from('user_integrations')
    .select('user_id, metadata')
    .eq('provider', 'ghl')
    .eq('is_active', true)

  // Match by location ID in metadata
  const integration = (integrations || []).find((i: any) =>
    i.metadata?.location_id === locationId || i.metadata?.ghl_location_id === locationId
  ) || (integrations && integrations.length === 1 ? integrations[0] : null)

  if (!integration) {
    // No active GHL integration for this location
    return
  }

  // Map GHL contact to Carbon lead format
  const customFields = contact.customFields || {}
  const config = integration.metadata || {}
  const fieldMappings = config.field_mappings || {}
  
  const leadData: Record<string, any> = {
    user_id: integration.user_id,
    crm_contact_id: contact.id,
    crm_source: 'ghl',
    source: 'ghl',
    first_name: contact.firstName || '',
    last_name: contact.lastName || '',
    email: contact.email,
    phone: contact.phone,
    status: 'new',
    stage: 'new',
    metadata: {
      address: contact.address1,
      city: contact.city,
      state: contact.state,
      zip: contact.postalCode,
      credit_score: customFields[fieldMappings.credit_score || 'credit_score'] || null,
      home_value: parseFloat(customFields[fieldMappings.home_value || 'home_value']) || null,
      mortgage_balance: parseFloat(customFields[fieldMappings.mortgage_balance || 'mortgage_balance']) || null,
      loan_amount: parseFloat(customFields[fieldMappings.loan_amount || 'loan_amount']) || null,
      interest_rate: parseFloat(customFields[fieldMappings.interest_rate || 'interest_rate']) || null,
      ghl_location_id: locationId,
      raw: contact
    }
  }

  // Check if lead already exists by crm_contact_id or email
  const { data: existingLead } = await supabase
    .from('leads')
    .select('id')
    .eq('crm_contact_id', contact.id)
    .eq('crm_source', 'ghl')
    .single()

  if (existingLead) {
    // Update existing lead — don't overwrite status/stage
    delete leadData.status
    delete leadData.stage
    const { error } = await supabase
      .from('leads')
      .update(leadData)
      .eq('id', existingLead.id)

    if (error) throw error
    // Lead updated from GHL
  } else {
    // Create new lead
    const { data: newLead, error } = await supabase
      .from('leads')
      .insert(leadData)
      .select()
      .single()

    if (error) throw error
    // New lead created from GHL
  }
}

async function handleContactDelete(supabase: any, payload: any) {
  const contactId = payload.contactId || payload.id
  
  // Soft delete - mark as deleted in Carbon
  const { error } = await supabase
    .from('leads')
    .update({
      status: 'lost',
      notes: 'Deleted in GHL',
      sync_status: 'synced',
      updated_at: new Date().toISOString()
    })
    .eq('crm_contact_id', contactId)
    .eq('crm_source', 'ghl')

  if (error) throw error
  // Lead soft-deleted (deleted in GHL)
}

async function handleOpportunityUpdate(supabase: any, payload: any) {
  const opportunity = payload.opportunity || payload
  const contactId = opportunity.contactId || opportunity.contact_id
  
  if (!contactId) return

  // Find the lead
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, status')
    .eq('crm_contact_id', contactId)
    .eq('crm_source', 'ghl')
    .single()

  if (leadError || !lead) {
    // Lead not found for GHL opportunity
    return
  }

  // Map GHL pipeline stage to Carbon status
  const stageMapping: Record<string, string> = {
    'new': 'new',
    'contacted': 'contacted',
    'quoted': 'quoted',
    'application': 'application_sent',
    'underwriting': 'in_underwriting',
    'approved': 'approved',
    'funded': 'funded',
    'lost': 'lost'
  }

  const newStatus = stageMapping[opportunity.stage || opportunity.status] || lead.status

  // Update lead status
  const { error } = await supabase
    .from('leads')
    .update({
      status: newStatus,
      loan_amount: opportunity.value || opportunity.amount,
      crm_pipeline_id: opportunity.pipelineId,
      crm_stage_id: opportunity.stageId,
      sync_status: 'synced',
      updated_at: new Date().toISOString()
    })
    .eq('id', lead.id)

  if (error) throw error
  // Lead status updated from GHL opportunity
}

async function handleOpportunityStatusChange(supabase: any, payload: any) {
  // Similar to handleOpportunityUpdate but specific to status changes
  await handleOpportunityUpdate(supabase, payload)
}
