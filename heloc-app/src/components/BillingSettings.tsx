import React from 'react';
import { useTier } from '../hooks/useTier';
import type { Tier } from './AuthProvider';

const TIER_PRICING: Record<Tier, { price: number; list: string[] }> = {
    starter: { price: 79, list: ['HELOC Quote Builder', 'Refinance Architect', 'PDF/Screenshot/Email', 'Lender Parser', 'URL Shortener'] },
    pro: { price: 179, list: ['Everything in Starter', 'Leads Pipeline', 'Ezra AI (50/day)', 'CRM Sync (Bonzo/GHL/FUB)', 'Client Quote Pages'] },
    enterprise: { price: 497, list: ['Everything in Pro', '5 Team Seats', 'White Label', 'Unlimited AI', 'HeyGen Video', 'Priority Support'] },
};

export const BillingSettings: React.FC = () => {
    const { tier } = useTier();

    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6 pb-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Subscription & Billing</h2>
            <p className="text-sm text-gray-500 mb-8">
                Manage your current tier and upgrade to access more features.
            </p>

            <div className="bg-white rounded-lg border shadow-sm p-6 mb-8 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between">
                <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-1">Current Plan</h3>
                    <p className="text-gray-600 mb-0">
                        You are currently on the <strong className="capitalize text-blue-700">{tier ?? 'starter'}</strong> tier.
                    </p>
                </div>
                <div className="mt-4 sm:mt-0">
                    <button className="px-4 py-2 bg-gray-100 text-gray-700 font-medium rounded hover:bg-gray-200 transition text-sm">
                        Manage in Stripe
                    </button>
                </div>
            </div>

            <h3 className="text-xl font-bold text-gray-800 mb-6 font-display border-b pb-2">Available Plans</h3>
            <div className="space-y-4">
                {(Object.entries(TIER_PRICING) as [Tier, { price: number; list: string[] }][]).map(([key, data]) => {
                    const isCurrent = key === tier;
                    return (
                        <div key={key} className={`flex flex-col sm:flex-row border rounded-lg p-6 ${isCurrent ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 bg-white'}`}>
                            <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-2">
                                    <h4 className="text-lg font-bold text-gray-900 capitalize">{key}</h4>
                                    {isCurrent && <span className="bg-blue-600 text-white text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full">Current Plan</span>}
                                </div>
                                <div className="text-2xl font-black text-gray-900 mb-3">${data.price}<span className="text-sm text-gray-500 font-medium">/mo</span></div>
                                <ul className="space-y-1 mb-4 sm:mb-0">
                                    {data.list.map((item, i) => (
                                        <li key={i} className="text-sm text-gray-600 flex items-start">
                                            <span className="text-green-500 mr-2 mt-0.5">✓</span> {item}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            <div className="pt-4 sm:pt-0 sm:pl-6 flex items-center justify-center sm:justify-end border-t sm:border-t-0 sm:border-l border-gray-100 sm:w-48">
                                <button
                                    disabled={isCurrent}
                                    className={`w-full py-2.5 rounded text-sm font-bold transition ${isCurrent
                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                                        }`}
                                >
                                    {isCurrent ? 'Active' : 'Upgrade'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
            <p className="text-xs text-gray-400 mt-6 text-center">
                Payment processing is securely handled by Stripe. Need help? Contact support.
            </p>
        </div>
    );
};
