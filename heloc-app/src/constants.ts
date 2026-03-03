import type { RatesData } from "./types";

export const DEFAULT_RATES: RatesData = {
    tier1: {
        origination: 2.0,
        fixed: { 30: 5.5, 20: 5.375, 15: 5.25, 10: 5.125 },
        variable: { 30: 6.0, 20: 5.875, 15: 5.75, 10: 5.625 },
    },
    tier2: {
        origination: 1.5,
        fixed: { 30: 6.5, 20: 6.375, 15: 6.25, 10: 6.125 },
        variable: { 30: 7.0, 20: 6.875, 15: 6.75, 10: 6.625 },
    },
    tier3: {
        origination: 0.0,
        fixed: { 30: 7.5, 20: 7.375, 15: 7.25, 10: 7.125 },
        variable: { 30: 8.0, 20: 7.875, 15: 7.75, 10: 7.625 },
    },
};

export const DEFAULT_INPUTS = {
    clientName: '',
    clientCredit: '',
    propertyType: 'Primary Residence',
    homeValue: 0,
    mortgageBalance: 0,
    netCash: 0,
    helocPayoff: 0,
    isInterestOnly: false,
    refiBalance: 0,
    refiRate: 7.5,
    refiPayment: 1800,
    debtItems: [
        { id: '1', creditor: 'Chase Visa', balance: 15000, rate: 24.99, payment: 450 },
        { id: '2', creditor: 'Amex Platinum', balance: 8500, rate: 21.24, payment: 300 }
    ],
};
