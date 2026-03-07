/**
 * Deal Radar - Edge Function
 * Scans leads for HELOC equity opportunities using metadata
 * (home_value, mortgage_balance, credit_score)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResp(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate caller via JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResp({ error: 'Missing authorization header' }, 401);
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
    if (authError || !user) {
      return jsonResp({ error: 'Invalid or expired token' }, 401);
    }

    const { action } = await req.json();
    const userId = user.id;

    switch (action) {
      case 'full_scan':
        return jsonResp(await runFullScan(supabaseClient, userId));
      case 'get_dashboard':
        return jsonResp(await getDashboard(supabaseClient, userId));
      default:
        return jsonResp({ error: 'Unknown action. Use full_scan or get_dashboard.' }, 400);
    }
  } catch (error) {
    console.error('deal-radar error:', error instanceof Error ? error.message : error);
    return jsonResp({ error: 'Internal error' }, 500);
  }
});

interface Opportunity {
  lead_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  home_value: number;
  mortgage_balance: number;
  credit_score: number;
  tappable_equity: number;
  cltv: number;
  estimated_rate: number;
  strategy: string;
}

async function runFullScan(supabaseClient: any, userId: string) {
  const startTime = Date.now();

  // Fetch all leads with mortgage metadata
  const { data: leads, error } = await supabaseClient
    .from('leads')
    .select('id, first_name, last_name, email, phone, metadata, status')
    .eq('user_id', userId);

  if (error) throw new Error('Failed to fetch leads');

  const opportunities: Opportunity[] = [];

  for (const lead of (leads || [])) {
    const meta = lead.metadata || {};

    // Parse numeric values from metadata (stored as strings)
    const homeValue = parseFloat(meta.home_value || meta.property_value || '0');
    const mortgageBalance = parseFloat(meta.mortgage_balance || meta.loan_amount || '0');
    const creditScore = parseInt(meta.credit_score || '0', 10);

    // Skip leads without enough property data
    if (!homeValue || homeValue < 50000) continue;

    // Calculate tappable equity (85% CLTV max)
    const maxLoanAmount = homeValue * 0.85;
    const tappableEquity = Math.max(0, maxLoanAmount - mortgageBalance);

    // Only flag opportunities >= $25k
    if (tappableEquity < 25000) continue;

    const cltv = homeValue > 0
      ? ((mortgageBalance + tappableEquity) / homeValue) * 100
      : 0;

    opportunities.push({
      lead_id: lead.id,
      first_name: lead.first_name || '',
      last_name: lead.last_name || '',
      email: lead.email,
      phone: lead.phone,
      home_value: homeValue,
      mortgage_balance: mortgageBalance,
      credit_score: creditScore,
      tappable_equity: tappableEquity,
      cltv: Math.round(cltv * 100) / 100,
      estimated_rate: estimateRate(creditScore || 700, cltv),
      strategy: `Recommend ${formatCurrency(tappableEquity)} HELOC — ${
        tappableEquity > 100000 ? 'major renovation or investment' :
        tappableEquity > 50000 ? 'debt consolidation or home improvement' :
        'emergency fund or small project'
      }`,
    });
  }

  // Sort by tappable equity descending
  opportunities.sort((a, b) => b.tappable_equity - a.tappable_equity);

  const totalTappableEquity = opportunities.reduce((s, o) => s + o.tappable_equity, 0);

  return {
    success: true,
    leads_scanned: leads?.length || 0,
    opportunities_found: opportunities.length,
    total_tappable_equity: totalTappableEquity,
    scan_duration_ms: Date.now() - startTime,
    opportunities: opportunities.slice(0, 50),
  };
}

async function getDashboard(supabaseClient: any, userId: string) {
  // Run a lightweight scan and return summary
  const result = await runFullScan(supabaseClient, userId);

  return {
    total_opportunities: result.opportunities_found,
    total_tappable_equity: result.total_tappable_equity,
    top_opportunities: result.opportunities.slice(0, 5).map((o: Opportunity) => ({
      lead_id: o.lead_id,
      name: `${o.first_name} ${o.last_name}`.trim(),
      equity: o.tappable_equity,
      rate: o.estimated_rate,
      strategy: o.strategy,
    })),
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
