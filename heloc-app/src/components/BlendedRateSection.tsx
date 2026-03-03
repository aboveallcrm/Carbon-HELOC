import React from 'react';
import type { DebtItem, QuoteResult } from '../types';

interface Props {
    debtItems: DebtItem[];
    quoteResult: QuoteResult;
}

export const BlendedRateSection: React.FC<Props> = ({ debtItems, quoteResult }) => {
    // 1. Calculate Total Debt (External)
    const totalExternalDebt = debtItems.reduce((sum, item) => sum + item.balance, 0);
    const totalExternalPayment = debtItems.reduce((sum, item) => sum + item.payment, 0);

    // Calculate Annual Interest for external debts
    const totalExternalAnnualInterest = debtItems.reduce((sum, item) => {
        return sum + (item.balance * (item.rate / 100));
    }, 0);

    // 2. Get HELOC Data (Recommendation - Tier 2 20Y is standard, or use logic to pick "Best")
    // For simplicity, let's use Tier 2 20-Year as the baseline recommendation, similar to HTML defaults
    // In a real app, this might be dynamic based on selected product.
    // HTML uses: Tier 2, 20-Year Fixed.
    const helocRate = quoteResult.results.t2.payments[20]?.rate || 0;
    // Actually, for blended rate, we should probably use the "Cash to Client" + "Debt Payoff" if debts are being paid off?
    // The HTML logic just adds the HELOC as a new "debt" row essentially.
    // It assumes the HELOC *replaces* or *adds to*?
    // "Debt Consolidation Analysis" implies we are comparing BEFORE vs AFTER?
    // Or is it a "Blended Rate of All Debt"?
    // HTML Logic:
    // It lists existing debts.
    // Then calculates "Blended Rate" of (Existing Debts + HELOC).
    // Wait, if it's consolidation, the existing debts are paid off by the HELOC?
    // No, usually "Blended Rate" in these tools means "Your Mortgage + HELOC" or "Remaining Debt + HELOC".
    // Let's re-read the HTML logic if possible.
    // HTML: "Blended Rate: [rate]% | Current Payments: [total] | HELOC Payment: [heloc] | Net Savings: [savings]"
    // AND it has a table of debts.
    // Usually this implies: "Here are your high interest debts. If you roll them into the HELOC..."
    // But the "Blended Rate" usually refers to the total weight of the new structure.
    // Let's assume standard logic: 
    // Blended Rate = (Weighted Average of Mortgage + HELOC) OR (Weighted Average of All Current Debt).
    // The HTML label says "Debt Consolidation Analysis".
    // And "Net Savings".
    // This strongly implies paying off the debts with the HELOC.
    // So: Old Scenario = Sum of Debt Payments.
    // New Scenario = New HELOC Payment (which presumably includes the cash out to pay them off).
    // Net Savings = Old Payments - New HELOC Payment portion?

    // Let's stick to a simple interpretation for now based on the HTML fields:
    // "Blended Rate" likely refers to the weighted average of the debts being displayed? 
    // OR it's a placeholder.
    // Let's look at the HTML output fields: `out-blended-rate`, `out-total-debt-pay`, `out-debt-heloc-pay`, `out-net-savings`.

    // Logic extraction from HTML (mental check):
    // If I pay off $23,500 of debt (Chase + Amex) with HELOC.
    // Old Payments: $750/mo.
    // New HELOC Payment for that $23,500 portion:
    //   Rate: 7.5% (HELOC Rate).
    //   Payment for $23.5k at 7.5% over 20 years: ~$190/mo.
    // Savings: $750 - $190 = $560/mo.

    // The component should calculate:
    // 1. Total Existing Debt Balance & Payment.
    // 2. HELOC Payment required to cover that Balance.
    // 3. Savings = Existing Payment - New HELOC Payment.

    // Blended Rate Calculation (Pre-Consolidation):
    // Weighted Average Rate of the debts.
    const blendedRatePre = totalExternalDebt > 0
        ? (totalExternalAnnualInterest / totalExternalDebt) * 100
        : 0;

    // HELOC Payment for the Debt Amount ONLY (to show savings on just the debt part)
    // Formula: P = (r*A) / (1 - (1+r)^-N)
    const r = helocRate / 100 / 12;
    const n = 20 * 12; // 20 years
    // If rate is 0, just divide.
    const helocDebtPayment = (helocRate > 0 && totalExternalDebt > 0)
        ? (totalExternalDebt * r) / (1 - Math.pow(1 + r, -n))
        : 0;

    const monthlySavings = totalExternalPayment - helocDebtPayment;

    if (debtItems.length === 0) return null;

    return (
        <div className="analysis-box p-2 rounded bg-orange-50 border border-orange-200 text-orange-900 text-xs visible block">
            <div className="analysis-title font-bold uppercase mb-1">💳 Debt Consolidation Analysis</div>
            <table className="w-full text-[10px] border-collapse mb-2">
                <thead>
                    <tr className="border-b border-orange-200 text-left opacity-70">
                        <th className="p-1">Creditor</th>
                        <th className="p-1">Balance</th>
                        <th className="p-1">APR</th>
                        <th className="p-1">Payment</th>
                    </tr>
                </thead>
                <tbody>
                    {debtItems.map(item => (
                        <tr key={item.id} className="border-b border-orange-100">
                            <td className="p-1 font-medium">{item.creditor}</td>
                            <td className="p-1">${item.balance.toLocaleString()}</td>
                            <td className="p-1">{item.rate.toFixed(2)}%</td>
                            <td className="p-1">${item.payment.toLocaleString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <div className="text-right font-bold text-[11px] mt-1 space-x-3">
                <span>Blended APR: {blendedRatePre.toFixed(2)}%</span>
                <span>Current Pmt: ${totalExternalPayment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                <span>New HELOC Pmt: ${helocDebtPayment.toFixed(2)}</span>
                <span className="text-green-700 bg-green-100 px-2 py-0.5 rounded">
                    Save ${monthlySavings.toFixed(2)}/mo
                </span>
            </div>
        </div>
    );
};
