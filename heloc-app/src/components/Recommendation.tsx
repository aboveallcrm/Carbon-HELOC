import React, { useState } from 'react';
import type { QuoteResult, TierResult } from '../types';
import { fmtCurrencyExact } from '../utils/currency';

interface Props {
  quoteResult: QuoteResult;
  netCash: number;
  selectedTier?: 't1' | 't2' | 't3';
  selectedTerm?: number;
  rateType?: 'fixed' | 'variable';
  onTierChange?: (tier: 't1' | 't2' | 't3') => void;
  onTermChange?: (term: number) => void;
  onRateTypeChange?: (type: 'fixed' | 'variable') => void;
  editable?: boolean;
}

const tierNames = {
  t1: 'Tier 1 - Best Rate',
  t2: 'Tier 2 - Balanced',
  t3: 'Tier 3 - No Points',
};

const tierTaglines = {
  t1: 'Lowest rate with origination points - best for long-term savings',
  t2: 'The "Sweet Spot" balancing rate + capital preservation',
  t3: 'No origination points - best for short-term or lower loan amounts',
};

export const Recommendation: React.FC<Props> = ({ 
  quoteResult, 
  netCash,
  selectedTier: propSelectedTier,
  selectedTerm: propSelectedTerm,
  rateType: propRateType,
  onTierChange,
  onTermChange,
  onRateTypeChange,
  editable = true,
}) => {
  // Local state for editable mode
  const [localTier, setLocalTier] = useState<'t1' | 't2' | 't3'>(propSelectedTier || 't2');
  const [localTerm, setLocalTerm] = useState<number>(propSelectedTerm || 20);
  const [localRateType, setLocalRateType] = useState<'fixed' | 'variable'>(propRateType || 'fixed');

  // Use props if provided, otherwise local state
  const activeTier = propSelectedTier ?? localTier;
  const activeTerm = propSelectedTerm ?? localTerm;
  const activeRateType = propRateType ?? localRateType;

  const handleTierChange = (tier: 't1' | 't2' | 't3') => {
    setLocalTier(tier);
    onTierChange?.(tier);
  };

  const handleTermChange = (term: number) => {
    setLocalTerm(term);
    onTermChange?.(term);
  };

  const handleRateTypeChange = (type: 'fixed' | 'variable') => {
    setLocalRateType(type);
    onRateTypeChange?.(type);
  };

  const tierData: TierResult = quoteResult.results[activeTier];
  const paymentData = activeRateType === 'fixed' 
    ? tierData.payments[activeTerm]
    : tierData.varPayments[activeTerm];

  if (!paymentData) {
    return <div className="text-gray-500 text-center py-8">No rate data available for selected options</div>;
  }

  const rate = paymentData.rate;
  const pmt = paymentData.pmt;
  const origAmt = tierData.feeAmt;
  const totalLoan = tierData.totalLoan;

  return (
    <div id="recommendation-section" className="my-6">
      {/* Editable Controls */}
      {editable && (
        <div className="bg-gray-50 rounded-xl p-4 mb-6 border">
          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <span>⚙️</span> Customize Recommendation
          </h4>
          
          {/* Tier Selection */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">Select Tier</label>
            <div className="flex flex-wrap gap-2">
              {(['t1', 't2', 't3'] as const).map(tier => (
                <button
                  key={tier}
                  onClick={() => handleTierChange(tier)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    activeTier === tier
                      ? 'bg-slate-800 text-white'
                      : 'bg-white border text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {tierNames[tier]}
                </button>
              ))}
            </div>
          </div>

          {/* Term Selection */}
          <div className="mb-4">
            <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">Loan Term</label>
            <div className="flex flex-wrap gap-2">
              {[30, 20, 15, 10].map(term => (
                <button
                  key={term}
                  onClick={() => handleTermChange(term)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    activeTerm === term
                      ? 'bg-blue-600 text-white'
                      : 'bg-white border text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {term} Years
                </button>
              ))}
            </div>
          </div>

          {/* Rate Type Selection */}
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">Rate Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => handleRateTypeChange('fixed')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeRateType === 'fixed'
                    ? 'bg-green-600 text-white'
                    : 'bg-white border text-gray-600 hover:bg-gray-50'
                }`}
              >
                🔒 Fixed
              </button>
              <button
                onClick={() => handleRateTypeChange('variable')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeRateType === 'variable'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white border text-gray-600 hover:bg-gray-50'
                }`}
              >
                📈 Variable
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Box */}
      <div className="certificate-box bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-400 rounded-2xl p-8 text-center relative overflow-hidden">
        {/* Decorative Background */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 left-0 w-32 h-32 bg-yellow-400 rounded-full -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-40 h-40 bg-yellow-400 rounded-full translate-x-1/3 translate-y-1/3" />
        </div>

        <div className="relative">
          <div className="cert-icon text-4xl mb-4">★</div>
          
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            Recommended Option
          </h2>
          
          <div className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm mb-4">
            <span className="text-2xl">
              {activeRateType === 'fixed' ? '🔒' : '📈'}
            </span>
            <span className="text-blue-600 font-bold text-xl">
              {activeTerm}-YEAR {activeRateType.toUpperCase()}
            </span>
          </div>

          <div className="main-offer text-3xl font-extrabold text-yellow-600 my-4">
            {rate.toFixed(3)}% Rate
          </div>

          <div className="text-lg text-slate-600 mb-2">
            {tierData.orig}% Origination ({fmtCurrencyExact(origAmt)})
          </div>

          <div className="tagline text-gray-500 text-sm max-w-md mx-auto">
            {tierTaglines[activeTier]}
          </div>
        </div>
      </div>

      {/* Payment Snapshot */}
      <h3 className="mt-6 mb-3 uppercase text-xs font-bold text-slate-800 border-b-2 border-yellow-400 pb-2 flex items-center gap-2">
        <span>📋</span> Loan Details
      </h3>
      
      <div className="snapshot-container border border-gray-200 rounded-xl bg-white overflow-hidden shadow-sm">
        <div className="snapshot-row flex justify-between p-4 border-b border-gray-100 bg-gray-50">
          <span className="snap-label font-bold text-xs uppercase text-slate-600">Cash Back to Client</span>
          <span className="snap-value font-bold text-lg text-slate-800">{fmtCurrencyExact(netCash)}</span>
        </div>
        
        <div className="snapshot-row flex justify-between p-4 border-b border-gray-100">
          <span className="snap-label font-bold text-xs uppercase text-slate-600">Origination Points</span>
          <span className="snap-value font-bold text-slate-800">
            {tierData.orig}% <span className="text-gray-400 font-normal">({fmtCurrencyExact(origAmt)})</span>
          </span>
        </div>
        
        <div className="snapshot-row flex justify-between p-4 border-b border-gray-100 bg-gray-50">
          <span className="snap-label font-bold text-xs uppercase text-slate-600">Total Loan Amount</span>
          <span className="snap-value font-bold text-slate-800">{fmtCurrencyExact(totalLoan)}</span>
        </div>
        
        <div className="snapshot-row flex justify-between p-4 border-b border-gray-100">
          <span className="snap-label font-bold text-xs uppercase text-slate-600">Interest Rate</span>
          <span className="snap-value font-bold text-slate-800">
            {rate.toFixed(3)}% {activeRateType === 'fixed' ? 'Fixed' : 'Variable'}
          </span>
        </div>
        
        <div className="snapshot-row flex justify-between p-4 border-b border-gray-100 bg-gray-50">
          <span className="snap-label font-bold text-xs uppercase text-slate-600">Loan Term</span>
          <span className="snap-value font-bold text-slate-800">{activeTerm} Years</span>
        </div>

        <div className="snapshot-row flex justify-between p-4 border-b border-gray-100">
          <span className="snap-label font-bold text-xs uppercase text-slate-600">CLTV Ratio</span>
          <span className={`snap-value font-bold ${tierData.cltv > 90 ? 'text-red-600' : 'text-slate-800'}`}>
            {tierData.cltv.toFixed(1)}%
            {tierData.cltv > 90 && <span className="text-xs ml-2">⚠️ High</span>}
          </span>
        </div>
        
        {/* Final Payment Row */}
        <div className="snapshot-row final flex justify-between p-5 bg-slate-800 text-white">
          <span className="snap-label font-bold text-sm uppercase text-white/80">Monthly Payment</span>
          <span className="snap-value font-extrabold text-2xl text-yellow-400">{fmtCurrencyExact(pmt)}</span>
        </div>
      </div>

      {/* CLTV Warning */}
      {tierData.cltv > 90 && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <span className="text-xl">⚠️</span>
          <div>
            <div className="font-semibold text-red-800">High CLTV Warning</div>
            <div className="text-sm text-red-600">
              The combined loan-to-value ratio is above 90%. This may require additional review or approval.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
