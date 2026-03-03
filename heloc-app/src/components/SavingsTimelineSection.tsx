import React from 'react';
import type { QuoteResult } from '../types';

interface Props {
    quoteResult: QuoteResult;
    refiBalance: number;
    refiPayment: number;
}

export const SavingsTimelineSection: React.FC<Props> = ({ quoteResult, refiBalance, refiPayment }) => {
    // If no refi balance, don't show
    if (refiBalance <= 0) return null;

    // New HELOC Payment for the Refi Balance Amount
    // Use Tier 2 20-Year as baseline for comparison
    const helocRate = quoteResult.results.t2.payments[20]?.rate || 7.5; // Default fallback
    const r = helocRate / 100 / 12;
    const n = 20 * 12; // 20 years

    const newPayment = (helocRate > 0 && refiBalance > 0)
        ? (refiBalance * r) / (1 - Math.pow(1 + r, -n))
        : 0;

    const monthlyDiff = refiPayment - newPayment;
    const oneYearSavings = monthlyDiff * 12;
    const fiveYearSavings = monthlyDiff * 60;
    const lifetimeSavings = monthlyDiff * n; // Assuming full term difference

    return (
        <div className="analysis-box p-2 rounded bg-blue-50 border border-blue-200 text-blue-900 text-xs visible block mt-2">
            <div className="analysis-title font-bold uppercase mb-1">🔄 HELOC Refi Comparison</div>
            <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                <div className="bg-white p-1 rounded shadow-sm">
                    <div className="opacity-70 uppercase font-bold text-[8px]">Old Payment</div>
                    <div className="font-bold text-blue-900">${refiPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <div className="bg-white p-1 rounded shadow-sm">
                    <div className="opacity-70 uppercase font-bold text-[8px]">Difference</div>
                    <div className={`font-bold ${monthlyDiff > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {monthlyDiff > 0 ? '+' : ''}${monthlyDiff.toFixed(2)}/mo
                    </div>
                </div>
                <div className="bg-white p-1 rounded shadow-sm">
                    <div className="opacity-70 uppercase font-bold text-[8px]">Lifetime Savings</div>
                    <div className={`font-bold ${lifetimeSavings > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${lifetimeSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                </div>
                {/* 1 Year */}
                <div className="bg-white p-1 rounded shadow-sm col-span-1">
                    <div className="opacity-70 uppercase font-bold text-[8px]">1-Year</div>
                    <div className="font-bold text-blue-900">${oneYearSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                {/* 5 Year */}
                <div className="bg-white p-1 rounded shadow-sm col-span-2">
                    <div className="opacity-70 uppercase font-bold text-[8px]">5-Year Savings</div>
                    <div className="font-bold text-blue-900">${fiveYearSavings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
            </div>
        </div>
    );
};
