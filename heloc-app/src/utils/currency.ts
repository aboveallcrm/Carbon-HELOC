export const fmtCurrency = (num: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(num);

export const fmtCurrencyExact = (num: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
