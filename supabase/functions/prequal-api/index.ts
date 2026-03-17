/**
 * Pre-Qualification API Integration
 * Real-time pre-qualification with lender APIs
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getCorsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, userId, leadId, quoteData, prequalData } = await req.json()

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    switch (action) {
      case 'check_prequal':
        return checkPrequalification(supabaseClient, prequalData, quoteData, corsHeaders)

      case 'submit_to_lender':
        return submitToLender(supabaseClient, userId, leadId, quoteData, prequalData, corsHeaders)

      case 'get_prequal_status':
        return getPrequalStatus(supabaseClient, leadId, corsHeaders)

      case 'eligibility_check':
        return eligibilityCheck(prequalData, quoteData, corsHeaders)
      
      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})

async function checkPrequalification(supabaseClient: any, prequalData: any, quoteData: any, corsHeaders: Record<string, string>) {
  try {
    // Calculate eligibility score
    const eligibility = calculateEligibility(prequalData, quoteData)
    
    // Store pre-qual check
    const { data: prequalRecord, error } = await supabaseClient
      .from('prequal_checks')
      .insert({
        lead_id: prequalData.leadId,
        user_id: prequalData.userId,
        credit_score_range: prequalData.creditScore,
        has_steady_income: prequalData.hasSteadyIncome,
        has_sufficient_equity: prequalData.hasSufficientEquity,
        no_recent_bankruptcy: prequalData.noRecentBankruptcy,
        estimated_home_value: quoteData?.homeValue,
        estimated_mortgage_balance: quoteData?.mortgageBalance,
        estimated_heloc_amount: quoteData?.helocAmount,
        eligibility_score: eligibility.score,
        eligibility_status: eligibility.status,
        max_cltv: eligibility.maxCltv,
        estimated_rate_range: eligibility.estimatedRateRange,
        checked_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (error) throw error
    
    return new Response(
      JSON.stringify({
        success: true,
        prequalId: prequalRecord.id,
        ...eligibility
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Prequal check error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to check prequalification', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
}

function calculateEligibility(prequalData: any, quoteData: any) {
  let score = 100
  const factors = []
  
  // Credit score factor
  const creditScore = parseInt(prequalData.creditScore) || 0
  if (creditScore < 640) {
    score -= 30
    factors.push({ factor: 'credit', impact: -30, message: 'Credit score below 640' })
  } else if (creditScore < 680) {
    score -= 15
    factors.push({ factor: 'credit', impact: -15, message: 'Credit score below 680' })
  } else if (creditScore >= 740) {
    score += 10
    factors.push({ factor: 'credit', impact: +10, message: 'Excellent credit score' })
  }
  
  // Income stability
  if (!prequalData.hasSteadyIncome) {
    score -= 20
    factors.push({ factor: 'income', impact: -20, message: 'Income stability concern' })
  }
  
  // Equity
  if (!prequalData.hasSufficientEquity) {
    score -= 25
    factors.push({ factor: 'equity', impact: -25, message: 'Insufficient equity' })
  }
  
  // Bankruptcy
  if (!prequalData.noRecentBankruptcy) {
    score -= 40
    factors.push({ factor: 'bankruptcy', impact: -40, message: 'Recent bankruptcy' })
  }
  
  // Calculate CLTV if we have quote data
  let cltv = 0
  if (quoteData?.homeValue && quoteData?.mortgageBalance && quoteData?.helocAmount) {
    cltv = ((quoteData.mortgageBalance + quoteData.helocAmount) / quoteData.homeValue) * 100
    
    if (cltv > 85) {
      score -= 35
      factors.push({ factor: 'cltv', impact: -35, message: 'CLTV exceeds 85%' })
    } else if (cltv > 80) {
      score -= 15
      factors.push({ factor: 'cltv', impact: -15, message: 'CLTV above 80%' })
    }
  }
  
  // Determine status
  let status = 'approved'
  let maxCltv = 85
  let estimatedRateRange = { min: 7.5, max: 9.5 }
  
  if (score < 40) {
    status = 'denied'
    maxCltv = 0
    estimatedRateRange = null
  } else if (score < 60) {
    status = 'manual_review'
    maxCltv = 70
    estimatedRateRange = { min: 9.5, max: 12.0 }
  } else if (score < 80) {
    status = 'conditional'
    maxCltv = 80
    estimatedRateRange = { min: 8.5, max: 10.5 }
  }
  
  // Adjust rate range based on credit score
  if (creditScore >= 740) {
    estimatedRateRange = { min: 7.0, max: 8.5 }
  } else if (creditScore >= 680) {
    estimatedRateRange = { min: 7.5, max: 9.0 }
  } else if (creditScore >= 640) {
    estimatedRateRange = { min: 8.5, max: 10.5 }
  }
  
  return {
    score: Math.max(0, Math.min(100, score)),
    status,
    factors,
    maxCltv,
    estimatedRateRange,
    currentCltv: cltv > 0 ? Math.round(cltv * 100) / 100 : null,
    recommendations: generatePrequalRecommendations(score, factors)
  }
}

function generatePrequalRecommendations(score: number, factors: any[]) {
  const recommendations = []
  
  if (score < 60) {
    recommendations.push({
      priority: 'high',
      type: 'action_required',
      message: 'Additional documentation may be required for approval.'
    })
  }
  
  const creditFactor = factors.find(f => f.factor === 'credit')
  if (creditFactor && creditFactor.impact < 0) {
    recommendations.push({
      priority: 'medium',
      type: 'improvement',
      message: 'Consider credit repair services to improve your score before applying.'
    })
  }
  
  const equityFactor = factors.find(f => f.factor === 'equity')
  if (equityFactor) {
    recommendations.push({
      priority: 'high',
      type: 'alternative',
      message: 'Consider waiting to build more equity or explore personal loan options.'
    })
  }
  
  if (score >= 80) {
    recommendations.push({
      priority: 'low',
      type: 'positive',
      message: 'You\'re in great shape! Proceed with confidence.'
    })
  }
  
  return recommendations
}

async function submitToLender(supabaseClient: any, userId: string, leadId: string, quoteData: any, prequalData: any, corsHeaders: Record<string, string>) {
  try {
    // This would integrate with actual lender APIs
    // For now, we simulate the submission
    
    const eligibility = calculateEligibility(prequalData, quoteData)
    
    // Create submission record
    const { data: submission, error } = await supabaseClient
      .from('lender_submissions')
      .insert({
        user_id: userId,
        lead_id: leadId,
        lender: 'figure', // or other lender
        submission_data: {
          quoteData,
          prequalData,
          eligibility
        },
        status: eligibility.status === 'approved' ? 'submitted' : 'pending_review',
        submitted_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (error) throw error
    
    // Update lead status
    await supabaseClient
      .from('leads')
      .update({ 
        stage: 'application_submitted',
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
    
    return new Response(
      JSON.stringify({
        success: true,
        submissionId: submission.id,
        status: submission.status,
        message: eligibility.status === 'approved' 
          ? 'Application submitted successfully!'
          : 'Application submitted for manual review.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('Lender submission error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to submit to lender', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
}

async function getPrequalStatus(supabaseClient: any, leadId: string, corsHeaders: Record<string, string>) {
  try {
    const { data, error } = await supabaseClient
      .from('prequal_checks')
      .select('*')
      .eq('lead_id', leadId)
      .order('checked_at', { ascending: false })
      .limit(1)
      .single()
    
    if (error && error.code !== 'PGRST116') throw error
    
    return new Response(
      JSON.stringify({ success: true, prequal: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to get prequal status', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
}

function eligibilityCheck(prequalData: any, quoteData: any, corsHeaders: Record<string, string>) {
  // Quick eligibility check without storing
  const eligibility = calculateEligibility(prequalData, quoteData)
  
  return new Response(
    JSON.stringify({
      success: true,
      eligible: eligibility.score >= 60,
      ...eligibility
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  )
}
