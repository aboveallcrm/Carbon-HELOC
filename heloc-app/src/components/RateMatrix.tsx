import React from 'react';
import type { QuoteResult, TierResult } from '../types';
import { fmtCurrencyExact } from '../utils/currency';

interface Props {
  quoteResult: QuoteResult;
  showTiers?: ('t1' | 't2' | 't3')[];
  rateDisplay?: 'fixed' | 'variable' | 'both';
  highlightedTier?: 't1' | 't2' | 't3';
  onTierSelect?: (tier: 't1' | 't2' | 't3') => void;
}

const tierNames = {
  t1: 'Tier 1 - Best Rate',
  t2: 'Tier 2 - Balanced',
  t3: 'Tier 3 - No Points',
};

const tierColors = {
  t1: 'border-green-500 bg-green-50',
  t2: 'border-blue-500 bg-blue-50',
  t3: 'border-gray-500 bg-gray-50',
};

export const RateMatrix: React.FC<Props> = ({ 
  quoteResult, 
  showTiers = ['t1', 't2', 't3'],
  rateDisplay = 'both',
  highlightedTier,
  onTierSelect,
}) => {
  const terms = [30, 20, 15, 10];

  const renderTierCard = (tierKey: 't1' | 't2' | 't3') => {
    const tier: TierResult = quoteResult.results[tierKey];
    const isHighlighted = highlightedTier === tierKey;
    
    return (
      <div 
        key={tierKey}
        onClick={() => onTierSelect?.(tierKey)}
        className={`bg-white border-2 rounded-xl overflow-hidden transition-all ${
          isHighlighted ? tierColors[tierKey] : 'border-gray-200 hover:border-gray-300'
        } ${onTierSelect ? 'cursor-pointer' : ''}`}
      >
        {/* Tier Header */}
        <div className={`p-4 border-b ${isHighlighted ? 'border-current' : 'border-gray-100'}`}>
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-gray-800">{tierNames[tierKey]}</h4>
            {isHighlighted && <span className="text-lg">⭐</span>}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Origination: <span className="font-semibold">{tier.orig}%</span>
            {' '}(<span className="font-semibold">{fmtCurrencyExact(tier.feeAmt)}</span>)
          </div>
          <div className="text-sm text-gray-500">
            Total Loan: <span className="font-semibold">{fmtCurrencyExact(tier.totalLoan)}</span>
          </div>
        </div>

        {/* Fixed Rates */}
        {(rateDisplay === 'fixed' || rateDisplay === 'both') && (
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🔒</span>
              <span className="font-semibold text-gray-700">Fixed Rates</span>
            </div>
            <div className="space-y-2">
              {terms.map(term => {
                const payment = tier.payments[term];
                if (!payment) return null;
                return (
                  <div 
                    key={`fixed-${term}`}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                  >
                    <span className="text-sm font-medium text-gray-600">{term} Year</span>
                    <div className="text-right">
                      <div className="font-bold text-gray-800">{payment.rate.toFixed(3)}%</div>
                      <div className="text-xs text-gray-500">{fmtCurrencyExact(payment.pmt)}/mo</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Variable Rates */}
        {(rateDisplay === 'variable' || rateDisplay === 'both') && (
          <div className={`p-4 ${rateDisplay === 'both' ? 'border-t border-gray-100' : ''}`}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">📈</span>
              <span className="font-semibold text-purple-700">Variable Rates</span>
            </div>
            <div className="space-y-2">
              {terms.map(term => {
                const payment = tier.varPayments[term];
                if (!payment) return null;
                return (
                  <div 
                    key={`var-${term}`}
                    className="flex items-center justify-between p-2 bg-purple-50 rounded-lg"
                  >
                    <span className="text-sm font-medium text-purple-600">{term} Year</span>
                    <div className="text-right">
                      <div className="font-bold text-purple-800">{payment.rate.toFixed(3)}%</div>
                      <div className="text-xs text-purple-500">{fmtCurrencyExact(payment.pmt)}/mo</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Select Button */}
        {onTierSelect && (
          <div className="p-4 border-t border-gray-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTierSelect(tierKey);
              }}
              className={`w-full py-2 rounded-lg font-medium transition ${
                isHighlighted
                  ? 'bg-slate-800 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {isHighlighted ? 'Selected' : 'Select This Option'}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className={`grid gap-4 ${
        showTiers.length === 1 ? 'grid-cols-1 max-w-md mx-auto' :
        showTiers.length === 2 ? 'grid-cols-1 md:grid-cols-2' :
        'grid-cols-1 md:grid-cols-3'
      }`}>
        {showTiers.includes('t1') && renderTierCard('t1')}
        {showTiers.includes('t2') && renderTierCard('t2')}
        {showTiers.includes('t3') && renderTierCard('t3')}
      </div>
    </div>
  );
};
