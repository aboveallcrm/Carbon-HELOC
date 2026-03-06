/**
 * Deal Radar - Equity Opportunity Scanner
 * 
 * Scans borrower database for:
 * - HELOC opportunities
 * - Cash-out refinance opportunities
 * - Debt consolidation opportunities
 * - Rate reduction opportunities
 * 
 * Returns scored, ranked opportunities with AI-generated recommendations
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// HELOC Program Guidelines
const PROGRAM_GUIDELINES = {
  heloc: {
    maxLTV: 85,
    minCreditScore: 680,
    maxDTI: 50,
    minLoanAmount: 25000,
    maxLoanAmount: 500000,
    rateRange: { min: 7.5, max: 12.0 },
  },
  cashOutRefi: {
    maxLTV: 80,
    minCreditScore: 620,
    maxDTI: 45,
    minLoanAmount: 50000,
  },
  rateReduction: {
    minRateImprovement: 0.5, // At least 0.5% rate reduction
    maxLTV: 80,
  },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { action, loanOfficerId, borrowerId, filters } = await req.json();

    if (!loanOfficerId) {
      return new Response(
        JSON.stringify({ error: 'loanOfficerId is required' }),
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
      case 'scan_borrower':
        if (!borrowerId) throw new Error('borrowerId required for single borrower scan');
        result = await scanSingleBorrower(supabaseClient, loanOfficerId, borrowerId);
        break;
      case 'get_dashboard':
        result = await getDashboard(supabaseClient, loanOfficerId);
        break;
      case 'get_opportunities':
        result = await getOpportunities(supabaseClient, loanOfficerId, filters);
        break;
      case 'analyze_with_ai':
        result = await analyzeWithAI(supabaseClient, loanOfficerId, borrowerId);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Deal Radar Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================
// FULL DATABASE SCAN
// ============================================
async function runFullScan(supabaseClient: any, loanOfficerId: string) {
  const startTime = Date.now();
  console.log(`Starting Deal Radar scan for loan officer: ${loanOfficerId}`);

  // Get all borrowers with their properties and mortgages
  const { data: borrowers, error } = await supabaseClient
    .from('borrowers')
    .select(`
      id,
      first_name,
      last_name,
      credit_score,
      debt_to_income_ratio,
      annual_income,
      properties (
        id,
        estimated_value,
        occupancy_type,
        state
      ),
      mortgages (
        id,
        loan_balance,
        interest_rate,
        rate_type,
        lien_position,
        monthly_payment,
        status
      )
    `)
    .eq('loan_officer_id', loanOfficerId)
    .eq('status', 'active');

  if (error) throw error;

  let opportunitiesFound = 0;
  const opportunitiesByType: Record<string, number> = {};
  let totalTappableEquity = 0;

  // Clear old opportunities (keep converted/declined)
  await supabaseClient
    .from('deal_radar')
    .delete()
    .eq('loan_officer_id', loanOfficerId)
    .in('status', ['new', 'reviewed', 'expired']);

  // Analyze each borrower
  for (const borrower of borrowers || []) {
    const opportunities = await analyzeBorrower(supabaseClient, borrower, loanOfficerId);
    
    for (const opp of opportunities) {
      await supabaseClient.from('deal_radar').insert(opp);
      opportunitiesFound++;
      opportunitiesByType[opp.opportunity_type] = (opportunitiesByType[opp.opportunity_type] || 0) + 1;
      totalTappableEquity += opp.tappable_equity || 0;
    }
  }

  // Log the scan
  const duration = Date.now() - startTime;
  await supabaseClient.from('deal_radar_scans').insert({
    loan_officer_id: loanOfficerId,
    scan_type: 'full',
    borrowers_scanned: borrowers?.length || 0,
    opportunities_found: opportunitiesFound,
    opportunities_by_type: opportunitiesByType,
    total_tappable_equity: totalTappableEquity,
    scan_duration_ms: duration,
    triggered_by: 'manual',
  });

  console.log(`Scan complete: ${opportunitiesFound} opportunities found in ${duration}ms`);

  return {
    success: true,
    borrowersScanned: borrowers?.length || 0,
    opportunitiesFound,
    opportunitiesByType,
    totalTappableEquity,
    duration,
  };
}

// ============================================
// ANALYZE SINGLE BORROWER
// ============================================
async function scanSingleBorrower(supabaseClient: any, loanOfficerId: string, borrowerId: string) {
  const { data: borrower, error } = await supabaseClient
    .from('borrowers')
    .select(`
      id,
      first_name,
      last_name,
      credit_score,
      debt_to_income_ratio,
      annual_income,
      properties (
        id,
        estimated_value,
        occupancy_type,
        state
      ),
      mortgages (
        id,
        loan_balance,
        interest_rate,
        rate_type,
        lien_position,
        monthly_payment,
        status
      )
    `)
    .eq('id', borrowerId)
    .eq('loan_officer_id', loanOfficerId)
    .single();

  if (error) throw error;
  if (!borrower) throw new Error('Borrower not found');

  // Clear existing opportunities for this borrower
  await supabaseClient
    .from('deal_radar')
    .delete()
    .eq('borrower_id', borrowerId);

  const opportunities = await analyzeBorrower(supabaseClient, borrower, loanOfficerId);
  
  for (const opp of opportunities) {
    await supabaseClient.from('deal_radar').insert(opp);
  }

  return {
    success: true,
    borrowerName: `${borrower.first_name} ${borrower.last_name}`,
    opportunitiesFound: opportunities.length,
    opportunities: opportunities.map(o => ({
      type: o.opportunity_type,
      tappableEquity: o.tappable_equity,
      confidence: o.confidence_score,
      strategy: o.suggested_strategy,
    })),
  };
}

// ============================================
// BORROWER ANALYSIS ENGINE
// ============================================
async function analyzeBorrower(supabaseClient: any, borrower: any, loanOfficerId: string): Promise<any[]> {
  const opportunities: any[] = [];
  
  if (!borrower.properties || borrower.properties.length === 0) {
    return opportunities;
  }

  for (const property of borrower.properties) {
    if (!property.estimated_value) continue;

    // Calculate total liens
    const activeMortgages = (borrower.mortgages || []).filter((m: any) => m.status === 'active');
    const totalLiens = activeMortgages.reduce((sum: number, m: any) => sum + (m.loan_balance || 0), 0);
    const firstMortgage = activeMortgages.find((m: any) => m.lien_position === 1);
    
    // Calculate CLTV
    const cltv = (totalLiens / property.estimated_value) * 100;
    
    // Calculate tappable equity (up to 85% LTV for HELOC)
    const maxTotalLoans = property.estimated_value * 0.85;
    const tappableEquity = Math.max(0, maxTotalLoans - totalLiens);
    
    // Calculate 80% LTV tappable equity (for cash-out refi)
    const maxTotalLoans80 = property.estimated_value * 0.80;
    const tappableEquity80 = Math.max(0, maxTotalLoans80 - totalLiens);

    // Skip if no tappable equity
    if (tappableEquity < 25000) continue;

    // Check qualifications
    const creditScore = borrower.credit_score || 0;
    const dti = borrower.debt_to_income_ratio || 0;
    const isQualified = creditScore >= 680 && dti <= 50;

    // 1. HELOC OPPORTUNITY
    if (tappableEquity >= 25000 && creditScore >= 680) {
      const estimatedRate = estimateHelocRate(creditScore, cltv);
      const helocAmount = Math.min(tappableEquity, 500000);
      const monthlyPayment = (helocAmount * (estimatedRate / 100)) / 12;

      opportunities.push({
        borrower_id: borrower.id,
        property_id: property.id,
        loan_officer_id: loanOfficerId,
        opportunity_type: 'heloc',
        estimated_equity: property.estimated_value - totalLiens,
        tappable_equity: tappableEquity,
        current_combined_ltv: cltv,
        max_allowed_ltv: 85,
        available_heloc_amount: helocAmount,
        estimated_rate: estimatedRate,
        estimated_monthly_payment: Math.round(monthlyPayment),
        suggested_strategy: generateHelocStrategy(borrower, property, helocAmount, estimatedRate),
        recommended_product: creditScore >= 740 ? 'Prime HELOC' : 'Standard HELOC',
        optimal_loan_amount: helocAmount,
        confidence_score: calculateConfidenceScore(borrower, property, 'heloc', cltv),
        qualification_status: isQualified ? 'qualified' : 'needs_review',
        required_credit_score: 680,
        required_dti: 50,
        status: 'new',
        ai_analysis: generateAIAnalysis(borrower, property, 'heloc', tappableEquity),
        ai_recommendations: {
          use_cases: ['Emergency fund', 'Home improvements', 'Debt consolidation', 'Investment opportunity'],
          talking_points: [
            `You have ${formatCurrency(tappableEquity)} in tappable equity`,
            `HELOC rate estimated at ${estimatedRate}%`,
            'Only pay interest on what you use',
          ],
        },
      });
    }

    // 2. CASH-OUT REFI OPPORTUNITY
    if (tappableEquity80 >= 50000 && firstMortgage && creditScore >= 620) {
      const currentRate = firstMortgage.interest_rate || 0;
      const marketRate = estimateMarketRate(creditScore, 80);
      
      // Only suggest if rate is competitive or equity need is high
      if (marketRate <= currentRate + 0.5 || tappableEquity80 >= 100000) {
        opportunities.push({
          borrower_id: borrower.id,
          property_id: property.id,
          loan_officer_id: loanOfficerId,
          opportunity_type: 'cash_out_refi',
          estimated_equity: property.estimated_value - totalLiens,
          tappable_equity: tappableEquity80,
          current_combined_ltv: cltv,
          max_allowed_ltv: 80,
          available_heloc_amount: null,
          estimated_rate: marketRate,
          estimated_monthly_payment: null, // Would need full calculation
          estimated_savings: currentRate > marketRate ? calculateSavings(firstMortgage, marketRate) : null,
          suggested_strategy: generateCashOutStrategy(borrower, property, tappableEquity80, firstMortgage),
          recommended_product: 'Cash-Out Refinance',
          optimal_loan_amount: Math.min(tappableEquity80, 250000),
          confidence_score: calculateConfidenceScore(borrower, property, 'cash_out_refi', cltv) * 0.9,
          qualification_status: creditScore >= 620 && dti <= 45 ? 'qualified' : 'needs_review',
          required_credit_score: 620,
          required_dti: 45,
          status: 'new',
          ai_analysis: generateAIAnalysis(borrower, property, 'cash_out_refi', tappableEquity80),
          ai_recommendations: {
            use_cases: ['Large cash need', 'Debt consolidation', 'Rate reduction + cash out'],
            talking_points: [
              `Access ${formatCurrency(tappableEquity80)} in cash`,
              currentRate > marketRate ? `Lower your rate from ${currentRate}% to ~${marketRate}%` : 'Competitive rates available',
              'Single loan payment vs. HELOC + mortgage',
            ],
          },
        });
      }
    }

    // 3. DEBT CONSOLIDATION OPPORTUNITY
    if (tappableEquity >= 50000 && dti > 36 && creditScore >= 680) {
      opportunities.push({
        borrower_id: borrower.id,
        property_id: property.id,
        loan_officer_id: loanOfficerId,
        opportunity_type: 'debt_consolidation',
        estimated_equity: property.estimated_value - totalLiens,
        tappable_equity: tappableEquity,
        current_combined_ltv: cltv,
        max_allowed_ltv: 85,
        available_heloc_amount: Math.min(tappableEquity, 200000),
        estimated_rate: estimateHelocRate(creditScore, cltv),
        estimated_monthly_payment: null,
        suggested_strategy: `Use HELOC to consolidate high-interest debt. Current DTI of ${dti}% can be reduced significantly by paying off credit cards and personal loans.`,
        recommended_product: 'HELOC for Debt Consolidation',
        optimal_loan_amount: Math.min(tappableEquity, 150000),
        confidence_score: calculateConfidenceScore(borrower, property, 'debt_consolidation', cltv) * 0.95,
        qualification_status: isQualified ? 'qualified' : 'needs_review',
        required_credit_score: 680,
        required_dti: 50,
        status: 'new',
        ai_analysis: generateAIAnalysis(borrower, property, 'debt_consolidation', tappableEquity),
        ai_recommendations: {
          use_cases: ['Credit card payoff', 'Personal loan consolidation', 'Improve cash flow'],
          talking_points: [
            `Reduce your monthly payments by consolidating debt`,
            `HELOC rates typically lower than credit cards`,
            `Potential tax advantages (consult tax advisor)`,
          ],
        },
      });
    }

    // 4. RATE REDUCTION OPPORTUNITY
    if (firstMortgage && firstMortgage.interest_rate > 6.5 && cltv <= 80 && creditScore >= 720) {
      const currentRate = firstMortgage.interest_rate;
      const marketRate = estimateMarketRate(creditScore, Math.min(cltv, 80));
      
      if (currentRate - marketRate >= 0.5) {
        const savings = calculateSavings(firstMortgage, marketRate);
        
        opportunities.push({
          borrower_id: borrower.id,
          property_id: property.id,
          loan_officer_id: loanOfficerId,
          opportunity_type: 'rate_reduction',
          estimated_equity: property.estimated_value - totalLiens,
          tappable_equity: 0, // Not taking cash out
          current_combined_ltv: cltv,
          max_allowed_ltv: 80,
          available_heloc_amount: null,
          estimated_rate: marketRate,
          estimated_monthly_payment: null,
          estimated_savings: savings,
          suggested_strategy: `Rate-and-term refinance to reduce monthly payment by ~${formatCurrency(savings.monthly)} without resetting loan term significantly.`,
          recommended_product: 'Rate Reduction Refinance',
          optimal_loan_amount: firstMortgage.loan_balance,
          confidence_score: calculateConfidenceScore(borrower, property, 'rate_reduction', cltv),
          qualification_status: 'qualified',
          required_credit_score: 720,
          required_dti: 45,
          status: 'new',
          ai_analysis: generateAIAnalysis(borrower, property, 'rate_reduction', 0),
          ai_recommendations: {
            use_cases: ['Lower monthly payment', 'Reduce total interest paid', 'Build equity faster'],
            talking_points: [
              `Save ${formatCurrency(savings.monthly)} per month`,
              `Save ${formatCurrency(savings.total)} over the life of the loan`,
              `No cash out - pure rate reduction`,
            ],
          },
        });
      }
    }
  }

  return opportunities;
}

// ============================================
// HELPER FUNCTIONS
// ============================================
function estimateHelocRate(creditScore: number, cltv: number): number {
  let baseRate = 8.5;
  
  // Credit score adjustments
  if (creditScore >= 760) baseRate -= 1.0;
  else if (creditScore >= 740) baseRate -= 0.75;
  else if (creditScore >= 720) baseRate -= 0.5;
  else if (creditScore >= 700) baseRate -= 0.25;
  else if (creditScore < 680) baseRate += 0.5;
  
  // CLTV adjustments
  if (cltv <= 70) baseRate -= 0.25;
  else if (cltv > 80) baseRate += 0.5;
  
  return Math.round(baseRate * 100) / 100;
}

function estimateMarketRate(creditScore: number, ltv: number): number {
  let baseRate = 6.5;
  
  if (creditScore >= 760) baseRate -= 0.5;
  else if (creditScore >= 740) baseRate -= 0.375;
  else if (creditScore >= 720) baseRate -= 0.25;
  
  if (ltv <= 60) baseRate -= 0.125;
  else if (ltv > 75) baseRate += 0.25;
  
  return Math.round(baseRate * 1000) / 1000;
}

function calculateSavings(mortgage: any, newRate: number): { monthly: number; total: number } {
  const balance = mortgage.loan_balance || 0;
  const currentRate = mortgage.interest_rate || 0;
  const term = 360; // 30 years
  
  const currentMonthly = (balance * (currentRate / 100 / 12)) / (1 - Math.pow(1 + currentRate / 100 / 12, -term));
  const newMonthly = (balance * (newRate / 100 / 12)) / (1 - Math.pow(1 + newRate / 100 / 12, -term));
  
  const monthlySavings = currentMonthly - newMonthly;
  const totalSavings = monthlySavings * term;
  
  return {
    monthly: Math.round(monthlySavings),
    total: Math.round(totalSavings),
  };
}

function calculateConfidenceScore(borrower: any, property: any, opportunityType: string, cltv: number): number {
  let score = 0.7; // Base score
  
  const creditScore = borrower.credit_score || 0;
  const dti = borrower.debt_to_income_ratio || 50;
  
  // Credit score factor
  if (creditScore >= 760) score += 0.15;
  else if (creditScore >= 740) score += 0.1;
  else if (creditScore >= 720) score += 0.05;
  else if (creditScore < 680) score -= 0.1;
  
  // DTI factor
  if (dti <= 36) score += 0.1;
  else if (dti <= 43) score += 0.05;
  else if (dti > 50) score -= 0.15;
  
  // CLTV factor
  if (cltv <= 60) score += 0.05;
  else if (cltv > 80) score -= 0.1;
  
  // Property value confidence
  if (property.estimated_value > 500000) score += 0.02;
  
  return Math.min(0.98, Math.max(0.3, score));
}

function generateHelocStrategy(borrower: any, property: any, amount: number, rate: number): string {
  const useCases = [];
  
  if (amount >= 100000) useCases.push('home improvements', 'investment opportunities');
  if (amount >= 50000) useCases.push('emergency fund', 'debt consolidation');
  if (amount >= 25000) useCases.push('short-term cash needs');
  
  return `Recommend ${formatCurrency(amount)} HELOC at estimated ${rate}%. ` +
    `Best used for: ${useCases.join(', ')}. ` +
    `Structure with 10-year draw period and 20-year repayment.`;
}

function generateCashOutStrategy(borrower: any, property: any, amount: number, firstMortgage: any): string {
  return `Recommend cash-out refinance to access ${formatCurrency(amount)} while ` +
    `${firstMortgage?.interest_rate > 7 ? 'potentially lowering rate from ' + firstMortgage.interest_rate + '%' : 'maintaining competitive rate'}. ` +
    `Consolidate first mortgage and cash-out into single loan.`;
}

function generateAIAnalysis(borrower: any, property: any, opportunityType: string, equity: number): string {
  const name = `${borrower.first_name} ${borrower.last_name}`;
  
  switch (opportunityType) {
    case 'heloc':
      return `${name} has strong equity position with ${formatCurrency(equity)} tappable. ` +
        `Credit score of ${borrower.credit_score} qualifies for tier 1 rates. ` +
        `Recommend HELOC as flexible safety net.`;
    case 'cash_out_refi':
      return `${name} has significant equity (${formatCurrency(equity)}) suitable for cash-out. ` +
        `Good candidate for consolidating debt or funding major expense.`;
    case 'debt_consolidation':
      return `${name}'s DTI of ${borrower.debt_to_income_ratio}% can be improved through ` +
        `HELOC debt consolidation. Strong equity supports this strategy.`;
    case 'rate_reduction':
      return `${name} has opportunity to reduce rate and monthly payment ` +
        `without extending loan term significantly.`;
    default:
      return `Analysis complete for ${name}.`;
  }
}

function formatCurrency(amount: number): string {
  if (!amount || amount === 0) return '$0';
  if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}k`;
  return `$${amount}`;
}

// ============================================
// DASHBOARD & LISTING FUNCTIONS
// ============================================
async function getDashboard(supabaseClient: any, loanOfficerId: string) {
  const { data, error } = await supabaseClient.rpc('get_deal_radar_dashboard', {
    p_loan_officer_id: loanOfficerId,
  });

  if (error) throw error;

  // Get recent scan info
  const { data: recentScan } = await supabaseClient
    .from('deal_radar_scans')
    .select('*')
    .eq('loan_officer_id', loanOfficerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return {
    dashboard: data,
    lastScan: recentScan || null,
  };
}

async function getOpportunities(supabaseClient: any, loanOfficerId: string, filters: any) {
  let query = supabaseClient
    .from('deal_radar')
    .select(`
      *,
      borrowers (first_name, last_name, credit_score),
      properties (address, city, state, estimated_value)
    `)
    .eq('loan_officer_id', loanOfficerId)
    .eq('status', filters?.status || 'new')
    .gt('expires_at', new Date().toISOString());

  if (filters?.type) {
    query = query.eq('opportunity_type', filters.type);
  }

  if (filters?.minEquity) {
    query = query.gte('tappable_equity', filters.minEquity);
  }

  if (filters?.minConfidence) {
    query = query.gte('confidence_score', filters.minConfidence);
  }

  const { data, error } = await query
    .order('priority_score', { ascending: false })
    .limit(filters?.limit || 50);

  if (error) throw error;

  return {
    opportunities: data,
    count: data?.length || 0,
  };
}

// ============================================
// AI ANALYSIS ENHANCEMENT
// ============================================
async function analyzeWithAI(supabaseClient: any, loanOfficerId: string, borrowerId: string) {
  // Get opportunity data
  const { data: opportunity, error } = await supabaseClient
    .from('deal_radar')
    .select(`
      *,
      borrowers (*),
      properties (*)
    `)
    .eq('borrower_id', borrowerId)
    .eq('loan_officer_id', loanOfficerId)
    .order('priority_score', { ascending: false })
    .limit(1)
    .single();

  if (error || !opportunity) {
    throw new Error('No opportunity found for analysis');
  }

  // This would call the ezra-chat Edge Function for AI enhancement
  // For now, return enhanced data
  return {
    opportunity,
    enhancedAnalysis: {
      riskFactors: [],
      competitiveAdvantages: [],
      recommendedApproach: opportunity.suggested_strategy,
      estimatedConversionProbability: opportunity.confidence_score,
    },
  };
}
