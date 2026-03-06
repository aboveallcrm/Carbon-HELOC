/**
 * Deal Radar - Edge Function
 * Scans for equity opportunities
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, loanOfficerId } = await req.json();

    if (!loanOfficerId) {
      return new Response(
        JSON.stringify({ error: 'loanOfficerId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    let result;

    switch (action) {
      case 'full_scan':
        result = await runFullScan(supabaseClient, loanOfficerId);
        break;
      case 'get_dashboard':
        result = await getDashboard(supabaseClient, loanOfficerId);
        break;
      default:
        result = { error: 'Unknown action' };
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function runFullScan(supabaseClient: any, loanOfficerId: string) {
  const startTime = Date.now();
  
  // Get borrowers with properties
  const { data: borrowers, error } = await supabaseClient
    .from('borrowers')
    .select(`
      id,
      first_name,
      last_name,
      credit_score,
      properties (
        id,
        estimated_value
      ),
      mortgages (
        loan_balance,
        lien_position
      )
    `)
    .eq('loan_officer_id', loanOfficerId)
    .eq('status', 'active');

  if (error) throw error;

  let opportunitiesFound = 0;
  let totalTappableEquity = 0;

  // Clear old opportunities
  await supabaseClient
    .from('deal_radar')
    .delete()
    .eq('loan_officer_id', loanOfficerId)
    .eq('status', 'new');

  // Analyze each borrower
  for (const borrower of borrowers || []) {
    const property = borrower.properties?.[0];
    if (!property?.estimated_value) continue;

    const activeMortgages = (borrower.mortgages || []).filter((m: any) => m.loan_balance > 0);
    const totalLiens = activeMortgages.reduce((sum: number, m: any) => sum + m.loan_balance, 0);
    
    const maxTotalLoans = property.estimated_value * 0.85;
    const tappableEquity = Math.max(0, maxTotalLoans - totalLiens);
    
    if (tappableEquity >= 25000) {
      const cltv = ((totalLiens + tappableEquity) / property.estimated_value) * 100;
      
      await supabaseClient.from('deal_radar').insert({
        borrower_id: borrower.id,
        property_id: property.id,
        loan_officer_id: loanOfficerId,
        opportunity_type: 'heloc',
        tappable_equity: tappableEquity,
        current_combined_ltv: cltv,
        estimated_rate: estimateRate(borrower.credit_score || 700, cltv),
        suggested_strategy: `Recommend ${formatCurrency(tappableEquity)} HELOC for debt consolidation or emergency fund`,
        confidence_score: 0.85,
        qualification_status: 'qualified'
      });
      
      opportunitiesFound++;
      totalTappableEquity += tappableEquity;
    }
  }

  // Log scan
  await supabaseClient.from('deal_radar_scans').insert({
    loan_officer_id: loanOfficerId,
    scan_type: 'full',
    borrowers_scanned: borrowers?.length || 0,
    opportunities_found: opportunitiesFound,
    total_tappable_equity: totalTappableEquity,
    scan_duration_ms: Date.now() - startTime
  });

  return {
    success: true,
    borrowersScanned: borrowers?.length || 0,
    opportunitiesFound,
    totalTappableEquity
  };
}

async function getDashboard(supabaseClient: any, loanOfficerId: string) {
  const { data: opportunities } = await supabaseClient
    .from('deal_radar')
    .select('*')
    .eq('loan_officer_id', loanOfficerId)
    .eq('status', 'new')
    .gt('expires_at', new Date().toISOString());

  const byType: Record<string, number> = {};
  opportunities?.forEach((o: any) => {
    byType[o.opportunity_type] = (byType[o.opportunity_type] || 0) + 1;
  });

  return {
    total_opportunities: opportunities?.length || 0,
    total_tappable_equity: opportunities?.reduce((s: number, o: any) => s + (o.tappable_equity || 0), 0) || 0,
    by_type: byType,
    top_opportunities: opportunities?.slice(0, 5).map((o: any) => ({
      id: o.id,
      type: o.opportunity_type,
      equity: o.tappable_equity,
      confidence: o.confidence_score
    })) || []
  };
}

function estimateRate(creditScore: number, cltv: number): number {
  let rate = 8.5;
  if (creditScore >= 760) rate -= 1.0;
  else if (creditScore >= 740) rate -= 0.75;
  else if (creditScore >= 720) rate -= 0.5;
  if (cltv > 80) rate += 0.5;
  return Math.round(rate * 100) / 100;
}

function formatCurrency(amount: number): string {
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}k`;
  return `$${amount}`;
}
