import { useAuth } from '../components/AuthProvider';
import type { Tier } from '../components/AuthProvider';


/**
 * Returns true if the user's tier meets or exceeds the required tier.
 * Tier hierarchy: carbon < platinum < obsidian
 */
const TIER_RANK: Record<Tier, number> = {
    carbon: 1,
    platinum: 2,
    titanium: 3,
    obsidian: 4,
    diamond: 5,
};

export const useTier = () => {
    const { tier } = useAuth();

    const hasTier = (required: Tier): boolean => {
        const userRank = TIER_RANK[tier ?? 'carbon'];
        const requiredRank = TIER_RANK[required];
        return userRank >= requiredRank;
    };

    return { tier, hasTier };
};
