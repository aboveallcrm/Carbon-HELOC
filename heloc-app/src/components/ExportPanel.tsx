import React, { useState } from 'react';
import type { LoanInputs } from '../types';

interface ExportPanelProps {
    inputs: LoanInputs;
    quoteResult: any;
    sections: {
        rateMatrix: boolean;
        recommendation: boolean;
        analysis: boolean;
    };
    setSections: React.Dispatch<React.SetStateAction<{
        rateMatrix: boolean;
        recommendation: boolean;
        analysis: boolean;
    }>>;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({ inputs, sections, setSections }) => {
    const [copied, setCopied] = useState(false);

    // Generate serialized client link
    const generateLink = () => {
        const payload = btoa(JSON.stringify({ i: inputs, s: sections }));
        const url = `${window.location.origin}${window.location.pathname}?q=${payload}`;
        return url;
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(generateLink());
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            alert("Failed to copy link");
        }
    };

    const handlePrint = () => {
        window.print();
    };

    const Toggle = ({ label, field }: { label: string; field: keyof typeof sections }) => (
        <label className="flex items-center space-x-2 text-sm text-gray-700 cursor-pointer">
            <input
                type="checkbox"
                checked={sections[field]}
                onChange={(e) => setSections(prev => ({ ...prev, [field]: e.target.checked }))}
                className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span>{label}</span>
        </label>
    );

    return (
        <div className="bg-white border rounded-lg shadow-sm p-4 mb-6 print:hidden">
            <h3 className="font-bold text-gray-800 mb-3">Share & Export</h3>

            <div className="flex flex-col md:flex-row gap-6 md:items-start justify-between">

                {/* Toggles */}
                <div className="flex-1 space-y-2 border-r pr-6 border-gray-100">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Select Visible Sections</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Toggle label="Rate Matrix" field="rateMatrix" />
                        <Toggle label="Recommendation" field="recommendation" />
                        <Toggle label="Analysis & ROI" field="analysis" />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                        These sections will be included when exporting to PDF or sharing the client link.
                    </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 min-w-[300px]">
                    <button
                        onClick={handleCopy}
                        className="flex-1 bg-blue-50 text-blue-700 font-medium px-4 py-2 border border-blue-200 rounded hover:bg-blue-100 transition whitespace-nowrap text-sm"
                    >
                        {copied ? '✓ Link Copied' : '🔗 Copy Client Link'}
                    </button>

                    <button
                        onClick={handlePrint}
                        className="flex-1 bg-gray-800 text-white font-medium px-4 py-2 rounded hover:bg-gray-700 transition flex items-center justify-center space-x-1 whitespace-nowrap text-sm shadow"
                    >
                        <span>📄</span>
                        <span>Export to PDF</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
