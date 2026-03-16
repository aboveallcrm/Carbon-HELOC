import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const url = new URL(req.url);
    const userId = url.searchParams.get('user_id');

    let payload;
    try {
      payload = await req.json()
    } catch(e) {
      payload = {}
    }

    const contact = payload; 
    
    // GHL Contact ID
    const contactId = contact.id || contact.contact_id || null;
    
    // Fallback logic to grab GHL's flat data payload format
    const firstName = contact.first_name || contact.firstName || '';
    const lastName = contact.last_name || contact.lastName || '';
    let name = `${firstName} ${lastName}`.trim() || contact.name || contact.full_name || 'GHL Lead';
    
    const email = contact.email || '';
    const phone = contact.phone || '';
    
    const row: any = {
      name: name,
      email: email,
      mobile_phone: phone,
      street: contact.address1 || contact.address || '',
      city: contact.city || '',
      state: contact.state || '',
      zip: contact.postalCode || contact.zipCode || contact.zip || '',
      status: contact.pipeline_stage || contact.status || 'Not Contacted',
      campaign_tag: 'GHL',
      source: 'GHL Webhook',
      ghl_contact_id: contactId
    };

    if (userId) {
      row.user_id = userId;
    }
    
    let existingRecord = null;
    if (contactId) {
        const { data } = await supabase.from('reactivation_clients').select('id').eq('ghl_contact_id', contactId).maybeSingle();
        if (data) existingRecord = data;
    }
    if (!existingRecord && row.email) {
       const { data } = await supabase.from('reactivation_clients').select('id').eq('email', row.email).maybeSingle();
       if (data) existingRecord = data;
    }

    let finalResult;
    if (existingRecord) {
        const { data, error } = await supabase
          .from('reactivation_clients')
          .update(row)
          .eq('id', existingRecord.id)
          .select();
        
        if (error) throw error;
        finalResult = data;
    } else {
        const { data, error } = await supabase
          .from('reactivation_clients')
          .insert([row])
          .select();
        
        if (error) throw error;
        finalResult = data;
    }

    return new Response(JSON.stringify({ success: true, message: "GHL Lead processed successfully", data: finalResult }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
    
  } catch (error: any) {
    console.error("Webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
