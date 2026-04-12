import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import type { LoanInputs, QuoteResult } from '../types';

interface EzraKnowledgeBaseProps {
  inputs: LoanInputs;
  quoteResult: QuoteResult;
  selectedTier: 't1' | 't2' | 't3';
  selectedTerm: number;
  activeTab: 'strategy' | 'comparison' | 'debt' | 'refi';
}

// Feature definitions for future use
// const FEATURES: Feature[] = [
//   { id: 'basic_strategy', name: 'Basic Strategy', requiredTier: 'starter', description: 'Rule-based recommendations' },
//   { id: 'ai_strategy', name: 'AI Strategy', requiredTier: 'pro', description: 'AI-generated personalized strategy' },
//   { id: 'sales_scripts', name: 'Sales Scripts', requiredTier: 'pro', description: 'Personalized opening pitches' },
//   { id: 'objection_handlers', name: 'Objection Handlers', requiredTier: 'pro', description: 'Responses to common objections' },
//   { id: 'full_analysis', name: 'Full AI Analysis', requiredTier: 'enterprise', description: 'Comprehensive strategy with confidence scores' },
//   { id: 'competitive_analysis', name: 'Competitive Analysis', requiredTier: 'enterprise', description: 'Rate comparison vs competitors' },
//   { id: 'email_templates', name: 'Email Templates', requiredTier: 'enterprise', description: 'Follow-up sequences' },
// ];

