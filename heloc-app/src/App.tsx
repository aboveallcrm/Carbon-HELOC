import { useState } from 'react';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { AuthProvider, useAuth } from './components/AuthProvider';
import type { Tier } from './components/AuthProvider';
import { Login } from './components/Login';
import { AdminDashboard } from './components/AdminDashboard';
import { LeadsTab } from './components/LeadsTab';
import { IntegrationsSettings } from './components/IntegrationsSettings';
import { UserProfile } from './components/UserProfile';
import { BillingSettings } from './components/BillingSettings';
import { useTier } from './hooks/useTier';
import { QuoteBuilder } from './components/QuoteBuilder';
import type { LoanInputs } from './types';

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
  const [currentView, setCurrentView] = useState('quote');
  const [lastGeneratedQuote, setLastGeneratedQuote] = useState<{
    inputs: LoanInputs;
    sections: { rateMatrix: boolean; recommendation: boolean; analysis: boolean };
  } | null>(null);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  if (!session) {
    return <Login />;
  }

  return (
    <div className="main-container bg-gray-50 min-h-screen font-sans">
      {/* Navigation Bar */}
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
          {hasTier('pro') && (
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
                value={tier === realTier ? 'real' : tier ?? 'starter'}
                onChange={(e) => {
                  if (e.target.value === 'real') {
                    setDemoTier(null);
                  } else {
                    setDemoTier(e.target.value as Tier);
                  }
                }}
              >
                <option value="real">Real Tier ({realTier || 'starter'})</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          )}
          <span className="text-sm text-gray-500">
            {session?.user?.email}
            <span className="ml-1 text-xs opacity-60">
              ({tier ?? 'starter'})
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

          <div className="content-body p-6 max-w-6xl mx-auto">
            {/* Quote Builder */}
            <QuoteBuilder
              initialInputs={lastGeneratedQuote?.inputs}
              onQuoteGenerated={(inputs, sections) => {
                setLastGeneratedQuote({ inputs, sections });
              }}
            />
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
