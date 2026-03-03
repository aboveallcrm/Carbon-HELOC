export interface DebtItem {
    id: string;
    creditor: string;
    balance: number;
    rate: number;
    payment: number;
}

export interface LoanInputs {
    clientName: string;
    clientCredit: string;
    propertyType: string;
    homeValue: number;
    mortgageBalance: number;
    netCash: number;
    helocPayoff: number;
    isInterestOnly: boolean;
    // New fields for Analysis
    refiBalance: number;
    refiRate: number;
    refiPayment: number;
    debtItems: DebtItem[];
}

export interface RateConfig {
    origination: number;
    fixed: { [key: number]: number }; // term -> rate
    variable: { [key: number]: number }; // term -> rate
}

export interface RatesData {
    tier1: RateConfig;
    tier2: RateConfig;
    tier3: RateConfig;
}

export interface PaymentData {
    rate: number;
    pmt: number;
}

export interface TierResult {
    orig: number; // origination percent
    feeAmt: number;
    totalLoan: number;
    payments: { [term: number]: PaymentData };
    varPayments: { [term: number]: PaymentData };
}

export interface QuoteResult {
    cltv: number;
    baseNeeded: number;
    results: {
        t1: TierResult;
        t2: TierResult;
        t3: TierResult;
    };
    breakEven?: {
        upfrontDiff: number;
        monthlySavings: number;
        months: number;
    };
}
