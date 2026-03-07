/**
 * Ezra AI Quote Builder
 * 
 * Transforms natural language into structured HELOC quotes
 * 
 * Example input:
 * "Build a HELOC quote for Maria Lopez, 150k cash out, property value 850k, 
 *  mortgage balance 420k, rate 8.25"
 * 
 * Output:
 * Complete quote structure with AUTO_FILL_FIELDS JSON
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { 
      message, 
      loanOfficerId, 
      conversationId,
      borrowerId,
      useAI = true 
    } = await req.json();

    if (!message || !loanOfficerId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: message, loanOfficerId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    // Step 1: Parse natural language
    const parsedData = parseNaturalLanguage(message);
    
    // Step 2: Look up borrower if name provided
    let borrowerData = null;
    if (parsedData.borrowerName && !borrowerId) {
      borrowerData = await lookupBorrower(supabaseClient, loanOfficerId, parsedData.borrowerName);
    } else if (borrowerId) {
      borrowerData = await getBorrowerById(supabaseClient, loanOfficerId, borrowerId);
    }

    // Step 3: Merge parsed data with borrower data
    const mergedData = mergeData(parsedData, borrowerData);

    // Step 4: Calculate missing fields
    const calculatedData = calculateQuoteFields(mergedData);

    // Step 5: Generate AI-enhanced quote (if enabled)
    let aiAnalysis = null;
    if (useAI) {
      aiAnalysis = await generateAIQuoteAnalysis(calculatedData);
    }

    // Step 6: Build final quote structure
    const quote = buildQuoteStructure(calculatedData, aiAnalysis);

    // Step 7: Save to database
    const savedQuote = await saveQuote(supabaseClient, loanOfficerId, quote, conversationId);

    // Step 8: Generate response
    const response = generateResponse(quote, aiAnalysis);

    return new Response(
      JSON.stringify({
        success: true,
        quote: quote,
        autoFillFields: quote.autoFillFields,
        response: response,
        quoteId: savedQuote?.id,
        parsedFrom: parsedData,
        borrowerMatched: borrowerData ? {
          id: borrowerData.id,
          name: `${borrowerData.first_name} ${borrowerData.last_name}`,
        } : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Quote Builder Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================
// NATURAL LANGUAGE PARSER
// ============================================
function parseNaturalLanguage(message: string): any {
  const lower = message.toLowerCase();
  const result: any = {};

  // Extract borrower name
  const namePatterns = [
    /(?:for|client|borrower)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
    /([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s*,|\s+with|\s+at)/i,
  ];
  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match) {
      result.borrowerName = match[1].trim();
      break;
    }
  }

  // Extract property value
  const propertyValuePatterns = [
    /(?:property value|home value|house value|value)\s*(?:of\s*)?[:\s]*\$?([\d,]+(?:\.\d+)?)\s*(k|m|thousand|million)?/i,
    /(?:property|home|house)\s+(?:worth|valued at|at)\s*[:\s]*\$?([\d,]+(?:\.\d+)?)\s*(k|m|thousand|million)?/i,
    /(\d+(?:\.\d+)?)\s*(k|m|thousand|million)?\s*(?:property|home|house)/i,
  ];
  for (const pattern of propertyValuePatterns) {
    const match = message.match(pattern);
    if (match) {
      result.propertyValue = parseAmount(match[1], match[2]);
      break;
    }
  }

  // Extract mortgage balance
  const balancePatterns = [
    /(?:mortgage balance|balance|existing mortgage|current mortgage|owe)\s*(?:of\s*)?[:\s]*\$?([\d,]+(?:\.\d+)?)\s*(k|m)?/i,
    /(?:owe|balance)\s+\$?([\d,]+(?:\.\d+)?)\s*(k|m)?/i,
  ];
  for (const pattern of balancePatterns) {
    const match = message.match(pattern);
    if (match) {
      result.mortgageBalance = parseAmount(match[1], match[2]);
      break;
    }
  }

  // Extract HELOC amount / cash out amount
  const helocPatterns = [
    /(?:heloc|equity line|line of credit|cash out|cashout)\s*(?:amount|of|for)?[:\s]*\$?([\d,]+(?:\.\d+)?)\s*(k|m)?/i,
    /(?:wants?|needs?|looking for|seeking)\s+\$?([\d,]+(?:\.\d+)?)\s*(k|m)?/i,
    /(\d+(?:\.\d+)?)\s*(k|m)?\s*(?:heloc|equity|cash out|line)/i,
  ];
  for (const pattern of helocPatterns) {
    const match = message.match(pattern);
    if (match) {
      result.helocAmount = parseAmount(match[1], match[2]);
      break;
    }
  }

  // Extract interest rate
  const ratePatterns = [
    /(?:rate|interest|apr)\s*(?:of|at)?[:\s]*(\d+(?:\.\d+)?)\s*%?/i,
    /(\d+(?:\.\d+)?)\s*%\s*(?:rate|interest|apr)/i,
  ];
  for (const pattern of ratePatterns) {
    const match = message.match(pattern);
    if (match) {
      result.interestRate = parseFloat(match[1]);
      break;
    }
  }

  // Extract credit score
  const creditPatterns = [
    /(?:credit score|fico|credit)\s*(?:of|is)?[:\s]*(\d{3})/i,
    /(?:score|fico)\s+(\d{3})/i,
  ];
  for (const pattern of creditPatterns) {
    const match = message.match(pattern);
    if (match) {
      result.creditScore = parseInt(match[1]);
      break;
    }
  }

  // Extract property type
  if (/single family|single-family|house|home/i.test(lower)) {
    result.propertyType = 'single_family';
  } else if (/condo|condominium/i.test(lower)) {
    result.propertyType = 'condo';
  } else if (/townhouse|town home/i.test(lower)) {
    result.propertyType = 'townhouse';
  }

  // Extract occupancy
  if (/investment|rental|investor/i.test(lower)) {
    result.occupancy = 'investment';
  } else if (/second home|vacation home|second property/i.test(lower)) {
    result.occupancy = 'secondary';
  } else {
    result.occupancy = 'primary';
  }

  // Extract state
  const statePattern = /(?:in|state|located)\s+([A-Za-z\s]+?)(?:\s*,|\s+with|\s+and|\s+for|$)/i;
  const stateMatch = message.match(statePattern);
  if (stateMatch) {
    const state = stateMatch[1].trim();
    if (state.length === 2 || state.length > 3) {
      result.state = state;
    }
  }

  // Extract purpose/use case
  if (/debt consolidation|pay off debt|consolidate/i.test(lower)) {
    result.purpose = 'debt_consolidation';
  } else if (/home improvement|renovation|remodel|kitchen|bathroom/i.test(lower)) {
    result.purpose = 'home_improvement';
  } else if (/emergency fund|safety net|rainy day/i.test(lower)) {
    result.purpose = 'emergency_fund';
  } else if (/investment|stock|crypto|business/i.test(lower)) {
    result.purpose = 'investment';
  } else if (/education|college|tuition/i.test(lower)) {
    result.purpose = 'education';
  }

  return result;
}

function parseAmount(value: string, suffix: string | undefined): number {
  let num = parseFloat(value.replace(/,/g, ''));
  if (!suffix) return num;
  
  const lower = suffix.toLowerCase();
  if (lower === 'k' || lower === 'thousand') return num * 1000;
  if (lower === 'm' || lower === 'million') return num * 1000000;
  return num;
}

// ============================================
// BORROWER LOOKUP
// ============================================
async function lookupBorrower(supabaseClient: any, loanOfficerId: string, name: string): Promise<any> {
  const names = name.split(' ');
  const firstName = names[0];
  const lastName = names.slice(1).join(' ');

  const { data, error } = await supabaseClient
    .from('borrowers')
    .select(`
      *,
      properties (*),
      mortgages (*)
    `)
    .eq('loan_officer_id', loanOfficerId)
    .ilike('first_name', `%${firstName}%`)
    .ilike('last_name', `%${lastName}%`)
    .limit(1)
    .single();

  if (error) return null;
  return data;
}

async function getBorrowerById(supabaseClient: any, loanOfficerId: string, borrowerId: string): Promise<any> {
  const { data, error } = await supabaseClient
    .from('borrowers')
    .select(`
      *,
      properties (*),
      mortgages (*)
    `)
    .eq('id', borrowerId)
    .eq('loan_officer_id', loanOfficerId)
    .single();

  if (error) return null;
  return data;
}

// ============================================
// DATA MERGING
// ============================================
function mergeData(parsed: any, borrower: any | null): any {
  const result = { ...parsed };

  if (borrower) {
    // Use database values if not parsed
    if (!result.borrowerName) {
      result.borrowerName = `${borrower.first_name} ${borrower.last_name}`;
    }
    if (!result.creditScore && borrower.credit_score) {
      result.creditScore = borrower.credit_score;
    }

    // Get primary property
    const primaryProperty = borrower.properties?.find((p: any) => p.is_primary_residence) || borrower.properties?.[0];
    if (primaryProperty) {
      if (!result.propertyValue && primaryProperty.estimated_value) {
        result.propertyValue = primaryProperty.estimated_value;
      }
      if (!result.state && primaryProperty.state) {
        result.state = primaryProperty.state;
      }
      if (!result.propertyType && primaryProperty.property_type) {
        result.propertyType = primaryProperty.property_type;
      }
      if (!result.occupancy && primaryProperty.occupancy_type) {
        result.occupancy = primaryProperty.occupancy_type;
      }
      result.propertyId = primaryProperty.id;
    }

    // Calculate total mortgage balance
    const activeMortgages = (borrower.mortgages || []).filter((m: any) => m.status === 'active');
    const totalBalance = activeMortgages.reduce((sum: number, m: any) => sum + (m.loan_balance || 0), 0);
    if (!result.mortgageBalance && totalBalance > 0) {
      result.mortgageBalance = totalBalance;
    }
    result.mortgages = activeMortgages;
  }

  return result;
}

// ============================================
// QUOTE CALCULATIONS
// ============================================
function calculateQuoteFields(data: any): any {
  const result = { ...data };

  // Calculate CLTV
  if (result.propertyValue && result.mortgageBalance !== undefined) {
    const helocAmount = result.helocAmount || 0;
    const totalDebt = result.mortgageBalance + helocAmount;
    result.combinedLTV = (totalDebt / result.propertyValue) * 100;
    result.availableEquity = result.propertyValue - result.mortgageBalance;
  }

  // Estimate interest rate if not provided
  if (!result.interestRate && result.creditScore) {
    result.interestRate = estimateRate(result.creditScore, result.combinedLTV || 80);
  } else if (!result.interestRate) {
    result.interestRate = 8.5; // Default
  }

  // Calculate origination fee
  if (!result.originationFee) {
    result.originationFee = 995; // Standard fee
  }

  // Set default terms
  if (!result.drawPeriod) result.drawPeriod = 10;
  if (!result.repaymentTerm) result.repaymentTerm = 20;

  // Calculate interest-only payment
  if (result.helocAmount && result.interestRate) {
    result.interestOnlyPayment = (result.helocAmount * (result.interestRate / 100)) / 12;
  }

  // Calculate fully amortized payment (simplified)
  if (result.helocAmount && result.interestRate && result.repaymentTerm) {
    const monthlyRate = result.interestRate / 100 / 12;
    const numPayments = result.repaymentTerm * 12;
    result.fullyAmortizedPayment = 
      (result.helocAmount * monthlyRate * Math.pow(1 + monthlyRate, numPayments)) /
      (Math.pow(1 + monthlyRate, numPayments) - 1);
  }

  // Determine qualification status
  result.qualificationStatus = determineQualification(result);

  // Generate strategy
  result.strategy = generateStrategy(result);

  return result;
}

function estimateRate(creditScore: number, cltv: number): number {
  let baseRate = 8.5;
  
  if (creditScore >= 760) baseRate -= 1.0;
  else if (creditScore >= 740) baseRate -= 0.75;
  else if (creditScore >= 720) baseRate -= 0.5;
  else if (creditScore >= 700) baseRate -= 0.25;
  else if (creditScore < 680) baseRate += 0.75;
  
  if (cltv <= 70) baseRate -= 0.25;
  else if (cltv > 80) baseRate += 0.5;
  
  return Math.round(baseRate * 100) / 100;
}

function determineQualification(data: any): string {
  const issues = [];
  
  if (data.creditScore && data.creditScore < 680) {
    issues.push('Credit score below 680');
  }
  if (data.combinedLTV && data.combinedLTV > 85) {
    issues.push('CLTV exceeds 85%');
  }
  if (data.helocAmount && data.helocAmount < 25000) {
    issues.push('Loan amount below minimum');
  }
  
  if (issues.length === 0) return 'qualified';
  if (issues.length === 1) return 'needs_review';
  return 'below_threshold';
}

function generateStrategy(data: any): string {
  const strategies = [];
  
  if (data.purpose === 'debt_consolidation') {
    strategies.push('Structure HELOC for debt consolidation with interest-only payments initially.');
  } else if (data.purpose === 'home_improvement') {
    strategies.push('Draw funds as needed for renovations. Consider rate lock for large draws.');
  } else if (data.purpose === 'emergency_fund') {
    strategies.push('Establish as safety net. Minimize draws to reduce interest costs.');
  } else {
    strategies.push('Flexible equity access for multiple uses. Draw only what you need.');
  }
  
  if (data.combinedLTV && data.combinedLTV > 80) {
    strategies.push('High CLTV - consider smaller initial draw or wait for appreciation.');
  }
  
  if (data.creditScore && data.creditScore >= 740) {
    strategies.push('Tier 1 credit qualifies for best rates.');
  }
  
  return strategies.join(' ');
}

// ============================================
// AI ANALYSIS
// ============================================
async function generateAIQuoteAnalysis(data: any): Promise<any> {
  // This would call an AI model for enhanced analysis
  // For now, return structured analysis based on data
  
  const riskFactors = [];
  const opportunities = [];
  
  if (data.combinedLTV > 80) {
    riskFactors.push('High CLTV reduces margin for error');
  }
  if (data.creditScore && data.creditScore < 700) {
    riskFactors.push('Credit score may impact rate');
  }
  
  if (data.availableEquity && data.availableEquity > 200000) {
    opportunities.push('Strong equity position for future needs');
  }
  if (data.creditScore && data.creditScore >= 760) {
    opportunities.push('Excellent credit qualifies for premium pricing');
  }
  
  return {
    summary: generateSummary(data),
    riskFactors,
    opportunities,
    competitivePosition: data.creditScore >= 740 ? 'strong' : data.creditScore >= 700 ? 'good' : 'fair',
    recommendedNextSteps: [
      'Verify property value with recent comps',
      'Confirm borrower income documentation',
      'Lock rate if borrower is rate-sensitive',
    ],
  };
}

function generateSummary(data: any): string {
  const parts = [];
  
  if (data.borrowerName) {
    parts.push(`${data.borrowerName}`);
  }
  
  if (data.helocAmount) {
    parts.push(`seeks $${(data.helocAmount / 1000).toFixed(0)}k HELOC`);
  }
  
  if (data.propertyValue && data.combinedLTV) {
    parts.push(`on $${(data.propertyValue / 1000).toFixed(0)}k property (${data.combinedLTV.toFixed(1)}% CLTV)`);
  }
  
  if (data.interestRate) {
    parts.push(`at ${data.interestRate}% estimated rate`);
  }
  
  return parts.join(' ');
}

// ============================================
// QUOTE STRUCTURE BUILDER
// ============================================
function buildQuoteStructure(data: any, aiAnalysis: any): any {
  const autoFillFields = {
    borrower_name: data.borrowerName,
    property_value: data.propertyValue,
    existing_mortgage_balance: data.mortgageBalance,
    heloc_amount: data.helocAmount,
    combined_ltv: Math.round(data.combinedLTV * 100) / 100,
    interest_rate: data.interestRate,
    origination_fee: data.originationFee,
    draw_period_years: data.drawPeriod,
    repayment_term_years: data.repaymentTerm,
    interest_only_payment_estimate: Math.round(data.interestOnlyPayment),
    fully_amortized_payment: Math.round(data.fullyAmortizedPayment),
    credit_score: data.creditScore,
    property_type: data.propertyType,
    occupancy_type: data.occupancy,
    state: data.state,
    purpose: data.purpose,
  };

  return {
    id: crypto.randomUUID(),
    borrowerName: data.borrowerName,
    propertyValue: data.propertyValue,
    mortgageBalance: data.mortgageBalance,
    helocAmount: data.helocAmount,
    combinedLTV: data.combinedLTV,
    availableEquity: data.availableEquity,
    interestRate: data.interestRate,
    originationFee: data.originationFee,
    drawPeriod: data.drawPeriod,
    repaymentTerm: data.repaymentTerm,
    interestOnlyPayment: data.interestOnlyPayment,
    fullyAmortizedPayment: data.fullyAmortizedPayment,
    qualificationStatus: data.qualificationStatus,
    strategy: data.strategy,
    purpose: data.purpose,
    aiAnalysis,
    autoFillFields,
    createdAt: new Date().toISOString(),
  };
}

// ============================================
// DATABASE OPERATIONS
// ============================================
async function saveQuote(supabaseClient: any, loanOfficerId: string, quote: any, conversationId?: string) {
  const { data, error } = await supabaseClient
    .from('heloc_quotes')
    .insert({
      loan_officer_id: loanOfficerId,
      borrower_id: quote.borrowerId,
      property_value: quote.propertyValue,
      first_mortgage_balance: quote.mortgageBalance,
      heloc_amount: quote.helocAmount,
      combined_ltv: quote.combinedLTV,
      interest_rate: quote.interestRate,
      origination_fee: quote.originationFee,
      draw_period: quote.drawPeriod,
      repayment_term: quote.repaymentTerm,
      interest_only_payment: quote.interestOnlyPayment,
      quote_data: quote,
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving quote:', error);
    return null;
  }

  // If conversation ID provided, update conversation with quote data
  if (conversationId) {
    await supabaseClient
      .from('ezra_conversations')
      .update({ quote_data: quote.autoFillFields })
      .eq('id', conversationId);
  }

  return data;
}

// ============================================
// RESPONSE GENERATOR
// ============================================
function generateResponse(quote: any, aiAnalysis: any): string {
  const lines = [];
  
  // Header
  lines.push(`## HELOC Quote for ${quote.borrowerName || 'Client'}`);
  lines.push('');
  
  // Quote Summary
  lines.push('**Quote Summary**');
  lines.push(`• Loan Amount: $${(quote.helocAmount || 0).toLocaleString()}`);
  lines.push(`• Interest Rate: ${quote.interestRate}% (estimated)`);
  lines.push(`• Origination Fee: $${quote.originationFee}`);
  lines.push(`• Draw Period: ${quote.drawPeriod} years`);
  lines.push(`• Repayment Term: ${quote.repaymentTerm} years`);
  lines.push('');
  
  // Key Metrics
  lines.push('**Key Metrics**');
  lines.push(`• Property Value: $${(quote.propertyValue || 0).toLocaleString()}`);
  lines.push(`• Existing Mortgage: $${(quote.mortgageBalance || 0).toLocaleString()}`);
  lines.push(`• Combined LTV: ${quote.combinedLTV?.toFixed(1)}%`);
  lines.push(`• Available Equity: $${(quote.availableEquity || 0).toLocaleString()}`);
  lines.push('');
  
  // Payment Estimates
  lines.push('**Payment Estimates**');
  lines.push(`• Interest-Only: $${Math.round(quote.interestOnlyPayment || 0).toLocaleString()}/month`);
  lines.push(`• Fully Amortized: $${Math.round(quote.fullyAmortizedPayment || 0).toLocaleString()}/month`);
  lines.push('');
  
  // Strategy
  lines.push('**Strategy**');
  lines.push(quote.strategy);
  lines.push('');
  
  // Qualification
  lines.push(`**Qualification: ${quote.qualificationStatus.toUpperCase()}**`);
  lines.push('');
  
  // AI Analysis
  if (aiAnalysis) {
    if (aiAnalysis.opportunities?.length > 0) {
      lines.push('**Opportunities**');
      aiAnalysis.opportunities.forEach((opp: string) => lines.push(`• ${opp}`));
      lines.push('');
    }
    
    if (aiAnalysis.riskFactors?.length > 0) {
      lines.push('**Considerations**');
      aiAnalysis.riskFactors.forEach((risk: string) => lines.push(`• ${risk}`));
      lines.push('');
    }
  }
  
  // Auto-fill block
  lines.push('---');
  lines.push('**AUTO_FILL_FIELDS**');
  lines.push('```json');
  lines.push(JSON.stringify(quote.autoFillFields, null, 2));
  lines.push('```');
  
  return lines.join('\n');
}

// Crypto polyfill for Deno
const crypto = {
  randomUUID: () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
};
