import React, { useState } from 'react';
import type { LoanInputs, QuoteResult } from '../types';
import { BlendedRateSection } from './BlendedRateSection';
import { SavingsTimelineSection } from './SavingsTimelineSection';
import { EzraKnowledgeBase } from './EzraKnowledgeBase';
import { useAuth } from './AuthProvider';

interface Props {
    quoteResult: QuoteResult;
    inputs: LoanInputs;
}

export const Analysis: React.FC<Props> = ({ quoteResult, inputs }) => {
    const { tier } = useAuth();
    const [activeTab, setActiveTab] = useState<'strategy' | 'comparison' | 'debt' | 'refi'>('strategy');
    const [selectedTier, setSelectedTier] = useState<'t1' | 't2' | 't3'>('t2');
    const [selectedTerm, setSelectedTerm] = useState<number>(20);

    // Break-Even Analysis: Tier 2 vs Tier 3
    const t2 = quoteResult.results.t2;
    const t3 = quoteResult.results.t3;
    const term = 20;

    const t2Upfront = t2.feeAmt;
    const t3Upfront = t3.feeAmt;
    const upfrontDiff = t2Upfront - t3Upfront;

    const t2Pmt = t2.payments[term]?.pmt || 0;
    const t3Pmt = t3.payments[term]?.pmt || 0;
    const monthlySavings = t3Pmt - t2Pmt;
    
    let breakEvenMonths: number | 'immediate' | 'never' = 0;
    if (upfrontDiff > 0 && monthlySavings > 0) {
        breakEvenMonths = upfrontDiff / monthlySavings;
    } else if (upfrontDiff <= 0) {
        breakEvenMonths = 'immediate';
    } else {
        breakEvenMonths = 'never';
    }

    const renderBreakEvenContent = () => {
        if (breakEvenMonths === 'immediate') {
            return (
                <div className="text-center">
                    <p className="text-lg font-bold text-green-600">Immediate Savings</p>
                    <p className="text-sm text-gray-600">Tier 2 costs less upfront AND has lower payments</p>
                </div>
            );
        }
        if (breakEvenMonths === 'never') {
            return (
                <div className="text-center">
                    <p className="text-lg font-bold text-red-600">No Break-Even</p>
                    <p className="text-sm text-gray-600">Tier 2 costs more upfront AND has higher payments</p>
                </div>
            );
        }
        return (
            <div className="flex justify-between gap-2 text-center">
                <div>
                    <p className="text-xs text-gray-500 uppercase">Upfront Cost Diff</p>
                    <p className="font-bold text-lg">${upfrontDiff.toLocaleString()}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-500 uppercase">Monthly Savings</p>
                    <p className="font-bold text-lg">${monthlySavings.toFixed(2)}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-500 uppercase">Break-Even</p>
                    <p className="font-bold text-lg text-blue-600">{breakEvenMonths.toFixed(0)} months</p>
                </div>
            </div>
        );
    };

    return (
        <div className="my-4 space-y-4">
            {/* Tab Navigation */}
            <div className="flex border-b border-gray-200">
                {[
                    { id: 'strategy', label: '🤖 Ezra Strategy', tier: 'starter' },
                    { id: 'comparison', label: '⚖️ Break-Even', tier: 'starter' },
                    { id: 'debt', label: '💳 Debt Analysis', tier: 'pro' },
                    { id: 'refi', label: '🔄 Refi Compare', tier: 'pro' },
                ].map((tab) => {
                    const isLocked = tier === 'starter' && tab.tier === 'pro';
                    return (
                        <button
                            key={tab.id}
                            onClick={() => !isLocked && setActiveTab(tab.id as any)}
                            className={`flex-1 py-3 px-4 text-sm font-medium border-b-2 transition ${
                                activeTab === tab.id
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            } ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            {tab.label}
                            {isLocked && <span className="ml-1 text-xs">🔒</span>}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div className="bg-white rounded-lg border p-4">
                {activeTab === 'strategy' && (
                    <div>
                        {/* Tier/Term Selector */}
                        <div className="flex gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
                            <div>
                                <label className="text-xs font-medium text-gray-500 uppercase">Tier</label>
                                <select
                                    value={selectedTier}
                                    onChange={(e) => setSelectedTier(e.target.value as 't1' | 't2' | 't3')}
                                    className="block w-full mt-1 p-2 border rounded text-sm"
                                >
                                    <option value="t1">Tier 1 - Best Rate</option>
                                    <option value="t2">Tier 2 - Balanced</option>
                                    <option value="t3">Tier 3 - No Points</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-medium text-gray-500 uppercase">Term</label>
                                <select
                                    value={selectedTerm}
                                    onChange={(e) => setSelectedTerm(Number(e.target.value))}
                                    className="block w-full mt-1 p-2 border rounded text-sm"
                                >
                                    <option value={10}>10 Years</option>
                                    <option value={15}>15 Years</option>
                                    <option value={20}>20 Years</option>
                                    <option value={30}>30 Years</option>
                                </select>
                            </div>
                        </div>

                        <EzraKnowledgeBase
                            inputs={inputs}
                            quoteResult={quoteResult}
                            selectedTier={selectedTier}
                            selectedTerm={selectedTerm}
                            activeTab={activeTab}
                        />
                    </div>
                )}

                {activeTab === 'comparison' && (
                    <div className="space-y-4">
                        <h4 className="font-bold text-gray-800">📊 Break-Even Analysis (Tier 2 vs Tier 3)</h4>
                        <p className="text-sm text-gray-600">
                            Comparing Tier 2 (lower rate with points) vs Tier 3 (higher rate, no points).
                            This shows how long it takes to recover the upfront cost through lower monthly payments.
                        </p>
                        <div className="bg-blue-50 p-4 rounded-lg">
                            {renderBreakEvenContent()}
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                            <p>💡 <strong>How to read this:</strong></p>
                            <ul className="list-disc list-inside ml-2 mt-1">
                                <li>If break-even is under 24 months, Tier 2 is usually better</li>
                                <li>If the client plans to keep the loan short-term, Tier 3 may be better</li>
                                <li>Consider the client's timeline when recommending</li>
                            </ul>
                        </div>
                    </div>
                )}

                {activeTab === 'debt' && tier === 'starter' && (
                    <div className="text-center py-8">
                        <span className="text-4xl">🔒</span>
                        <h4 className="font-bold text-gray-800 mt-2">Pro Feature</h4>
                        <p className="text-gray-600 text-sm mt-1">
                            Debt consolidation analysis is available in Pro tier.
                        </p>
                        <button 
                            onClick={() => window.location.href = '/settings?tab=billing'}
                            className="mt-4 bg-purple-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-purple-700"
                        >
                            Upgrade to Pro
                        </button>
                    </div>
                )}

                {activeTab === 'debt' && tier !== 'starter' && (
                    <BlendedRateSection
                        debtItems={inputs.debtItems}
                        quoteResult={quoteResult}
                    />
                )}

                {activeTab === 'refi' && tier === 'starter' && (
                    <div className="text-center py-8">
                        <span className="text-4xl">🔒</span>
                        <h4 className="font-bold text-gray-800 mt-2">Pro Feature</h4>
                        <p className="text-gray-600 text-sm mt-1">
                            Refinance comparison is available in Pro tier.
                        </p>
                        <button 
                            onClick={() => window.location.href = '/settings?tab=billing'}
                            className="mt-4 bg-purple-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-purple-700"
                        >
                            Upgrade to Pro
                        </button>
                    </div>
                )}

                {activeTab === 'refi' && tier !== 'starter' && (
                    <SavingsTimelineSection
                        quoteResult={quoteResult}
                        refiBalance={inputs.refiBalance}
                        refiPayment={inputs.refiPayment}
                    />
                )}
            </div>
        </div>
    );
};
