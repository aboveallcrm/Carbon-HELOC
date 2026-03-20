import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthProvider';

export const IntegrationsSettings: React.FC = () => {
    const { user } = useAuth();
    const [bonzoKey, setBonzoKey] = useState('');
    const [bonzoXKey, setBonzoXKey] = useState(''); // New
    const [bonzoBranchId, setBonzoBranchId] = useState(''); // New
    const [bonzoUserId, setBonzoUserId] = useState(''); // New

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [webhookUrl, setWebhookUrl] = useState('');

    const loadIntegrations = useCallback(async () => {
        if (!user) return;
        try {
            const { data, error } = await supabase
                .from('user_integrations')
                .select('api_key, metadata')
                .eq('user_id', user.id)
                .eq('provider', 'bonzo')
                .single();

            if (error) {
                if (error.code !== 'PGRST116') throw error; // Ignore "Row not found" error
            }

            if (data) {
                setBonzoKey(data.api_key || '');
                if (data.metadata) {
                    setBonzoXKey(data.metadata.x_key || '');
                    setBonzoBranchId(data.metadata.branch_id || '');
                    setBonzoUserId(data.metadata.bonzo_user_id || '');
                }
            }
        } catch (error) {
            console.error('Error loading integrations:', error);
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            loadIntegrations();
            const functionUrl = import.meta.env.VITE_SUPABASE_URL
                ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bonzo-webhook?user_id=${user.id}`
                : `https://[PROJECT_REF].supabase.co/functions/v1/bonzo-webhook?user_id=${user.id}`;
            setWebhookUrl(functionUrl);
        }
    }, [loadIntegrations, user]);

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from('user_integrations')
                .upsert({
                    user_id: user.id,
                    provider: 'bonzo',
                    api_key: bonzoKey,
                    metadata: {
                        x_key: bonzoXKey,
                        branch_id: bonzoBranchId,
                        bonzo_user_id: bonzoUserId
                    },
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id,provider' });

            if (error) throw error;
            alert('Settings saved!');
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            alert('Error saving settings: ' + msg);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div>Loading settings...</div>;

    return (
        <div className="space-y-4">
            <div className="p-4 bg-gray-50 border rounded-md">
                <h3 className="font-bold text-gray-700 mb-2">My Bonzo Integration</h3>
                <p className="text-xs text-gray-500 mb-4">Configure your personal Bonzo account settings.</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
                        <input
                            type="password"
                            value={bonzoKey}
                            onChange={(e) => setBonzoKey(e.target.value)}
                            className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Bonzo API Key"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">X Key (Secret)</label>
                        <input
                            type="password"
                            value={bonzoXKey}
                            onChange={(e) => setBonzoXKey(e.target.value)}
                            className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Bonzo X Key"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Branch ID (Optional)</label>
                        <input
                            type="text"
                            value={bonzoBranchId}
                            onChange={(e) => setBonzoBranchId(e.target.value)}
                            className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
                            placeholder="e.g. 12345"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Bonzo User ID (Optional)</label>
                        <input
                            type="text"
                            value={bonzoUserId}
                            onChange={(e) => setBonzoUserId(e.target.value)}
                            className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
                            placeholder="e.g. 67890"
                        />
                    </div>
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Incoming Webhook URL</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            readOnly
                            value={webhookUrl}
                            className="w-full p-2 border rounded bg-gray-100 text-gray-500 font-mono text-xs"
                        />
                        <button
                            onClick={() => navigator.clipboard.writeText(webhookUrl)}
                            className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 text-xs font-bold"
                        >
                            COPY
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                        Paste this into Bonzo &gt; Settings &gt; Webhooks to receive leads here.
                    </p>
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 disabled:opacity-50"
                >
                    {saving ? 'Saving...' : 'Save My Integration'}
                </button>
            </div>
        </div>
    );
};
