import React from 'react';
import type { LoanInputs, QuoteResult } from '../types';
import { BlendedRateSection } from './BlendedRateSection';
import { SavingsTimelineSection } from './SavingsTimelineSection';

interface Props {
    quoteResult: QuoteResult;
    inputs: LoanInputs;
}

export const Analysis: React.FC<Props> = ({ quoteResult, inputs }) => {
    // Break-Even Analysis: Tier 2 vs Tier 3
    // Tier 2 (Standard/Rec) vs Tier 3 (Par/No Points)
    // T2 usually has Points but Lower Rate. T3 has No Points but Higher Rate.
    // We compare T2 against T3.

    const t2 = quoteResult.results.t2;
    const t3 = quoteResult.results.t3;

    // Use 20-Year Fixed as the baseline for comparison
    const term = 20;

    const t2Upfront = t2.feeAmt; // Origination Amount
    const t3Upfront = t3.feeAmt;
    const upfrontDiff = t2Upfront - t3Upfront; // How much MORE T2 costs upfront

    const t2Pmt = t2.payments[term]?.pmt || 0;
    const t3Pmt = t3.payments[term]?.pmt || 0;
    const monthlySavings = t3Pmt - t2Pmt; // How much T2 saves per month vs T3

    const breakEvenMonths = (monthlySavings > 0) ? (upfrontDiff / monthlySavings) : 0;

    return (
        <div className="my-4 space-y-3">
            {/* Break Even */}
            <div className="analysis-box p-2 rounded bg-green-50 border border-green-200 text-green-900 text-xs text-[10px]">
                <div className="analysis-title font-bold uppercase mb-1">📊 Break-Even Analysis (Tier 2 vs Tier 3)</div>
                <div className="flex justify-between gap-2">
                    <span>Upfront Cost: <strong>${upfrontDiff.toLocaleString()}</strong></span>
                    <span>Monthly Savings: <strong>${monthlySavings.toFixed(2)}</strong></span>
                    <span>Break-Even: <strong>{breakEvenMonths.toFixed(1)}</strong> months</span>
                </div>
            </div>

            {/* Savings Timeline (Refi Comparison) */}
            <SavingsTimelineSection
                quoteResult={quoteResult}
                refiBalance={inputs.refiBalance}
                refiPayment={inputs.refiPayment}
            />

            {/* Debt Consolidation (Blended Rate) */}
            <BlendedRateSection
                debtItems={inputs.debtItems}
                quoteResult={quoteResult}
            />

            {/* AI Assistant Stub */}
            <div className="analysis-box p-2 rounded bg-purple-50 border border-purple-200 text-purple-900 text-xs">
                <div className="analysis-title font-bold uppercase mb-1">🤖 AI-Generated Strategy</div>
                <div className="bg-white p-2 rounded italic border-l-2 border-purple-500">
                    Click "Generate AI Strategy" to create a personalized sales script based on this client's data.
                </div>
            </div>
        </div>
    );
};
