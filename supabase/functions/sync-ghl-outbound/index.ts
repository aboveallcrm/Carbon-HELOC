// Edge Function: Sync Carbon Leads to GoHighLevel
// Processes sync queue and pushes updates to GHL

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GHL_API_BASE = 'https://rest.gohighlevel.com/v1'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get pending sync items for GHL
    const { data: syncItems, error: fetchError } = await supabase
      .from('crm_sync_queue')
      .select(`
        *,
        lead:lead_id (*),
        integration:crm_integration_id (*)
      `)
      .eq('status', 'pending')
      .eq('integration.crm_type', 'ghl')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(10)

    if (fetchError) throw fetchError

    const results = []

    for (const item of syncItems || []) {
      try {
        const result = await processSyncItem(supabase, item)
        results.push(result)
      } catch (error) {
        console.error('Sync item failed:', item.id, error)
        
        // Update queue item with error
        await supabase
          .from('crm_sync_queue')
          .update({
            status: item.retry_count >= item.max_retries ? 'failed' : 'retrying',
            retry_count: item.retry_count + 1,
            error_message: error.message,
            processed_at: new Date().toISOString()
          })
          .eq('id', item.id)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        processed: results.length,
        results 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Sync error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function processSyncItem(supabase: any, item: any) {
  const lead = item.lead
  const integration = item.integration
  
  if (!lead || !integration) {
    throw new Error('Missing lead or integration data')
  }

  // Get API key from config
  const apiKey = integration.config?.api_key
  if (!apiKey) {
    throw new Error('GHL API key not configured')
  }

  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  }

  let result

  switch (item.operation) {
    case 'create':
      result = await createGHLContact(headers, lead, integration)
      break
    case 'update':
      result = await updateGHLContact(headers, lead, integration)
      break
    case 'delete':
      result = await deleteGHLContact(headers, lead, integration)
      break
    default:
      throw new Error(`Unknown operation: ${item.operation}`)
  }

  // Update sync queue item
  await supabase
    .from('crm_sync_queue')
    .update({
      status: 'completed',
      processed_at: new Date().toISOString(),
      error_message: null
    })
    .eq('id', item.id)

  // Update lead sync status
  await supabase
    .from('leads')
    .update({
      sync_status: 'synced',
      last_sync_at: new Date().toISOString(),
      external_id: result.contact?.id || lead.external_id
    })
    .eq('id', lead.id)

  return { itemId: item.id, operation: item.operation, success: true }
}

async function createGHLContact(headers: any, lead: any, integration: any) {
  const fieldMappings = integration.field_mappings || {}
  
  const contactData = {
    firstName: lead.name?.split(' ')[0] || '',
    lastName: lead.name?.split(' ').slice(1).join(' ') || '',
    email: lead.email,
    phone: lead.phone,
    address1: lead.address,
    city: lead.city,
    state: lead.state,
    postalCode: lead.zip,
    customFields: [
      {
        id: fieldMappings.credit_score || 'credit_score',
        field_value: lead.credit_score
      },
      {
        id: fieldMappings.home_value || 'home_value',
        field_value: lead.home_value?.toString()
      },
      {
        id: fieldMappings.mortgage_balance || 'mortgage_balance',
        field_value: lead.mortgage_balance?.toString()
      },
      {
        id: fieldMappings.heloc_status || 'heloc_status',
        field_value: lead.status
      },
      {
        id: fieldMappings.loan_amount || 'loan_amount',
        field_value: lead.loan_amount?.toString()
      },
      {
        id: fieldMappings.interest_rate || 'interest_rate',
        field_value: lead.interest_rate?.toString()
      }
    ]
  }

  const response = await fetch(`${GHL_API_BASE}/contacts/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(contactData)
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`GHL API error: ${error}`)
  }

  const data = await response.json()
  
  // Create opportunity if pipeline is configured
  if (integration.config?.pipeline_id && integration.config?.stage_id) {
    await createGHLOpportunity(headers, data.contact.id, lead, integration)
  }

  return data
}

async function updateGHLContact(headers: any, lead: any, integration: any) {
  if (!lead.external_id) {
    // No external ID - create instead
    return createGHLContact(headers, lead, integration)
  }

  const fieldMappings = integration.field_mappings || {}
  
  const contactData = {
    firstName: lead.name?.split(' ')[0] || '',
    lastName: lead.name?.split(' ').slice(1).join(' ') || '',
    email: lead.email,
    phone: lead.phone,
    address1: lead.address,
    city: lead.city,
    state: lead.state,
    postalCode: lead.zip,
    customFields: [
      {
        id: fieldMappings.credit_score || 'credit_score',
        field_value: lead.credit_score
      },
      {
        id: fieldMappings.home_value || 'home_value',
        field_value: lead.home_value?.toString()
      },
      {
        id: fieldMappings.mortgage_balance || 'mortgage_balance',
        field_value: lead.mortgage_balance?.toString()
      },
      {
        id: fieldMappings.heloc_status || 'heloc_status',
        field_value: lead.status
      },
      {
        id: fieldMappings.loan_amount || 'loan_amount',
        field_value: lead.loan_amount?.toString()
      },
      {
        id: fieldMappings.interest_rate || 'interest_rate',
        field_value: lead.interest_rate?.toString()
      }
    ]
  }

  const response = await fetch(`${GHL_API_BASE}/contacts/${lead.external_id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(contactData)
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`GHL API error: ${error}`)
  }

  const data = await response.json()
  
  // Update opportunity if exists
  await updateGHLOpportunity(headers, lead.external_id, lead, integration)

  return data
}

async function deleteGHLContact(headers: any, lead: any, integration: any) {
  if (!lead.external_id) {
    return { success: true, message: 'No external ID to delete' }
  }

  const response = await fetch(`${GHL_API_BASE}/contacts/${lead.external_id}`, {
    method: 'DELETE',
    headers
  })

  if (!response.ok && response.status !== 404) {
    const error = await response.text()
    throw new Error(`GHL API error: ${error}`)
  }

  return { success: true }
}

async function createGHLOpportunity(headers: any, contactId: string, lead: any, integration: any) {
  const opportunityData = {
    name: `HELOC - ${lead.name}`,
    pipelineId: integration.config.pipeline_id,
    stageId: integration.config.stage_id,
    status: 'open',
    contactId: contactId,
    value: lead.loan_amount || 0
  }

  const response = await fetch(`${GHL_API_BASE}/opportunities/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(opportunityData)
  })

  if (!response.ok) {
    console.error('Failed to create GHL opportunity:', await response.text())
    return null
  }

  return await response.json()
}

async function updateGHLOpportunity(headers: any, contactId: string, lead: any, integration: any) {
  // Find opportunity by contact ID
  const searchResponse = await fetch(
    `${GHL_API_BASE}/opportunities/?contactId=${contactId}`,
    { headers }
  )

  if (!searchResponse.ok) return null

  const opportunities = await searchResponse.json()
  
  if (!opportunities.opportunities?.length) return null

  const opportunity = opportunities.opportunities[0]

  // Map Carbon status to GHL stage
  const stageMapping: Record<string, string> = integration.config?.stage_mappings || {
    'new': integration.config?.stage_id,
    'quote_sent': integration.config?.stage_id,
    'funded': integration.config?.won_stage_id
  }

  const updateData = {
    stageId: stageMapping[lead.status] || opportunity.stageId,
    status: lead.status === 'funded' ? 'won' : lead.status === 'lost' ? 'lost' : 'open',
    value: lead.loan_amount || opportunity.value
  }

  const response = await fetch(`${GHL_API_BASE}/opportunities/${opportunity.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(updateData)
  })

  if (!response.ok) {
    console.error('Failed to update GHL opportunity:', await response.text())
  }

  return await response.json()
}
