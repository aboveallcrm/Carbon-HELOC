import type { LoanInputs, QuoteResult, RatesData, TierResult } from '../types';

export const calculatePMT = (principal: number, annualRate: number, years: number): number => {
    if (annualRate === 0) return principal / (years * 12);
    const monthlyRate = (annualRate / 100) / 12;
    const n = years * 12;
    return principal * (monthlyRate * Math.pow(1 + monthlyRate, n)) / (Math.pow(1 + monthlyRate, n) - 1);
};

export const calculateInterestOnly = (principal: number, annualRate: number): number => {
    return principal * (annualRate / 100) / 12;
};

export const useQuoteCalculator = (inputs: LoanInputs, rates: RatesData): QuoteResult => {
    const { homeValue, mortgageBalance, netCash, helocPayoff, isInterestOnly } = inputs;

    const baseNeeded = netCash + helocPayoff;

    // CLTV calculation (using baseNeeded? Original uses mortgageBalance + baseNeeded to get ratio vs Home Value)
    // Original: let cltv = homeValue > 0 ? ((mortgageBalance + baseNeeded) / homeValue) * 100 : 0;
    // Note: Original code text says "CLTV includes the full loan amount (cash + payoff + fees will be calculated per tier)"
    // But logic line 1220: ((mortgageBalance + baseNeeded) / homeValue) * 100. It uses baseNeeded, NOT totalLoan (w/ fees).
    const cltv = homeValue > 0 ? ((mortgageBalance + baseNeeded) / homeValue) * 100 : 0;

    const calculateTier = (tierName: keyof RatesData): TierResult => {
        const tierRates = rates[tierName];
        const origPercent = tierRates.origination;
        const feeAmt = baseNeeded * (origPercent / 100);
        const totalLoanAmount = baseNeeded + feeAmt;

        const terms = [30, 20, 15, 10];
        const payments: { [term: number]: { rate: number, pmt: number } } = {};
        const varPayments: { [term: number]: { rate: number, pmt: number } } = {};

        terms.forEach(term => {
            // Fixed
            const fixedRate = tierRates.fixed[term] || 0;
            const fixedPmt = isInterestOnly
                ? calculateInterestOnly(totalLoanAmount, fixedRate)
                : calculatePMT(totalLoanAmount, fixedRate, term);
            payments[term] = { rate: fixedRate, pmt: fixedPmt };

            // Variable
            const varRate = tierRates.variable[term] || 0;
            const varPmt = isInterestOnly
                ? calculateInterestOnly(totalLoanAmount, varRate)
                : calculatePMT(totalLoanAmount, varRate, term);
            varPayments[term] = { rate: varRate, pmt: varPmt };
        });

        return {
            orig: origPercent,
            feeAmt,
            totalLoan: totalLoanAmount,
            payments,
            varPayments
        };
    };

    const results = {
        t1: calculateTier('tier1'),
        t2: calculateTier('tier2'),
        t3: calculateTier('tier3'),
    };

    // Break Even Calculation (Rec Term vs T3)
    // This usually depends on the *selected* recommendation term. 
    // For the hook, we might just return the raw data and let the UI calculate break-even based on selection.
    // Or we can helper method. The original calculates Rec vs T3.

    return {
        cltv,
        baseNeeded,
        results
    };
};
