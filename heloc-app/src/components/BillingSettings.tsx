import React, { useState } from 'react';
import { useTier } from '../hooks/useTier';
import { useTokens, AI_FEATURE_COSTS } from '../hooks/useTokens';
import type { Tier } from './AuthProvider';

const TIER_PRICING: Record<Tier, { price: number; list: string[]; monthlyTokens: number }> = {
    starter: { 
        price: 79, 
        list: ['HELOC Quote Builder', 'Refinance Architect', 'PDF/Screenshot/Email', 'Lender Parser', 'URL Shortener'],
        monthlyTokens: 100
    },
    pro: { 
        price: 179, 
        list: ['Everything in Starter', 'Leads Pipeline', 'Ezra AI with Tokens', 'CRM Sync (Bonzo/GHL/FUB)', 'Client Quote Pages'],
        monthlyTokens: 500
    },
    enterprise: { 
        price: 497, 
        list: ['Everything in Pro', '5 Team Seats', 'White Label', 'Ezra AI with Tokens', 'HeyGen Video', 'Priority Support'],
        monthlyTokens: 2000
    },
};

// Token package pricing
const TOKEN_PACKAGES = [
    { name: 'Starter Pack', tokens: 500, price: 4.99, bonus: 0 },
    { name: 'Pro Pack', tokens: 2000, price: 14.99, bonus: 10 },
    { name: 'Power Pack', tokens: 5000, price: 29.99, bonus: 20 },
    { name: 'Enterprise Pack', tokens: 15000, price: 79.99, bonus: 50 },
];

