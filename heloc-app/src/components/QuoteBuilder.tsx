import React, { useState } from 'react';
import type { LoanInputs, RatesData } from '../types';
import { DEFAULT_INPUTS, DEFAULT_RATES } from '../constants';
import { useQuoteCalculator } from '../hooks/useQuoteCalculator';
import { useLeadParser } from '../hooks/useLeadParser';
import { RateMatrix } from './RateMatrix';
import { Recommendation } from './Recommendation';
import { Analysis } from './Analysis';
import { ExportPanel } from './ExportPanel';

// Quote Preset Types
interface QuotePreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  sections: {
    rateMatrix: boolean;
    recommendation: boolean;
    analysis: boolean;
  };
  rateDisplay: 'fixed' | 'variable' | 'both';
  defaultTerm: number;
  showTiers: ('t1' | 't2' | 't3')[];
}

const QUOTE_PRESETS: QuotePreset[] = [
  {
    id: 'simple',
    name: 'Simple Quote',
    description: 'Clean, focused view with recommended rate only',
    icon: '✨',
    sections: {
      rateMatrix: false,
      recommendation: true,
      analysis: false,
    },
    rateDisplay: 'fixed',
    defaultTerm: 20,
    showTiers: ['t2'],
  },
  {
    id: 'compare',
    name: 'Compare Options',
    description: 'Side-by-side comparison of all tiers',
    icon: '⚖️',
    sections: {
      rateMatrix: true,
      recommendation: true,
      analysis: false,
    },
    rateDisplay: 'fixed',
    defaultTerm: 20,
    showTiers: ['t1', 't2', 't3'],
  },
  {
    id: 'complete',
    name: 'Complete Analysis',
    description: 'Full proposal with all options and analysis',
    icon: '📊',
    sections: {
      rateMatrix: true,
      recommendation: true,
      analysis: true,
    },
    rateDisplay: 'both',
    defaultTerm: 20,
    showTiers: ['t1', 't2', 't3'],
  },
  {
    id: 'client-simple',
    name: 'Client View - Simple',
    description: 'What the client sees - clean and simple',
    icon: '👁️',
    sections: {
      rateMatrix: false,
      recommendation: true,
      analysis: false,
    },
    rateDisplay: 'fixed',
    defaultTerm: 20,
    showTiers: ['t2'],
  },
  {
    id: 'client-compare',
    name: 'Client View - Compare',
    description: 'Client view with comparison options',
    icon: '👁️⚖️',
    sections: {
      rateMatrix: true,
      recommendation: true,
      analysis: false,
    },
    rateDisplay: 'fixed',
    defaultTerm: 20,
    showTiers: ['t1', 't2', 't3'],
  },
];

// Ezra Quote Flow Steps
interface FlowStep {
  id: string;
  question: string;
  description?: string;
  options?: { value: string; label: string; icon?: string }[];
  inputType?: 'text' | 'number' | 'currency' | 'select' | 'confirm';
  field?: keyof LoanInputs;
  placeholder?: string;
}

const EZRA_FLOW_STEPS: FlowStep[] = [
  {
    id: 'welcome',
    question: 'Hi! I\'m Ezra. Let\'s build a HELOC quote together. First, let\'s select your client:',
    options: [
      { value: 'pipeline', label: 'Search Lead Pipeline', icon: '📥' },
      { value: 'parser', label: 'Paste Lead Email', icon: '📋' },
      { value: 'manual', label: 'Enter Manually', icon: '✏️' },
    ],
  },
  {
    id: 'rates',
    question: 'Great! Now let\'s import today\'s rates.',
    description: 'Paste your Figure or Nifty Door rate sheet',
    options: [
      { value: 'figure', label: 'Paste Figure Rates', icon: '📊' },
      { value: 'niftydoor', label: 'Paste Nifty Door Rates', icon: '🚪' },
      { value: 'manual', label: 'Use Default Rates', icon: '⚙️' },
    ],
  },
  {
    id: 'cash-needed',
    question: 'How much cash does the borrower need?',
    description: 'Enter the amount the client wants to receive',
    inputType: 'currency',
    field: 'netCash',
    placeholder: 'e.g., 75000',
  },
  {
    id: 'rate-type',
    question: 'What rate type should we show?',
    description: 'You can change this later in the quote settings',
    options: [
      { value: 'fixed', label: 'Fixed Rates Only', icon: '🔒' },
      { value: 'variable', label: 'Variable Rates Only', icon: '📈' },
      { value: 'both', label: 'Show Both', icon: '⚖️' },
    ],
  },
  {
    id: 'quote-preset',
    question: 'What type of quote do you want to create?',
    description: 'This determines what the client will see',
    options: [
      { value: 'simple', label: 'Simple Quote - Clean & Focused', icon: '✨' },
      { value: 'compare', label: 'Compare Options - Side by Side', icon: '⚖️' },
      { value: 'complete', label: 'Complete Analysis - Everything', icon: '📊' },
    ],
  },
  {
    id: 'confirm',
    question: 'Perfect! Let me confirm the details:',
    description: 'Review and generate your quote',
    inputType: 'confirm',
  },
];

