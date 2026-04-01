import { useAuth } from '../components/AuthProvider';
import type { Tier } from '../components/AuthProvider';


/**
 * Returns true if the user's tier meets or exceeds the required tier.
 * Tier hierarchy: starter < pro < enterprise
 */
const TIER_RANK: Record<Tier, number> = {
    starter: 0,
    pro: 1,
    enterprise: 2,
};

export const useTier = () => {
    const { tier } = useAuth();

    const hasTier = (required: Tier): boolean => {
        const userRank = TIER_RANK[tier ?? 'starter'];
        const requiredRank = TIER_RANK[required];
        return userRank >= requiredRank;
    };

    return { tier, hasTier };
};
