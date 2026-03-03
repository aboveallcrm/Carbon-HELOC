import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export const GlobalSettings: React.FC = () => {
    const [radarKey, setRadarKey] = useState('');
    const [aiKey, setAiKey] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const { data, error } = await supabase
                .from('app_settings')
                .select('*')
                .in('key', ['global_radar_key', 'global_ai_key']);

            if (error) throw error;

            if (data) {
                const radar = data.find(d => d.key === 'global_radar_key');
                const ai = data.find(d => d.key === 'global_ai_key');
                if (radar) setRadarKey(radar.value);
                if (ai) setAiKey(ai.value);
            }
        } catch (error) {
            console.error('Error loading global settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const updates = [
                { key: 'global_radar_key', value: radarKey, description: 'Global Radar API Key' },
                { key: 'global_ai_key', value: aiKey, description: 'Global AI API Key' }
            ];

            const { error } = await supabase
                .from('app_settings')
                .upsert(updates);

            if (error) throw error;
            alert('Global settings saved!');
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            alert('Error saving settings: ' + msg);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div>Loading global settings...</div>;

    return (
        <div className="space-y-4">
            <div className="p-4 bg-gray-50 border rounded-md">
                <h3 className="font-bold text-gray-700 mb-2">Global API Keys (Super Admin)</h3>
                <p className="text-xs text-gray-500 mb-4">These keys are used system-wide and are not visible to individual users.</p>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Global Radar API Key</label>
                    <input
                        type="password"
                        value={radarKey}
                        onChange={(e) => setRadarKey(e.target.value)}
                        placeholder="sk_radar_..."
                        className="w-full p-2 border rounded focus:ring-purple-500 focus:border-purple-500"
                    />
                </div>

                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Global AI API Key</label>
                    <input
                        type="password"
                        value={aiKey}
                        onChange={(e) => setAiKey(e.target.value)}
                        placeholder="sk_ai_..."
                        className="w-full p-2 border rounded focus:ring-purple-500 focus:border-purple-500"
                    />
                </div>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="w-full bg-purple-600 text-white py-2 rounded font-bold hover:bg-purple-700 disabled:opacity-50"
                >
                    {saving ? 'Saving...' : 'Save Global Settings'}
                </button>
            </div>
        </div>
    );
};
