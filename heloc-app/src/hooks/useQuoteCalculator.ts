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

    const calculateTier = (tierName: keyof RatesData): TierResult => {
        const tierRates = rates[tierName];
        const origPercent = tierRates.origination;
        const feeAmt = baseNeeded * (origPercent / 100);
        const totalLoanAmount = baseNeeded + feeAmt;
        
        // CLTV calculation - uses totalLoanAmount which includes origination fees
        // This is the correct CLTV for this specific tier
        const tierCltv = homeValue > 0 ? ((mortgageBalance + totalLoanAmount) / homeValue) * 100 : 0;

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
            varPayments,
            cltv: tierCltv, // Per-tier CLTV including origination fees
        };
    };

    const results = {
        t1: calculateTier('tier1'),
        t2: calculateTier('tier2'),
        t3: calculateTier('tier3'),
    };

    // Overall CLTV is based on the base needed (before fees) for initial assessment
    // But each tier has its own CLTV including fees
    const baseCltv = homeValue > 0 ? ((mortgageBalance + baseNeeded) / homeValue) * 100 : 0;

    return {
        cltv: baseCltv,
        baseNeeded,
        results
    };
};
