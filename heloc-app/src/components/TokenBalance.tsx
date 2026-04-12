import React, { useState } from 'react';
import { useTokens, AI_FEATURE_COSTS } from '../hooks/useTokens';
import { useAuth } from './AuthProvider';

interface TokenBalanceProps {
  variant?: 'compact' | 'full' | 'minimal';
  showPurchase?: boolean;
}

export const TokenBalance: React.FC<TokenBalanceProps> = ({ 
  variant = 'compact',
  showPurchase = true 
}) => {
  const { balance, loading, hasEnoughTokens, getTierMonthlyBonus } = useTokens();
  const { tier } = useAuth();
  const [showTooltip, setShowTooltip] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  const monthlyBonus = getTierMonthlyBonus(tier || 'starter');
  const isLowBalance = (balance?.balance || 0) < 50;
  const isVeryLowBalance = (balance?.balance || 0) < 20;

  // Compact variant for header
  if (variant === 'compact') {
    return (
      <>
        <button
          onClick={() => setShowPurchaseModal(true)}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className={`
            flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium
            transition-colors relative
            ${isVeryLowBalance ? 'bg-red-100 text-red-700 hover:bg-red-200' : 
              isLowBalance ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 
              'bg-purple-100 text-purple-700 hover:bg-purple-200'}
          `}
        >
          <span>⚡</span>
          {loading ? (
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <span>{balance?.balance.toLocaleString() || 0}</span>
          )}
          
          {/* Tooltip */}
          {showTooltip && balance && (
            <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border p-3 z-50 text-left">
              <div className="text-sm font-medium text-gray-900 mb-1">
                AI Token Balance
              </div>
              <div className="text-2xl font-bold text-purple-600 mb-2">
                {balance.balance.toLocaleString()} tokens
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                <div>Lifetime earned: {balance.lifetimeEarned.toLocaleString()}</div>
                <div>Lifetime spent: {balance.lifetimeSpent.toLocaleString()}</div>
                <div className="pt-1 border-t">
                  Monthly bonus: +{monthlyBonus.toLocaleString()} ({tier} tier)
                </div>
              </div>
              {isLowBalance && (
                <div className="mt-2 text-xs text-amber-600 font-medium">
                  ⚠️ Low balance - click to purchase more
                </div>
              )}
            </div>
          )}
        </button>

        {showPurchaseModal && (
          <TokenPurchaseModal onClose={() => setShowPurchaseModal(false)} />
        )}
      </>
    );
  }

  // Full variant for settings page
  if (variant === 'full') {
    return (
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">AI Token Balance</h3>
            <p className="text-sm text-gray-500">
              Use tokens for AI-powered features like strategy generation and sales scripts
            </p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-purple-600">
              {balance?.balance.toLocaleString() || 0}
            </div>
            <div className="text-sm text-gray-500">tokens available</div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 uppercase">Lifetime Earned</div>
            <div className="text-lg font-semibold text-gray-900">
              {balance?.lifetimeEarned.toLocaleString() || 0}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-500 uppercase">Lifetime Spent</div>
            <div className="text-lg font-semibold text-gray-900">
              {balance?.lifetimeSpent.toLocaleString() || 0}
            </div>
          </div>
          <div className="bg-purple-50 rounded-lg p-3">
            <div className="text-xs text-purple-600 uppercase">Monthly Bonus</div>
            <div className="text-lg font-semibold text-purple-700">
              +{monthlyBonus.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Feature costs */}
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Feature Costs</h4>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(AI_FEATURE_COSTS).map((feature) => (
              <div 
                key={feature.featureType}
                className={`
                  flex items-center justify-between p-2 rounded text-sm
                  ${hasEnoughTokens(feature.featureType) ? 'bg-green-50' : 'bg-gray-50 opacity-60'}
                `}
              >
                <span className="text-gray-700">{feature.description}</span>
                <span className="font-medium text-gray-900">{feature.tokenCost} tokens</span>
              </div>
            ))}
          </div>
        </div>

        {showPurchase && (
          <div className="mt-6">
            <button
              onClick={() => setShowPurchaseModal(true)}
              className="w-full py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors"
            >
              Purchase Tokens
            </button>
          </div>
        )}

        {showPurchaseModal && (
          <TokenPurchaseModal onClose={() => setShowPurchaseModal(false)} />
        )}
      </div>
    );
  }

  // Minimal variant - just the number
  return (
    <span className="inline-flex items-center gap-1 text-sm text-gray-600">
      <span>⚡</span>
      {loading ? '-' : (balance?.balance.toLocaleString() || 0)}
    </span>
  );
};

// Token Purchase Modal
interface TokenPurchaseModalProps {
  onClose: () => void;
}

const TokenPurchaseModal: React.FC<TokenPurchaseModalProps> = ({ onClose }) => {
  const { packages, purchaseTokens } = useTokens();
  const { tier } = useAuth();
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);

  const handlePurchase = async (packageId: string) => {
    setPurchasing(true);
    const result = await purchaseTokens(packageId);
    if (result.success && result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
    }
    setPurchasing(false);
  };

  const getBonusText = (multiplier: number) => {
    if (multiplier > 1.4) return '+50% bonus';
    if (multiplier > 1.3) return '+30% bonus';
    if (multiplier > 1.1) return '+10% bonus';
    return '';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-gray-900">Purchase Tokens</h3>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <p className="text-gray-600 mb-6">
            Tokens are used for AI-powered features. Your {tier} tier includes 
            a monthly bonus, and you can purchase more anytime.
          </p>

          <div className="space-y-3">
            {packages.map((pkg) => {
              const bonusTokens = Math.floor(pkg.tokenAmount * (pkg.tierBonusMultiplier - 1));
              const totalTokens = pkg.tokenAmount + bonusTokens;
              const price = (pkg.priceCents / 100).toFixed(2);
              const isSelected = selectedPackage === pkg.id;

              return (
                <button
                  key={pkg.id}
                  onClick={() => setSelectedPackage(pkg.id)}
                  className={`
                    w-full p-4 rounded-lg border-2 text-left transition-all
                    ${isSelected 
                      ? 'border-purple-500 bg-purple-50' 
                      : 'border-gray-200 hover:border-purple-300'}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">{pkg.name}</div>
                      <div className="text-sm text-gray-500">
                        {pkg.tokenAmount.toLocaleString()} tokens
                        {bonusTokens > 0 && (
                          <span className="text-green-600 font-medium ml-1">
                            + {bonusTokens.toLocaleString()} bonus
                          </span>
                        )}
                      </div>
                      {pkg.tierBonusMultiplier > 1 && (
                        <div className="text-xs text-purple-600 mt-1">
                          {getBonusText(pkg.tierBonusMultiplier)} for {tier} tier
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-xl font-bold text-gray-900">${price}</div>
                      {bonusTokens > 0 && (
                        <div className="text-xs text-gray-500">
                          {totalTokens.toLocaleString()} total
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => selectedPackage && handlePurchase(selectedPackage)}
              disabled={!selectedPackage || purchasing}
              className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {purchasing ? 'Processing...' : 'Continue to Payment'}
            </button>
          </div>

          <p className="mt-4 text-xs text-gray-500 text-center">
            Secure payment processing by Stripe. Tokens are non-refundable.
          </p>
        </div>
      </div>
    </div>
  );
};

export default TokenBalance;
