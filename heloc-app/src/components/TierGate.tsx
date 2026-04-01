import React from 'react';
import { useTier } from '../hooks/useTier';
import type { Tier } from './AuthProvider';

const TIER_LABELS: Record<Tier, string> = {
    starter: 'Starter',
    pro: 'Pro',
    enterprise: 'Enterprise',
};

const TIER_COLORS: Record<Tier, string> = {
    starter: 'border-gray-300 bg-gray-50',
    pro: 'border-purple-300 bg-purple-50',
    enterprise: 'border-teal-300 bg-teal-50',
};

const TIER_BADGE: Record<Tier, string> = {
    starter: '⚫',
    pro: '🔷',
    enterprise: '🌟',
};

interface TierGateProps {
    /** Minimum tier required to see children */
    requires: Tier;
    children: React.ReactNode;
    /** Optional custom message */
    message?: string;
}

/**
 * Wrap any feature in <TierGate requires="pro"> to restrict access.
 * Users below the required tier see a clean upgrade prompt instead.
 */
export const TierGate: React.FC<TierGateProps> = ({ requires, children, message }) => {
    const { hasTier, tier } = useTier();

    if (hasTier(requires)) {
        return <>{children}</>;
    }

    const currentLabel = TIER_LABELS[tier ?? 'starter'];
    const requiredLabel = TIER_LABELS[requires];
    const colorClass = TIER_COLORS[requires];
    const badge = TIER_BADGE[requires];

    return (
        <div className={`rounded-lg border-2 border-dashed ${colorClass} p-6 text-center my-4`}>
            <div className="text-3xl mb-2">{badge}</div>
            <h3 className="text-base font-bold text-gray-700 mb-1">
                {requiredLabel} Feature
            </h3>
            <p className="text-sm text-gray-500 mb-3">
                {message || `This feature requires the ${requiredLabel} tier.`}
                {' '}You are currently on <strong>{currentLabel}</strong>.
            </p>
            <p className="text-xs text-gray-400">
                Contact your administrator to upgrade your plan.
            </p>
        </div>
    );
};
