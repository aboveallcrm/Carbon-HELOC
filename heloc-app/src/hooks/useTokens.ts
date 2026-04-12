import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface TokenBalance {
  balance: number;
  lifetimeEarned: number;
  lifetimeSpent: number;
  monthlyBonusDate?: string;
}

export interface TokenTransaction {
  id: string;
  type: 'purchase' | 'monthly_bonus' | 'usage' | 'refund' | 'admin_adjust' | 'signup_bonus';
  amount: number;
  balanceAfter: number;
  description: string;
  createdAt: string;
}

export interface TokenPackage {
  id: string;
  name: string;
  tokenAmount: number;
  priceCents: number;
  tierBonusMultiplier: number;
}

export interface AiUsageCost {
  featureType: 'strategy' | 'sales_script' | 'objection_handler' | 'email_template' | 'competitive_analysis' | 'chat_message';
  tokenCost: number;
  description: string;
}

// Token costs per AI feature
export const AI_FEATURE_COSTS: Record<AiUsageCost['featureType'], AiUsageCost> = {
  strategy: { featureType: 'strategy', tokenCost: 10, description: 'AI Strategy Generation' },
  sales_script: { featureType: 'sales_script', tokenCost: 15, description: 'Sales Script Generation' },
  objection_handler: { featureType: 'objection_handler', tokenCost: 8, description: 'Objection Handler' },
  email_template: { featureType: 'email_template', tokenCost: 12, description: 'Email Template Generation' },
  competitive_analysis: { featureType: 'competitive_analysis', tokenCost: 20, description: 'Competitive Analysis' },
  chat_message: { featureType: 'chat_message', tokenCost: 2, description: 'AI Chat Message' },
};

export const useTokens = () => {
  const [balance, setBalance] = useState<TokenBalance | null>(null);
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current token balance
  const fetchBalance = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_tokens')
        .select('balance, lifetime_earned, lifetime_spent, monthly_bonus_date')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
        throw error;
      }

      if (data) {
        setBalance({
          balance: data.balance,
          lifetimeEarned: data.lifetime_earned,
          lifetimeSpent: data.lifetime_spent,
          monthlyBonusDate: data.monthly_bonus_date,
        });
      } else {
        // No token record yet - user hasn't received signup bonus
        setBalance({ balance: 0, lifetimeEarned: 0, lifetimeSpent: 0 });
      }
    } catch (err) {
      console.error('Error fetching token balance:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch balance');
    }
  }, []);

  // Fetch transaction history
  const fetchTransactions = useCallback(async (limit = 50) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('token_transactions')
        .select('id, type, amount, balance_after, description, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      setTransactions(data?.map(t => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        balanceAfter: t.balance_after,
        description: t.description,
        createdAt: t.created_at,
      })) || []);
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch transactions');
    }
  }, []);

  // Fetch available token packages
  const fetchPackages = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('token_pricing')
        .select('id, name, token_amount, price_cents, tier_bonus_multiplier')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      setPackages(data?.map(p => ({
        id: p.id,
        name: p.name,
        tokenAmount: p.token_amount,
        priceCents: p.price_cents,
        tierBonusMultiplier: p.tier_bonus_multiplier,
      })) || []);
    } catch (err) {
      console.error('Error fetching token packages:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch packages');
    }
  }, []);

  // Check if user has enough tokens for a feature
  const hasEnoughTokens = useCallback((featureType: AiUsageCost['featureType']): boolean => {
    if (!balance) return false;
    const cost = AI_FEATURE_COSTS[featureType].tokenCost;
    return balance.balance >= cost;
  }, [balance]);

  // Consume tokens for an AI feature
  const consumeTokens = useCallback(async (
    featureType: AiUsageCost['featureType'],
    metadata?: Record<string, unknown>
  ): Promise<{ success: boolean; newBalance?: number; error?: string }> => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      const cost = AI_FEATURE_COSTS[featureType];
      
      // Call the debit_tokens function
      const { data, error } = await supabase.rpc('debit_tokens', {
        p_user_id: user.id,
        p_amount: cost.tokenCost,
        p_feature_type: featureType,
        p_description: cost.description,
        p_metadata: { ...metadata, model: metadata?.model || 'default' },
      });

      if (error) throw error;

      // Update local balance
      if (data && data[0]) {
        const result = data[0];
        if (result.success) {
          setBalance(prev => prev ? { 
            ...prev, 
            balance: result.new_balance,
            lifetimeSpent: prev.lifetimeSpent + cost.tokenCost 
          } : null);
          return { success: true, newBalance: result.new_balance };
        } else {
          return { success: false, error: result.error_message || 'Insufficient tokens' };
        }
      }

      return { success: false, error: 'Unknown error' };
    } catch (err) {
      console.error('Error consuming tokens:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Failed to consume tokens' };
    } finally {
      setLoading(false);
    }
  }, []);

  // Purchase tokens (initiates Stripe checkout)
  const purchaseTokens = useCallback(async (packageId: string): Promise<{ success: boolean; checkoutUrl?: string; error?: string }> => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        return { success: false, error: 'Not authenticated' };
      }

      // Call edge function to create Stripe checkout session
      const { data, error } = await supabase.functions.invoke('create-token-checkout', {
        body: { packageId, userId: user.id },
      });

      if (error) throw error;

      if (data?.url) {
        return { success: true, checkoutUrl: data.url };
      }

      return { success: false, error: 'Failed to create checkout session' };
    } catch (err) {
      console.error('Error purchasing tokens:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Failed to purchase tokens' };
    } finally {
      setLoading(false);
    }
  }, []);

  // Get estimated tokens for tier (for UI display)
  const getTierMonthlyBonus = useCallback((tier: string): number => {
    switch (tier) {
      case 'starter': return 100;
      case 'pro': return 500;
      case 'enterprise': return 2000;
      default: return 0;
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchBalance();
    fetchPackages();
  }, [fetchBalance, fetchPackages]);

  return {
    balance,
    transactions,
    packages,
    loading,
    error,
    hasEnoughTokens,
    consumeTokens,
    purchaseTokens,
    fetchBalance,
    fetchTransactions,
    getTierMonthlyBonus,
    aiFeatureCosts: AI_FEATURE_COSTS,
  };
};

export default useTokens;