export const BillingSettings: React.FC = () => {
    const { tier } = useTier();
    const { balance, hasEnoughTokens } = useTokens();
    const [activeTab, setActiveTab] = useState<'subscription' | 'tokens'>('subscription');
    const [showTokenModal, setShowTokenModal] = useState(false);

    const currentBalance = balance?.balance || 0;
    const monthlyBonus = TIER_PRICING[tier || 'starter'].monthlyTokens;

    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6 pb-20">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Subscription & Billing</h2>
            <p className="text-sm text-gray-500 mb-8">
                Manage your subscription, tokens, and billing preferences.
            </p>

            {/* Token Balance Card */}
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-200 p-6 mb-8">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center text-2xl">
                            ⚡
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-purple-900">AI Token Balance</h3>
                            <p className="text-sm text-purple-700">
                                {currentBalance.toLocaleString()} tokens available
                            </p>
                            <p className="text-xs text-purple-600">
                                +{monthlyBonus.toLocaleString()} tokens monthly with {tier} plan
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={() => setShowTokenModal(true)}
                        className="px-4 py-2 bg-purple-600 text-white font-medium rounded-lg hover:bg-purple-700 transition text-sm"
                    >
                        Buy Tokens
                    </button>
                </div>

                {/* Feature Costs */}
                <div className="mt-4 pt-4 border-t border-purple-200">
                    <p className="text-xs font-medium text-purple-800 mb-2">AI FEATURE COSTS:</p>
                    <div className="flex flex-wrap gap-2">
                        {Object.values(AI_FEATURE_COSTS).map((feature) => (
                            <span 
                                key={feature.featureType}
                                className={`
                                    inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium
                                    ${hasEnoughTokens(feature.featureType) 
                                        ? 'bg-white text-purple-700' 
                                        : 'bg-purple-200/50 text-purple-500'}
                                `}
                            >
                                <span>⚡</span>
                                {feature.tokenCost}
                                <span className="opacity-75">- {feature.description}</span>
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-4 border-b mb-6">
                <button
                    onClick={() => setActiveTab('subscription')}
                    className={`pb-2 text-sm font-medium transition-colors ${
                        activeTab === 'subscription' 
                            ? 'text-blue-600 border-b-2 border-blue-600' 
                            : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    Subscription Plans
                </button>
                <button
                    onClick={() => setActiveTab('tokens')}
                    className={`pb-2 text-sm font-medium transition-colors ${
                        activeTab === 'tokens' 
                            ? 'text-blue-600 border-b-2 border-blue-600' 
                            : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    Token Packages
                </button>
            </div>

            {activeTab === 'subscription' ? (
                <>
                    <div className="bg-white rounded-lg border shadow-sm p-6 mb-8 text-center sm:text-left flex flex-col sm:flex-row items-center justify-between">
                        <div>
                            <h3 className="text-lg font-bold text-gray-800 mb-1">Current Plan</h3>
                            <p className="text-gray-600 mb-0">
                                You are currently on the <strong className="capitalize text-blue-700">{tier ?? 'starter'}</strong> tier.
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                                Includes {monthlyBonus.toLocaleString()} AI tokens per month
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
                        {(Object.entries(TIER_PRICING) as [Tier, typeof TIER_PRICING[Tier]][]).map(([key, data]) => {
                            const isCurrent = key === tier;
                            return (
                                <div key={key} className={`flex flex-col sm:flex-row border rounded-lg p-6 ${isCurrent ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 bg-white'}`}>
                                    <div className="flex-1">
                                        <div className="flex items-center space-x-2 mb-2">
                                            <h4 className="text-lg font-bold text-gray-900 capitalize">{key}</h4>
                                            {isCurrent && <span className="bg-blue-600 text-white text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full">Current Plan</span>}
                                        </div>
                                        <div className="text-2xl font-black text-gray-900 mb-1">${data.price}<span className="text-sm text-gray-500 font-medium">/mo</span></div>
                                        <div className="text-sm text-purple-600 font-medium mb-3">
                                            ⚡ Includes {data.monthlyTokens.toLocaleString()} AI tokens/month
                                        </div>
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
                </>
            ) : (
                <>
                    <h3 className="text-xl font-bold text-gray-800 mb-4 font-display border-b pb-2">Purchase Tokens</h3>
                    <p className="text-gray-600 mb-6">
                        Need more AI tokens? Purchase additional tokens that never expire. 
                        Higher tier subscribers receive bonus tokens on purchases.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {TOKEN_PACKAGES.map((pkg) => {
                            const bonusTokens = Math.floor(pkg.tokens * (pkg.bonus / 100));
                            
                            return (
                                <div key={pkg.name} className="border rounded-lg p-5 bg-white hover:border-purple-300 transition-colors">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="font-bold text-gray-900">{pkg.name}</h4>
                                        {pkg.bonus > 0 && (
                                            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                                                +{pkg.bonus}% bonus
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-3xl font-black text-gray-900 mb-1">
                                        ${pkg.price}
                                    </div>
                                    <div className="text-sm text-gray-600 mb-4">
                                        {pkg.tokens.toLocaleString()} tokens
                                        {bonusTokens > 0 && (
                                            <span className="text-green-600 font-medium">
                                                {' '}+ {bonusTokens.toLocaleString()} bonus
                                            </span>
                                        )}
                                    </div>
                                    <button 
                                        onClick={() => setShowTokenModal(true)}
                                        className="w-full py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
                                    >
                                        Purchase
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-6 bg-gray-50 rounded-lg p-4">
                        <h4 className="font-medium text-gray-900 mb-2">Token Bonuses by Tier</h4>
                        <ul className="text-sm text-gray-600 space-y-1">
                            <li>• Starter: Base tokens (no bonus)</li>
                            <li>• Pro: +10% bonus on all token purchases</li>
                            <li>• Enterprise: +50% bonus on all token purchases</li>
                        </ul>
                    </div>
                </>
            )}

            <p className="text-xs text-gray-400 mt-6 text-center">
                Payment processing is securely handled by Stripe. Need help? Contact support.
            </p>

            {/* Token Purchase Modal */}
            {showTokenModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl max-w-md w-full p-6">
                        <h3 className="text-xl font-bold mb-4">Purchase Tokens</h3>
                        <p className="text-gray-600 mb-6">
                            Token purchasing will be available soon. For now, upgrade your plan to get more monthly tokens.
                        </p>
                        <div className="flex gap-3">
                            <button 
                                onClick={() => setShowTokenModal(false)}
                                className="flex-1 py-2 border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
                            >
                                Close
                            </button>
                            <button 
                                onClick={() => {
                                    setShowTokenModal(false);
                                    setActiveTab('subscription');
                                }}
                                className="flex-1 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700"
                            >
                                View Plans
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default BillingSettings;