interface QuoteBuilderProps {
  initialInputs?: Partial<LoanInputs>;
  onQuoteGenerated?: (inputs: LoanInputs, sections: QuotePreset['sections']) => void;
}

export const QuoteBuilder: React.FC<QuoteBuilderProps> = ({
  initialInputs,
  onQuoteGenerated,
}) => {
  // State
  const [inputs, setInputs] = useState<LoanInputs>({
    ...DEFAULT_INPUTS,
    ...initialInputs,
  });
  const [rates] = useState<RatesData>(DEFAULT_RATES);
  const [leadBody, setLeadBody] = useState('');
  const [showEzraFlow, setShowEzraFlow] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [, setFlowAnswers] = useState<Record<string, string>>({});
  const [selectedPreset, setSelectedPreset] = useState<QuotePreset>(QUOTE_PRESETS[0]);
  const [rateDisplay, setRateDisplay] = useState<'fixed' | 'variable' | 'both'>('fixed');
  const [expandedSections, setExpandedSections] = useState({
    clientInfo: true,
    rateOptions: false,
    quoteSettings: false,
    preview: false,
  });

  // Hooks
  const quoteResult = useQuoteCalculator(inputs, rates);
  const { parseLeadEmail } = useLeadParser();

  // Apply preset
  const applyPreset = (presetId: string) => {
    const preset = QUOTE_PRESETS.find(p => p.id === presetId);
    if (preset) {
      setSelectedPreset(preset);
      setRateDisplay(preset.rateDisplay === 'both' ? 'fixed' : preset.rateDisplay);
    }
  };

  // Validation helper
  const validateInput = (field: keyof LoanInputs, value: number): boolean => {
    if (field === 'homeValue' && value < 50000) {
      alert('Home value must be at least $50,000');
      return false;
    }
    if (field === 'mortgageBalance' && value < 0) {
      alert('Mortgage balance cannot be negative');
      return false;
    }
    if (field === 'netCash' && value < 0) {
      alert('Cash needed cannot be negative');
      return false;
    }
    if (field === 'helocPayoff' && value < 0) {
      alert('HELOC payoff cannot be negative');
      return false;
    }
    return true;
  };

  // Handle lead parsing
  const handleParseLead = () => {
    try {
      const parsed = parseLeadEmail(leadBody);
      setInputs(prev => ({
        ...prev,
        clientName: (parsed.firstName + ' ' + (parsed.lastName || '')).trim() || prev.clientName,
        clientCredit: parsed.creditScore || prev.clientCredit,
        homeValue: parsed.propertyValue || prev.homeValue,
        mortgageBalance: parsed.currentBalance || prev.mortgageBalance,
        netCash: parsed.cashOut || prev.netCash,
        helocPayoff: parsed.helocBalance || prev.helocPayoff,
        propertyType: parsed.propertyUse?.toLowerCase().includes('investment') ? 'Investment Property' : 'Primary Residence',
      }));
      setExpandedSections(prev => ({ ...prev, clientInfo: true }));
    } catch (error) {
      console.error('Error parsing lead:', error);
      alert('Error parsing lead email. Please check the format and try again.');
    }
  };

  // Ezra Flow Handlers
  const handleFlowOption = (value: string) => {
    const step = EZRA_FLOW_STEPS[currentStep];
    setFlowAnswers(prev => ({ ...prev, [step.id]: value }));

    if (step.id === 'rate-type') {
      setRateDisplay(value as 'fixed' | 'variable' | 'both');
    }

    if (step.id === 'quote-preset') {
      applyPreset(value);
    }

    if (currentStep < EZRA_FLOW_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleFlowInput = (value: string | number) => {
    const step = EZRA_FLOW_STEPS[currentStep];
    if (step.field) {
      setInputs(prev => ({ ...prev, [step.field!]: value }));
    }
  };

  const finishFlow = () => {
    setShowEzraFlow(false);
    setExpandedSections({
      clientInfo: true,
      rateOptions: true,
      quoteSettings: true,
      preview: true,
    });
    onQuoteGenerated?.(inputs, selectedPreset.sections);
  };

  // Toggle section expansion
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Render Ezra Flow
  const renderEzraFlow = () => {
    const step = EZRA_FLOW_STEPS[currentStep];

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden">
          {/* Ezra Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-2xl">
                🤖
              </div>
              <div>
                <h3 className="font-bold text-lg">Ezra</h3>
                <p className="text-blue-100 text-sm">Quote Builder Assistant</p>
              </div>
            </div>
            {/* Progress */}
            <div className="flex gap-1 mt-4">
              {EZRA_FLOW_STEPS.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-1 flex-1 rounded-full transition-all ${
                    idx <= currentStep ? 'bg-white' : 'bg-white/30'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Question Content */}
          <div className="p-6">
            <h4 className="text-xl font-semibold text-gray-800 mb-2">{step.question}</h4>
            {step.description && (
              <p className="text-gray-500 text-sm mb-6">{step.description}</p>
            )}

            {/* Options */}
            {step.options && (
              <div className="space-y-3">
                {step.options.map(option => (
                  <button
                    key={option.value}
                    onClick={() => handleFlowOption(option.value)}
                    className="w-full flex items-center gap-4 p-4 border-2 border-gray-100 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all text-left group"
                  >
                    <span className="text-2xl">{option.icon}</span>
                    <span className="font-medium text-gray-700 group-hover:text-blue-700">
                      {option.label}
                    </span>
                    <span className="ml-auto text-gray-300 group-hover:text-blue-500">→</span>
                  </button>
                ))}
              </div>
            )}

            {/* Currency Input */}
            {step.inputType === 'currency' && (
              <div className="mt-4">
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                  <input
                    type="number"
                    placeholder={step.placeholder}
                    className="w-full pl-8 pr-4 py-4 border-2 border-gray-200 rounded-xl text-lg focus:border-blue-500 focus:outline-none"
                    onChange={(e) => handleFlowInput(parseFloat(e.target.value) || 0)}
                    autoFocus
                  />
                </div>
                <button
                  onClick={() => setCurrentStep(prev => prev + 1)}
                  className="w-full mt-4 bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition"
                >
                  Continue
                </button>
              </div>
            )}

            {/* Confirm Step */}
            {step.inputType === 'confirm' && (
              <div className="mt-4 space-y-4">
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Client</span>
                    <span className="font-medium">{inputs.clientName || 'Not set'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Cash Needed</span>
                    <span className="font-medium">${inputs.netCash.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Rate Type</span>
                    <span className="font-medium capitalize">{rateDisplay}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Quote Style</span>
                    <span className="font-medium">{selectedPreset.name}</span>
                  </div>
                </div>
                <button
                  onClick={finishFlow}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium hover:bg-blue-700 transition"
                >
                  Generate Quote ✨
                </button>
              </div>
            )}
          </div>

          {/* Skip Option */}
          <div className="px-6 pb-4 text-center">
            <button
              onClick={() => setShowEzraFlow(false)}
              className="text-gray-400 text-sm hover:text-gray-600"
            >
              Skip guided setup
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Ezra Flow Modal */}
      {showEzraFlow && renderEzraFlow()}

      {/* Quick Preset Selector */}
      <div className="bg-white rounded-xl shadow-sm border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800 flex items-center gap-2">
            <span>🎯</span> Quote Preset
          </h3>
          <button
            onClick={() => setShowEzraFlow(true)}
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <span>🤖</span> Restart with Ezra
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {QUOTE_PRESETS.map(preset => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset.id)}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                selectedPreset.id === preset.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-100 hover:border-gray-200'
              }`}
            >
              <span className="text-xl">{preset.icon}</span>
              <div className="font-medium text-sm mt-1">{preset.name}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-2">{selectedPreset.description}</p>
      </div>

      {/* Collapsible: Client Information */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <button
          onClick={() => toggleSection('clientInfo')}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition"
        >
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">👤</span>
            <div className="text-left">
              <h3 className="font-semibold text-gray-800">Client Information</h3>
              <p className="text-xs text-gray-500">
                {inputs.clientName || 'No client loaded'} • Home Value: ${inputs.homeValue.toLocaleString()}
              </p>
            </div>
          </div>
          <span className={`transform transition-transform ${expandedSections.clientInfo ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>

        {expandedSections.clientInfo && (
          <div className="p-4 border-t bg-gray-50">
            {/* Lead Parser */}
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-500 uppercase">Load from Lead</label>
              <div className="flex gap-2 mt-1">
                <textarea
                  value={leadBody}
                  onChange={(e) => setLeadBody(e.target.value)}
                  placeholder="Paste Broker Launch Notification email here..."
                  className="flex-1 p-3 border rounded-lg text-sm h-20 resize-none focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <button
                  onClick={handleParseLead}
                  disabled={!leadBody.trim()}
                  className="px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Parse
                </button>
              </div>
            </div>

            {/* Client Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Client Name</label>
                <input
                  type="text"
                  value={inputs.clientName}
                  onChange={(e) => setInputs(prev => ({ ...prev, clientName: e.target.value }))}
                  className="w-full mt-1 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  placeholder="John Smith"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Home Value *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    min="50000"
                    value={inputs.homeValue || ''}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0;
                      if (validateInput('homeValue', value)) {
                        setInputs(prev => ({ ...prev, homeValue: value }));
                      }
                    }}
                    className="w-full mt-1 pl-7 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="500000"
                    required
                  />
                </div>
                {inputs.homeValue > 0 && inputs.homeValue < 50000 && (
                  <p className="text-xs text-red-500 mt-1">Minimum $50,000</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Mortgage Balance *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    min="0"
                    value={inputs.mortgageBalance || ''}
                    onChange={(e) => {
                      const value = Math.max(0, parseFloat(e.target.value) || 0);
                      setInputs(prev => ({ ...prev, mortgageBalance: value }));
                    }}
                    className="w-full mt-1 pl-7 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="300000"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Cash Needed *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                  <input
                    type="number"
                    min="0"
                    value={inputs.netCash || ''}
                    onChange={(e) => {
                      const value = Math.max(0, parseFloat(e.target.value) || 0);
                      setInputs(prev => ({ ...prev, netCash: value }));
                    }}
                    className="w-full mt-1 pl-7 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    placeholder="75000"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Credit Score</label>
                <select
                  value={inputs.clientCredit}
                  onChange={(e) => setInputs(prev => ({ ...prev, clientCredit: e.target.value }))}
                  className="w-full mt-1 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Select...</option>
                  <option value="Excellent (740+)">Excellent (740+)</option>
                  <option value="Good (680-739)">Good (680-739)</option>
                  <option value="Fair (620-679)">Fair (620-679)</option>
                  <option value="Poor (<620)">Poor (&lt;620)</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase">Property Type</label>
                <select
                  value={inputs.propertyType}
                  onChange={(e) => setInputs(prev => ({ ...prev, propertyType: e.target.value }))}
                  className="w-full mt-1 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="Primary Residence">Primary Residence</option>
                  <option value="Secondary Residence">Secondary Residence</option>
                  <option value="Investment Property">Investment Property</option>
                </select>
              </div>
            </div>

            {/* HELOC Payoff (Collapsible) */}
            <div className="mt-4 pt-4 border-t">
              <details className="group">
                <summary className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer hover:text-gray-800">
                  <span>💡</span> Advanced: Existing HELOC Payoff
                  <span className="ml-auto text-xs text-gray-400 group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <div className="mt-3">
                  <label className="text-xs font-medium text-gray-500 uppercase">Existing HELOC Balance</label>
                  <div className="relative max-w-xs">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      type="number"
                      value={inputs.helocPayoff || ''}
                      onChange={(e) => setInputs(prev => ({ ...prev, helocPayoff: parseFloat(e.target.value) || 0 }))}
                      className="w-full mt-1 pl-7 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      placeholder="0"
                    />
                  </div>
                </div>
              </details>
            </div>
          </div>
        )}
      </div>

      {/* Collapsible: Rate Options */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <button
          onClick={() => toggleSection('rateOptions')}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition"
        >
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">💰</span>
            <div className="text-left">
              <h3 className="font-semibold text-gray-800">Rate Options</h3>
              <p className="text-xs text-gray-500">
                {rateDisplay === 'fixed' ? 'Fixed rates only' : rateDisplay === 'variable' ? 'Variable rates only' : 'Fixed & Variable'} • 
                Showing {selectedPreset.showTiers.length} tier{selectedPreset.showTiers.length > 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <span className={`transform transition-transform ${expandedSections.rateOptions ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>

        {expandedSections.rateOptions && (
          <div className="p-4 border-t bg-gray-50">
            {/* Rate Display Toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setRateDisplay('fixed')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  rateDisplay === 'fixed'
                    ? 'bg-green-600 text-white'
                    : 'bg-white border hover:bg-gray-50'
                }`}
              >
                🔒 Fixed Only
              </button>
              <button
                onClick={() => setRateDisplay('variable')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  rateDisplay === 'variable'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white border hover:bg-gray-50'
                }`}
              >
                📈 Variable Only
              </button>
              <button
                onClick={() => setRateDisplay('both')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  rateDisplay === 'both'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white border hover:bg-gray-50'
                }`}
              >
                ⚖️ Show Both
              </button>
            </div>

            {/* Tier Selection */}
            <div className="mb-4">
              <label className="text-xs font-medium text-gray-500 uppercase mb-2 block">Visible Tiers</label>
              <div className="flex gap-2">
                {(['t1', 't2', 't3'] as const).map((tier, idx) => (
                  <button
                    key={tier}
                    onClick={() => {
                      const newTiers = selectedPreset.showTiers.includes(tier)
                        ? selectedPreset.showTiers.filter(t => t !== tier)
                        : [...selectedPreset.showTiers, tier];
                      setSelectedPreset(prev => ({ ...prev, showTiers: newTiers }));
                    }}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                      selectedPreset.showTiers.includes(tier)
                        ? 'bg-slate-800 text-white'
                        : 'bg-white border text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    Tier {idx + 1}
                  </button>
                ))}
              </div>
            </div>

            {/* Rate Matrix Preview */}
            <div className="bg-white rounded-lg border p-4">
              <RateMatrix 
                quoteResult={quoteResult} 
                showTiers={selectedPreset.showTiers}
                rateDisplay={rateDisplay}
              />
            </div>
          </div>
        )}
      </div>

      {/* Collapsible: Quote Settings */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <button
          onClick={() => toggleSection('quoteSettings')}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition"
        >
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">⚙️</span>
            <div className="text-left">
              <h3 className="font-semibold text-gray-800">Quote Settings</h3>
              <p className="text-xs text-gray-500">
                {selectedPreset.sections.recommendation ? 'Recommendation ' : ''}
                {selectedPreset.sections.rateMatrix ? 'Rate Matrix ' : ''}
                {selectedPreset.sections.analysis ? 'Analysis' : ''}
              </p>
            </div>
          </div>
          <span className={`transform transition-transform ${expandedSections.quoteSettings ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>

        {expandedSections.quoteSettings && (
          <div className="p-4 border-t bg-gray-50">
            <ExportPanel
              inputs={inputs}
              quoteResult={quoteResult}
              sections={selectedPreset.sections}
              setSections={(sections) => setSelectedPreset(prev => ({ ...prev, sections: sections as QuotePreset['sections'] }))}
            />
          </div>
        )}
      </div>

      {/* Preview Section */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <button
          onClick={() => toggleSection('preview')}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition"
        >
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">👁️</span>
            <div className="text-left">
              <h3 className="font-semibold text-gray-800">Client Preview</h3>
              <p className="text-xs text-gray-500">See what your client will see</p>
            </div>
          </div>
          <span className={`transform transition-transform ${expandedSections.preview ? 'rotate-180' : ''}`}>
            ▼
          </span>
        </button>

        {expandedSections.preview && (
          <div className="p-4 border-t">
            {/* Recommendation */}
            {selectedPreset.sections.recommendation && (
              <Recommendation quoteResult={quoteResult} netCash={inputs.netCash} />
            )}

            {/* Rate Matrix */}
            {selectedPreset.sections.rateMatrix && (
              <RateMatrix 
                quoteResult={quoteResult}
                showTiers={selectedPreset.showTiers}
                rateDisplay={rateDisplay}
              />
            )}

            {/* Analysis */}
            {selectedPreset.sections.analysis && (
              <Analysis quoteResult={quoteResult} inputs={inputs} />
            )}
          </div>
        )}
      </div>
    </div>
  );
};
