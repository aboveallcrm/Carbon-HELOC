import React from 'react';
import type { QuoteResult } from '../types';
import { fmtCurrencyExact } from '../utils/currency';

interface Props {
    quoteResult: QuoteResult;
}

export const RateMatrix: React.FC<Props> = ({ quoteResult }) => {
    return (
        <div className="my-4">
            <h3>Rate Options</h3>
            <div className="matrix-container">
                {(['t1', 't2', 't3'] as const).map(tier => (
                    <div key={tier} className="bg-white p-2 border rounded flex-1">
                        <h4 className="tier-header uppercase">{tier.replace('t', 'Tier ')}</h4>
                        <div className="text-xs">
                            Origination: {quoteResult.results[tier].orig}%
                        </div>
                        <table className="w-full">
                            <thead><tr><th>Term</th><th>Rate</th><th>Pmt</th></tr></thead>
                            <tbody>
                                {[30, 20, 15, 10].map(term => (
                                    <tr key={term}>
                                        <td>{term} Yr</td>
                                        <td>{quoteResult.results[tier].payments[term].rate.toFixed(3)}%</td>
                                        <td>{fmtCurrencyExact(quoteResult.results[tier].payments[term].pmt)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}
            </div>
        </div>
    );
};
