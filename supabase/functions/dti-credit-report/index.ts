/**
 * DTI Calculator with Credit Report Integration
 * Calculates real DTI from credit report data
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
    const { action, userId, leadId, quoteId, creditReportData, monthlyIncome, helocPayment } = await req.json()

    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    switch (action) {
      case 'calculate_from_credit_report':
        return calculateFromCreditReport(supabaseClient, creditReportData, monthlyIncome, helocPayment, corsHeaders)

      case 'store_credit_report':
        return storeCreditReport(supabaseClient, userId, leadId, creditReportData, corsHeaders)

      case 'get_dti_calculation':
        return getDTICalculation(supabaseClient, quoteId, corsHeaders)
      
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

async function calculateFromCreditReport(supabaseClient: any, creditReportData: any, monthlyIncome: number, helocPayment: number, corsHeaders: Record<string, string>) {
  try {
    // Extract debts from credit report
    const debts = extractDebtsFromCreditReport(creditReportData)
    
    // Calculate total monthly debt payments
    const totalMonthlyDebts = debts.reduce((sum, debt) => sum + debt.monthlyPayment, 0)
    
    // Add proposed HELOC payment
    const totalDebtWithHeloc = totalMonthlyDebts + (helocPayment || 0)
    
    // Calculate DTI ratios
    const currentDTI = monthlyIncome > 0 ? (totalMonthlyDebts / monthlyIncome) * 100 : 0
    const proposedDTI = monthlyIncome > 0 ? (totalDebtWithHeloc / monthlyIncome) * 100 : 0
    
    // Determine approval likelihood
    let approvalStatus = 'approved'
    if (proposedDTI > 50) approvalStatus = 'denied'
    else if (proposedDTI > 43) approvalStatus = 'manual_review'
    else if (proposedDTI > 36) approvalStatus = 'conditional'
    
    const result = {
      success: true,
      currentDTI: Math.round(currentDTI * 100) / 100,
      proposedDTI: Math.round(proposedDTI * 100) / 100,
      monthlyIncome,
      totalMonthlyDebts: Math.round(totalMonthlyDebts * 100) / 100,
      proposedHelocPayment: helocPayment || 0,
      totalDebtWithHeloc: Math.round(totalDebtWithHeloc * 100) / 100,
      approvalStatus,
      debts: debts.map(d => ({
        creditor: d.creditor,
        balance: d.balance,
        monthlyPayment: d.monthlyPayment,
        accountType: d.accountType
      })),
      recommendations: generateDTIRecommendations(proposedDTI, debts)
    }
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    console.error('DTI calculation error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to calculate DTI', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
}

function extractDebtsFromCreditReport(creditReportData: any) {
  const debts = []
  
  // Handle different credit report formats
  const tradelines = creditReportData.tradelines || 
                     creditReportData.accounts || 
                     creditReportData.debts || []
  
  for (const account of tradelines) {
    // Only include open accounts with balances
    if (account.status !== 'open' && account.status !== 'Active') continue
    
    const monthlyPayment = account.monthlyPayment || 
                          account.paymentAmount || 
                          calculateEstimatedPayment(account.balance, account.accountType)
    
    debts.push({
      creditor: account.creditorName || account.creditor || account.accountName || 'Unknown',
      accountNumber: account.accountNumber ? `****${account.accountNumber.slice(-4)}` : '****',
      accountType: account.accountType || account.type || 'Other',
      balance: account.currentBalance || account.balance || 0,
      monthlyPayment: monthlyPayment,
      creditLimit: account.creditLimit || 0,
      openDate: account.openDate || account.dateOpened
    })
  }
  
  return debts
}

function calculateEstimatedPayment(balance: number, accountType: string): number {
  if (!balance || balance <= 0) return 0
  
  // Estimate minimum payments based on account type
  const paymentRates: Record<string, number> = {
    'Credit Card': 0.03,      // 3% of balance
    'Revolving': 0.03,
    'Auto Loan': 0.02,        // Approximate
    'Mortgage': 0.006,        // Rough P&I estimate
    'Student Loan': 0.01,
    'Installment': 0.02,
    'Other': 0.03
  }
  
  const rate = paymentRates[accountType] || 0.03
  return Math.round(balance * rate * 100) / 100
}

function generateDTIRecommendations(dti: number, debts: any[]) {
  const recommendations = []
  
  if (dti > 43) {
    recommendations.push({
      priority: 'high',
      type: 'warning',
      message: 'DTI exceeds 43% threshold. Consider paying down existing debts before applying.'
    })
  }
  
  // Find high-balance credit cards
  const highBalanceCards = debts.filter(d => 
    (d.accountType === 'Credit Card' || d.accountType === 'Revolving') && 
    d.balance > 10000
  )
  
  if (highBalanceCards.length > 0) {
    const totalCardDebt = highBalanceCards.reduce((sum, d) => sum + d.balance, 0)
    recommendations.push({
      priority: 'medium',
      type: 'opportunity',
      message: `Paying down $${totalCardDebt.toLocaleString()} in credit card debt could improve DTI by ${Math.round((totalCardDebt * 0.03) / 100)}%`
    })
  }
  
  if (dti < 36) {
    recommendations.push({
      priority: 'low',
      type: 'positive',
      message: 'Excellent DTI ratio. Strong approval likelihood.'
    })
  }
  
  return recommendations
}

async function storeCreditReport(supabaseClient: any, userId: string, leadId: string, creditReportData: any, corsHeaders: Record<string, string>) {
  try {
    const { data, error } = await supabaseClient
      .from('credit_reports')
      .insert({
        user_id: userId,
        lead_id: leadId,
        report_data: creditReportData,
        credit_score: creditReportData.creditScore || creditReportData.score,
        report_date: new Date().toISOString(),
        status: 'active'
      })
      .select()
      .single()
    
    if (error) throw error
    
    return new Response(
      JSON.stringify({ success: true, reportId: data.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to store credit report', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
}

async function getDTICalculation(supabaseClient: any, quoteId: string, corsHeaders: Record<string, string>) {
  try {
    const { data, error } = await supabaseClient
      .from('dti_calculations')
      .select('*')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    
    if (error && error.code !== 'PGRST116') throw error
    
    return new Response(
      JSON.stringify({ success: true, calculation: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Failed to get DTI calculation', details: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
}
