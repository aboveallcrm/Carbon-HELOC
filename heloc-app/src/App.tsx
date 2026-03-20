import { useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { RateMatrix } from './components/RateMatrix';
import { Recommendation } from './components/Recommendation';
import { Analysis } from './components/Analysis';
import { useQuoteCalculator } from './hooks/useQuoteCalculator';
import { useLeadParser } from './hooks/useLeadParser';
import { DEFAULT_INPUTS, DEFAULT_RATES } from './constants';
import type { LoanInputs, RatesData } from './types';
import { AuthProvider, useAuth } from './components/AuthProvider';
import type { Tier } from './components/AuthProvider';
import { Login } from './components/Login';
import { AdminDashboard } from './components/AdminDashboard';
import { LeadsTab } from './components/LeadsTab';
import { IntegrationsSettings } from './components/IntegrationsSettings';
import { UserProfile } from './components/UserProfile';
import { BillingSettings } from './components/BillingSettings';
import { TierGate } from './components/TierGate';
import { useTier } from './hooks/useTier';
import { ExportPanel } from './components/ExportPanel';

function getClientViewConfig() {
  const defaultSections = {
    rateMatrix: true,
    recommendation: true,
    analysis: true,
  };

  if (typeof window === 'undefined') {
    return { inputs: DEFAULT_INPUTS, sections: defaultSections, isClientView: false };
  }

  const q = new URLSearchParams(window.location.search).get('q');
  if (!q) {
    return { inputs: DEFAULT_INPUTS, sections: defaultSections, isClientView: false };
  }

  try {
    const payload = JSON.parse(atob(q));
    return {
      inputs: payload.i ? { ...DEFAULT_INPUTS, ...payload.i } : DEFAULT_INPUTS,
      sections: payload.s ? { ...defaultSections, ...payload.s } : defaultSections,
      isClientView: true,
    };
  } catch {
    console.error("Failed to parse client link");
    return { inputs: DEFAULT_INPUTS, sections: defaultSections, isClientView: false };
  }
}

function SettingsTabs() {
  const [activeTab, setActiveTab] = useState<'profile' | 'bonzo' | 'billing'>('profile');
  return (
    <div>
      <div className="border-b flex hover:overflow-x-auto overflow-hidden">
        {(['profile', 'bonzo', 'billing'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 text-sm font-medium transition border-b-2 whitespace-nowrap ${activeTab === tab
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
          >
            {tab === 'profile' ? 'My Profile' : tab === 'bonzo' ? 'Bonzo Integration' : 'Billing & Plans'}
          </button>
        ))}
      </div>
      <div className="p-6">
        {activeTab === 'profile' && <UserProfile />}
        {activeTab === 'bonzo' && <IntegrationsSettings />}
        {activeTab === 'billing' && <BillingSettings />}
      </div>
    </div>
  );
}

function AppContent() {
  const { session, role, signOut, loading, realTier, setDemoTier } = useAuth();
  const { tier, hasTier } = useTier();
  const [clientViewConfig] = useState(getClientViewConfig);
  const [currentView, setCurrentView] = useState('quote');
  const [inputs, setInputs] = useState<LoanInputs>(clientViewConfig.inputs);
  const [rates] = useState<RatesData>(DEFAULT_RATES);
  const [leadBody, setLeadBody] = useState('');
  const [isClientView] = useState(clientViewConfig.isClientView);
  const [sections, setSections] = useState(clientViewConfig.sections);

  // Custom hooks
  const quoteResult = useQuoteCalculator(inputs, rates);
  const { parseLeadEmail } = useLeadParser();

  const handleParse = () => {
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
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  if (!session && !isClientView) {
    return <Login />;
  }

  return (
    <div className="main-container bg-gray-50 min-h-screen font-sans">
      {/* Navigation Bar */}
      {!isClientView && (
        <nav className="bg-white shadow-sm border-b px-6 py-3 flex justify-between items-center sticky top-0 z-50 print:hidden">
          <div className="flex items-center space-x-4">
            <span className="font-bold text-lg text-gray-800 tracking-tight">Above All HELOC</span>
            <div className="h-6 w-px bg-gray-300 mx-2"></div>
            <button
              onClick={() => setCurrentView('quote')}
              className={`px-3 py-1 rounded text-sm font-medium transition ${currentView === 'quote' ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Quote Tool
            </button>
            {hasTier('platinum') && (
              <button
                onClick={() => setCurrentView('leads')}
                className={`px-3 py-1 rounded text-sm font-medium transition ${currentView === 'leads' ? 'bg-blue-100 text-blue-800' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Leads
              </button>
            )}

            {(role === 'super_admin' || role === 'admin') && (
              <button
                onClick={() => setCurrentView('admin')}
                className={`px-3 py-1 rounded text-sm font-medium transition ${currentView === 'admin' ? 'bg-purple-100 text-purple-800' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                Admin Dashboard
              </button>
            )}
            <button
              onClick={() => setCurrentView('settings')}
              className={`px-3 py-1 rounded text-sm font-medium transition ${currentView === 'settings' ? 'bg-gray-200 text-gray-800' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Settings
            </button>
          </div>
          <div className="flex items-center space-x-4">
            {(role === 'super_admin' || role === 'admin') && (
              <div className="flex items-center space-x-2 mr-2 border-r pr-4 border-gray-200">
                <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Demo:</span>
                <select
                  className="text-xs border-transparent hover:border-gray-300 rounded bg-gray-100 hover:bg-white text-gray-700 font-medium py-1 px-2 cursor-pointer transition focus:ring-0 focus:border-blue-500 outline-none"
                  value={tier === realTier ? 'real' : tier ?? 'carbon'}
                  onChange={(e) => {
                    if (e.target.value === 'real') {
                      setDemoTier(null);
                    } else {
                      setDemoTier(e.target.value as Tier);
                    }
                  }}
                >
                  <option value="real">Real Tier ({realTier || 'carbon'})</option>
                  <option value="carbon">Carbon</option>
                  <option value="platinum">Platinum</option>
                  <option value="titanium">Titanium</option>
                  <option value="obsidian">Obsidian</option>
                  <option value="diamond">Diamond</option>
                </select>
              </div>
            )}
            <span className="text-sm text-gray-500">
              {session?.user?.email}
              <span className="ml-1 text-xs opacity-60">
                ({tier ?? 'carbon'})
              </span>
            </span>
            <button
              onClick={signOut}
              className="text-sm text-red-600 hover:text-red-800 font-medium"
            >
              Sign Out
            </button>
          </div>
        </nav>
      )}

      {/* Main Content Area */}
      {currentView === 'admin' ? (
        <AdminDashboard />
      ) : currentView === 'leads' ? (
        <LeadsTab />
      ) : currentView === 'settings' ? (
        <div className="p-6 max-w-4xl mx-auto">
          <h1 className="text-2xl font-bold mb-6">Settings</h1>
          <div className="bg-white rounded shadow overflow-hidden">
            <SettingsTabs />
          </div>
        </div>
      ) : (
        <div className="main-container">
          <Header />

          <div className="content-body">

            {/* Export Panel (Hidden from Clients and Print) */}
            {!isClientView && (
              <ExportPanel inputs={inputs} quoteResult={quoteResult} sections={sections} setSections={setSections} />
            )}

            {/* Helper for Parser */}
            {!isClientView && (
              <div className="mb-4 p-4 bg-gray-100 rounded print:hidden">
                <h3>Lead Parser</h3>
                <textarea
                  className="w-full h-24 p-2 text-xs border rounded"
                  placeholder="Paste Broker Launch Notification email body here..."
                  value={leadBody}
                  onChange={(e) => setLeadBody(e.target.value)}
                />
                <button
                  className="mt-2 bg-blue-600 text-white px-4 py-2 rounded text-xs font-bold uppercase"
                  onClick={handleParse}
                >
                  Parse Lead
                </button>
              </div>
            )}

            <div className="client-grid">
              {/* Inputs Placeholders - normally these would be editable inputs */}
              <div>
                <span className="client-label">Client Name</span>
                <input
                  className="client-data w-full bg-transparent border-b border-gray-300 focus:outline-none"
                  value={inputs.clientName}
                  onChange={e => setInputs({ ...inputs, clientName: e.target.value })}
                  placeholder="Client Name"
                />
              </div>
              <div>
                <span className="client-label">Home Value</span>
                <input
                  type="number"
                  className="client-data w-full bg-transparent border-b border-gray-300 focus:outline-none"
                  value={inputs.homeValue || ''}
                  onChange={e => setInputs({ ...inputs, homeValue: parseFloat(e.target.value) || 0 })}
                />
              </div>
              <div>
                <span className="client-label">Mortgage Balance</span>
                <input
                  type="number"
                  className="client-data w-full bg-transparent border-b border-gray-300 focus:outline-none"
                  value={inputs.mortgageBalance || ''}
                  onChange={e => setInputs({ ...inputs, mortgageBalance: parseFloat(e.target.value) || 0 })}
                />
              </div>
              {/* Add more inputs as per original design */}
            </div>

            {/* Valuation Blocks */}
            <div className="valuation-blocks">
              <div className="data-block">
                <div className="block-label">CLTV</div>
                <div className="block-value">{quoteResult.cltv.toFixed(2)}%</div>
              </div>
              <div className="data-block highlight">
                <div className="block-label">Net Cash to Client</div>
                <div className="block-value gold">${inputs.netCash.toLocaleString()}</div>
              </div>
            </div>

            {/* Rate Matrix */}
            {sections.rateMatrix && <RateMatrix quoteResult={quoteResult} />}

            {/* Recommendation — Platinum+ */}
            {sections.recommendation && (
              <TierGate requires="platinum" message="Scenario recommendations and savings breakdown require the Platinum tier.">
                <Recommendation quoteResult={quoteResult} netCash={inputs.netCash} />
              </TierGate>
            )}

            {/* Analysis Sections — Obsidian only */}
            {sections.analysis && (
              <TierGate requires="obsidian" message="Deep financial analysis and AI-powered insights require the Obsidian tier.">
                <Analysis quoteResult={quoteResult} inputs={inputs} />
              </TierGate>
            )}

          </div>

          <Footer />
        </div>
      )}
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