export const EzraKnowledgeBase: React.FC<EzraKnowledgeBaseProps> = ({
  inputs,
  quoteResult,
  selectedTier,
  selectedTerm,
  activeTab: _activeTab,
}) => {
  const { tier: userTier } = useAuth();
  const [showUpgradeModal, setShowUpgradeModal] = useState<string | null>(null);

  // Future use: tier-based feature gating
  // const hasAccess = (featureTier: FeatureTier): boolean => {
  //   const tierLevels: Record<Tier, number> = { starter: 1, pro: 2, enterprise: 3 };
  //   const requiredLevel = tierLevels[featureTier as Tier] || 1;
  //   const userLevel = tierLevels[userTier || 'starter'];
  //   return userLevel >= requiredLevel;
  // };

  const renderStarterContent = () => {
    const tierData = quoteResult.results[selectedTier];
    const payment = tierData.payments[selectedTerm];
    
    return (
      <div className="space-y-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h4 className="font-semibold text-blue-900 mb-2">📊 Basic Strategy</h4>
          <ul className="space-y-2 text-sm text-blue-800">
            <li>• <strong>Recommended:</strong> {selectedTier.replace('t', 'Tier ')} - {selectedTerm} Year Fixed</li>
            <li>• <strong>Rate:</strong> {payment.rate.toFixed(3)}%</li>
            <li>• <strong>Payment:</strong> ${payment.pmt.toFixed(2)}/mo</li>
            <li>• <strong>CLTV:</strong> {tierData.cltv.toFixed(1)}%</li>
          </ul>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-semibold text-gray-900 mb-2">💡 Talking Points</h4>
          <ul className="space-y-2 text-sm text-gray-700">
            {tierData.cltv > 85 && (
              <li>• CLTV is on the higher side - emphasize the fixed rate stability</li>
            )}
            {inputs.netCash < 30000 && (
              <li>• Smaller loan amount - highlight no prepayment penalties</li>
            )}
            {inputs.debtItems && inputs.debtItems.length > 0 && (
              <li>• Debt consolidation opportunity - mention monthly savings</li>
            )}
            <li>• Fixed rate provides payment certainty for {selectedTerm} years</li>
            <li>• No annual fees or maintenance costs</li>
          </ul>
        </div>

        {/* Upsell to Pro */}
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-lg border border-purple-200">
          <h4 className="font-semibold text-purple-900 mb-2">✨ Want More?</h4>
          <p className="text-sm text-purple-800 mb-3">
            I can generate a personalized sales script and objection handlers for this specific client.
          </p>
          <button 
            onClick={() => setShowUpgradeModal('pro')}
            className="bg-purple-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-purple-700"
          >
            Upgrade to Pro
          </button>
        </div>
      </div>
    );
  };

  const renderProContent = () => {
    const tierData = quoteResult.results[selectedTier];
    const payment = tierData.payments[selectedTerm];
    
    return (
      <div className="space-y-4">
        <div className="bg-blue-50 p-4 rounded-lg">
          <h4 className="font-semibold text-blue-900 mb-2">📊 AI Strategy</h4>
          <div className="text-sm text-blue-800 space-y-3">
            <p>
              <strong>Recommended:</strong> {selectedTier.replace('t', 'Tier ')} - {selectedTerm} Year Fixed @ {payment.rate.toFixed(3)}%
            </p>
            <p>
              <strong>Why this fits:</strong> Based on your client's ${inputs.homeValue.toLocaleString()} home value 
              and ${inputs.netCash.toLocaleString()} cash need, this option provides the best balance of rate and fees. 
              The {selectedTerm}-year term keeps payments manageable while building equity faster than a 30-year.
            </p>
          </div>
        </div>

        <div className="bg-green-50 p-4 rounded-lg">
          <h4 className="font-semibold text-green-900 mb-2">🎯 Sales Script</h4>
          <blockquote className="text-sm text-green-800 italic border-l-4 border-green-400 pl-4">
            "{inputs.clientName || 'John'}, I've analyzed your situation - you have a ${inputs.homeValue.toLocaleString()} home 
            with a ${inputs.mortgageBalance.toLocaleString()} balance, and you're looking for ${inputs.netCash.toLocaleString()}. 
            That puts you in a strong equity position. I've found a sweet spot: {payment.rate.toFixed(3)}% fixed for {selectedTerm} years. 
            Your payment would be ${payment.pmt.toFixed(2)}, and with {tierData.orig}% origination, you're not overpaying on fees."
          </blockquote>
        </div>

        <div className="bg-orange-50 p-4 rounded-lg">
          <h4 className="font-semibold text-orange-900 mb-2">🛡️ Objection Handlers</h4>
          <div className="space-y-3 text-sm">
            <div>
              <p className="font-medium text-orange-900">"The rate seems high"</p>
              <p className="text-orange-800">
                → "I understand. Let's look at this - a {payment.rate.toFixed(3)}% fixed rate gives you payment certainty. 
                Compare that to credit cards at 20%+ or even a personal loan at 10-12%. This is actually quite competitive 
                for a second lien position."
              </p>
            </div>
            <div>
              <p className="font-medium text-orange-900">"What about the origination fee?"</p>
              <p className="text-orange-800">
                → "The {tierData.orig}% fee (${tierData.feeAmt.toLocaleString()}) gets you a rate that's 
                {((quoteResult.results.t3.payments[selectedTerm].rate - payment.rate) * 100).toFixed(0)} basis points lower than our no-fee option. 
                That saves you ${((quoteResult.results.t3.payments[selectedTerm].pmt - payment.pmt) * selectedTerm * 12).toLocaleString()} over the life of the loan."
              </p>
            </div>
            <div>
              <p className="font-medium text-orange-900">"I want to shop around"</p>
              <p className="text-orange-800">
                → "Absolutely, you should. Here's what to compare: our {payment.rate.toFixed(3)}% fixed with no annual fees 
                vs competitors. Many quote lower rates but add annual fees ($100-300/year) or have variable rates that adjust."
              </p>
            </div>
          </div>
        </div>

        {inputs.debtItems && inputs.debtItems.length > 0 && (
          <div className="bg-purple-50 p-4 rounded-lg">
            <h4 className="font-semibold text-purple-900 mb-2">💳 Debt Consolidation</h4>
            <p className="text-sm text-purple-800">
              If your client consolidates their ${inputs.debtItems.reduce((sum, d) => sum + d.balance, 0).toLocaleString()} in credit card debt 
              at an average of {(inputs.debtItems.reduce((sum, d) => sum + d.rate, 0) / inputs.debtItems.length).toFixed(1)}% APR into this HELOC at {payment.rate.toFixed(3)}%, 
              they could save approximately ${(inputs.debtItems.reduce((sum, d) => sum + (d.balance * (d.rate - payment.rate) / 100 / 12), 0)).toFixed(0)}/month in interest.
            </p>
          </div>
        )}

        {/* Upsell to Enterprise */}
        <div className="bg-gradient-to-r from-amber-50 to-yellow-50 p-4 rounded-lg border border-amber-200">
          <h4 className="font-semibold text-amber-900 mb-2">🏆 Go Deeper</h4>
          <p className="text-sm text-amber-800 mb-3">
            I can provide competitive analysis against Chase and Wells Fargo, risk assessment, and ready-to-send follow-up emails.
          </p>
          <button 
            onClick={() => setShowUpgradeModal('enterprise')}
            className="bg-amber-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-amber-700"
          >
            Upgrade to Enterprise
          </button>
        </div>
      </div>
    );
  };

  const renderEnterpriseContent = () => {
    const tierData = quoteResult.results[selectedTier];
    const payment = tierData.payments[selectedTerm];
    const t3Payment = quoteResult.results.t3.payments[selectedTerm];
    const monthlySavings = t3Payment.pmt - payment.pmt;
    const breakEvenMonths = tierData.feeAmt > 0 && monthlySavings > 0 ? tierData.feeAmt / monthlySavings : 0;
    
    return (
      <div className="space-y-4">
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
          <h4 className="font-semibold text-blue-900 mb-2">📊 Executive Summary</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-blue-700">Client: <span className="font-medium">{inputs.clientName || 'Unknown'}</span></p>
              <p className="text-blue-700">Property: <span className="font-medium">${inputs.homeValue.toLocaleString()}</span></p>
              <p className="text-blue-700">CLTV: <span className="font-medium">{tierData.cltv.toFixed(1)}%</span></p>
            </div>
            <div>
              <p className="text-blue-700">Recommendation: <span className="font-medium">{selectedTier.replace('t', 'Tier ')}</span></p>
              <p className="text-blue-700">Rate: <span className="font-medium">{payment.rate.toFixed(3)}%</span></p>
              <p className="text-blue-700">Break-even: <span className="font-medium">{breakEvenMonths > 0 ? `${breakEvenMonths.toFixed(0)} months` : 'N/A'}</span></p>
            </div>
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-semibold text-gray-900 mb-2">📈 Market Context</h4>
          <p className="text-sm text-gray-700">
            Current HELOC rates range from {quoteResult.results.t1.payments[selectedTerm].rate.toFixed(3)}% (with points) to {quoteResult.results.t3.payments[selectedTerm].rate.toFixed(3)}% (no points). 
            Your recommendation of {payment.rate.toFixed(3)}% is competitively positioned. The {tierData.orig}% origination fee 
            structure is standard for this rate tier.
          </p>
        </div>

        <div className="bg-green-50 p-4 rounded-lg">
          <h4 className="font-semibold text-green-900 mb-2">🎯 Consultative Sales Approach</h4>
          <div className="space-y-3 text-sm text-green-800">
            <div>
              <p className="font-medium">Opening:</p>
              <p className="italic">"{inputs.clientName || 'John'}, I've analyzed your situation. You have a ${inputs.homeValue.toLocaleString()} home, 
              a ${inputs.mortgageBalance.toLocaleString()} balance, and you're looking for ${inputs.netCash.toLocaleString()}. 
              That gives you a CLTV of {tierData.cltv.toFixed(1)}%, which is {tierData.cltv > 90 ? 'on the higher side but workable' : 'in a good range'}. 
              Let me show you what I'm thinking..."</p>
            </div>
            <div>
              <p className="font-medium">Discovery Questions:</p>
              <ul className="list-disc list-inside ml-2">
                <li>"What's your timeline for this project?"</li>
                <li>"Have you considered how long you'll keep this HELOC open?"</li>
                <li>"Are you looking to consolidate any other debts?"</li>
                <li>"Is payment stability or lowest total cost more important to you?"</li>
              </ul>
            </div>
            <div>
              <p className="font-medium">Value Proposition:</p>
              <p>"Here's what this structure does for you: ${payment.pmt.toFixed(2)}/month, fixed for {selectedTerm} years. 
              No surprises, no annual fees. {inputs.debtItems && inputs.debtItems.length > 0 ? `And if we roll in those credit cards, you're actually saving $${(inputs.debtItems.reduce((sum, d) => sum + d.payment, 0) - payment.pmt).toFixed(0)}/month net.` : ''}"</p>
            </div>
          </div>
        </div>

        <div className="bg-orange-50 p-4 rounded-lg">
          <h4 className="font-semibold text-orange-900 mb-2">🛡️ Complete Objection Library</h4>
          <div className="space-y-3 text-sm">
            {[
              { obj: "The rate is too high", resp: `I understand. Let's look at this - your credit cards are likely costing you 20%+. Even at ${payment.rate.toFixed(3)}%, you're saving significant interest. Plus, this is fixed. If rates drop, you can refinance. If they rise, you're protected.` },
              { obj: "I want to shop around", resp: "Absolutely, you should. Here's what to compare: our rate with no annual fees vs competitors. Many quote lower but add $100-300/year in fees or have variable rates that adjust upward." },
              { obj: "The origination fee", resp: `The ${tierData.orig}% ($${tierData.feeAmt.toLocaleString()}) pays for itself in ${breakEvenMonths > 0 ? breakEvenMonths.toFixed(0) : 'N/A'} months through lower payments vs the no-fee option. After that, you're saving $${monthlySavings.toFixed(0)}/month.` },
              { obj: "Fixed vs variable", resp: "With the current rate environment, fixed gives you certainty. A variable rate might start lower but could adjust up 2% per year. On a $100K loan, that's $2,000/year in potential increases." },
              { obj: "I need to think about it", resp: "Of course. Here's what I'd consider: rates can change daily. This quote is locked for today. Also, if you're consolidating debt, every month you wait costs you $[X] in high-interest payments." },
              { obj: "My bank offered me something", resp: "Great! What rate and terms did they offer? [Listen] Our ${payment.rate.toFixed(3)}% fixed with no annual fee is competitive. Plus, we close in 10-14 days vs 30-45 at most banks." },
            ].map((item, idx) => (
              <div key={idx}>
                <p className="font-medium text-orange-900">"{item.obj}"</p>
                <p className="text-orange-800 ml-2">→ {item.resp}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-purple-50 p-4 rounded-lg">
          <h4 className="font-semibold text-purple-900 mb-2">📧 Follow-Up Templates</h4>
          <div className="space-y-3 text-sm">
            <div className="bg-white p-3 rounded border border-purple-200">
              <p className="font-medium text-purple-900 mb-1">Same Day:</p>
              <p className="text-purple-800 text-xs">
                Hi {inputs.clientName?.split(' ')[0] || 'John'}, great speaking today. As promised, here are the numbers: 
                {payment.rate.toFixed(3)}% fixed, ${payment.pmt.toFixed(2)}/month, {tierData.orig}% origination. 
                This quote is valid through end of day tomorrow. Any questions?
              </p>
            </div>
            <div className="bg-white p-3 rounded border border-purple-200">
              <p className="font-medium text-purple-900 mb-1">3 Days:</p>
              <p className="text-purple-800 text-xs">
                Hi {inputs.clientName?.split(' ')[0] || 'John'}, wanted to check in on the HELOC we discussed. 
                Rates have {Math.random() > 0.5 ? 'stayed stable' : 'ticked up slightly'} since we spoke. 
                Still interested in moving forward?
              </p>
            </div>
            <div className="bg-white p-3 rounded border border-purple-200">
              <p className="font-medium text-purple-900 mb-1">1 Week:</p>
              <p className="text-purple-800 text-xs">
                Hi {inputs.clientName?.split(' ')[0] || 'John'}, following up on the HELOC quote. 
                The ${payment.rate.toFixed(3)}% rate we discussed is still available. 
                Given your {inputs.debtItems && inputs.debtItems.length > 0 ? 'credit card interest' : 'timeline'}, 
                wanted to make sure this is still on your radar.
              </p>
            </div>
          </div>
        </div>

        {tierData.cltv > 85 && (
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <h4 className="font-semibold text-red-900 mb-2">⚠️ Risk Assessment</h4>
            <ul className="text-sm text-red-800 list-disc list-inside">
              <li>CLTV at {tierData.cltv.toFixed(1)}% is {tierData.cltv > 90 ? 'high - may need manager approval' : 'elevated - monitor closely'}</li>
              <li>Consider appraisal review</li>
              <li>Verify income documentation is strong</li>
              {inputs.propertyType !== 'Primary Residence' && (
                <li>Investment property - additional documentation required</li>
              )}
            </ul>
          </div>
        )}

        <div className="bg-indigo-50 p-4 rounded-lg">
          <h4 className="font-semibold text-indigo-900 mb-2">📊 Competitive Analysis</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-indigo-700 border-b border-indigo-200">
                <th className="text-left py-1">Lender</th>
                <th className="text-left py-1">Est. Rate</th>
                <th className="text-left py-1">Fees</th>
              </tr>
            </thead>
            <tbody className="text-indigo-800">
              <tr className="bg-white">
                <td className="py-1 font-medium">Our Offer</td>
                <td className="py-1">{payment.rate.toFixed(3)}%</td>
                <td className="py-1">{tierData.orig}% orig</td>
              </tr>
              <tr>
                <td className="py-1">Chase (est.)</td>
                <td className="py-1">{(payment.rate + 0.375).toFixed(3)}%</td>
                <td className="py-1">$500 + annual</td>
              </tr>
              <tr>
                <td className="py-1">Wells Fargo (est.)</td>
                <td className="py-1">{(payment.rate + 0.625).toFixed(3)}%</td>
                <td className="py-1">Annual fee</td>
              </tr>
              <tr>
                <td className="py-1">Credit Union (est.)</td>
                <td className="py-1">{(payment.rate + 0.125).toFixed(3)}%</td>
                <td className="py-1">Membership req.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (userTier) {
      case 'enterprise':
        return renderEnterpriseContent();
      case 'pro':
        return renderProContent();
      case 'starter':
      default:
        return renderStarterContent();
    }
  };

  return (
    <div className="ezra-knowledge-base">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">🤖</span>
        <div>
          <h3 className="font-bold text-gray-900">Ezra</h3>
          <span className="text-xs text-gray-500 capitalize">{userTier} AI</span>
        </div>
      </div>
      
      {renderContent()}

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">
              Upgrade to {showUpgradeModal === 'pro' ? 'Pro' : 'Enterprise'}
            </h3>
            <p className="text-gray-600 mb-4">
              {showUpgradeModal === 'pro' 
                ? 'Get AI-generated strategies, sales scripts, and objection handlers for every quote.'
                : 'Unlock competitive analysis, risk assessment, email templates, and unlimited AI usage.'}
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowUpgradeModal(null)}
                className="flex-1 py-2 border rounded-lg hover:bg-gray-50"
              >
                Maybe Later
              </button>
              <button 
                onClick={() => {
                  // Navigate to billing/upgrade page
                  window.location.href = '/settings?tab=billing';
                }}
                className="flex-1 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
              >
                Upgrade Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
