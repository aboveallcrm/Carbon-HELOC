import React from 'react';
import type { QuoteResult, TierResult } from '../types';
import { fmtCurrencyExact } from '../utils/currency';

interface Props {
    quoteResult: QuoteResult;
    netCash: number;
}

export const Recommendation: React.FC<Props> = ({ quoteResult, netCash }) => {
    // Default Recommendation: Tier 2, 20-Year Fixed
    // In a real app, this might be configurable or dynamic based on lowest rate/payment
    const recTierKey = 't2';
    const recTerm = 20;

    const tierData: TierResult = quoteResult.results[recTierKey];
    const paymentData = tierData.payments[recTerm];
    const rate = paymentData.rate;
    const pmt = paymentData.pmt;
    const origAmt = tierData.feeAmt;
    const totalLoan = tierData.totalLoan;

    return (
        <div id="recommendation-section" className="my-6">
            {/* Certificate Box */}
            <div className="certificate-box">
                <div className="cert-icon">★</div>
                <h2>Recommended <span className="text-blue-500">{recTerm}-YEAR</span> <span className="text-blue-500">FIXED</span></h2>
                <div className="main-offer text-xl font-extrabold text-yellow-600 my-2">
                    {recTerm}-Yr @ {rate.toFixed(3)}% | {tierData.orig}% Orig | {fmtCurrencyExact(pmt)}/mo
                </div>
                <div className="tagline text-gray-500 text-xs">
                    The "Sweet Spot" balancing rate + capital preservation.
                </div>
            </div>

            {/* Payment Snapshot */}
            <h3 className="mt-4 mb-2 uppercase text-xs font-bold text-slate-800 border-b border-yellow-600 pb-1">Monthly Payment Snapshot</h3>
            <div className="snapshot-container border border-gray-200 rounded bg-white overflow-hidden">
                <div className="snapshot-row flex justify-between p-2 border-b border-gray-100 bg-gray-50">
                    <span className="snap-label font-bold text-xs uppercase text-slate-600">Cash Back to Client</span>
                    <span className="snap-value font-bold text-sm text-slate-800">{fmtCurrencyExact(netCash)}</span>
                </div>
                <div className="snapshot-row flex justify-between p-2 border-b border-gray-100">
                    <span className="snap-label font-bold text-xs uppercase text-slate-600">Origination Points</span>
                    <span className="snap-value font-bold text-sm text-slate-800">{tierData.orig}% ({fmtCurrencyExact(origAmt)})</span>
                </div>
                <div className="snapshot-row flex justify-between p-2 border-b border-gray-100 bg-gray-50">
                    <span className="snap-label font-bold text-xs uppercase text-slate-600">Total Loan Amount</span>
                    <span className="snap-value font-bold text-sm text-slate-800">{fmtCurrencyExact(totalLoan)}</span>
                </div>
                <div className="snapshot-row flex justify-between p-2 border-b border-gray-100">
                    <span className="snap-label font-bold text-xs uppercase text-slate-600">Interest Rate</span>
                    <span className="snap-value font-bold text-sm text-slate-800">{rate.toFixed(3)}% Fixed</span>
                </div>
                <div className="snapshot-row flex justify-between p-2 border-b border-gray-100 bg-gray-50">
                    <span className="snap-label font-bold text-xs uppercase text-slate-600">Loan Term</span>
                    <span className="snap-value font-bold text-sm text-slate-800">{recTerm} Years</span>
                </div>
                {/* Final Row */}
                <div className="snapshot-row final flex justify-between p-3 bg-slate-800 text-white">
                    <span className="snap-label font-bold text-xs uppercase text-white/80">Your Payment</span>
                    <span className="snap-value font-extrabold text-xl text-yellow-500">{fmtCurrencyExact(pmt)}</span>
                </div>
            </div>
        </div>
    );
};
