import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthProvider';

type ProfileData = {
    display_name: string;
    phone: string;
    nmls_number: string;
    company_name: string;
    headshot_url: string;
    lead_notifications_email: boolean;
};

export const UserProfile: React.FC = () => {
    const { user } = useAuth();
    const [profile, setProfile] = useState<ProfileData>({
        display_name: '',
        phone: '',
        nmls_number: '',
        company_name: '',
        headshot_url: '',
        lead_notifications_email: true,
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        const loadProfile = async () => {
            if (!user) return;
            try {
                const { data } = await supabase
                    .from('profiles')
                    .select('display_name, phone, nmls_number, company_name, headshot_url, lead_notifications_email')
                    .eq('id', user.id)
                    .single();

                if (data) {
                    setProfile({
                        display_name: data.display_name || '',
                        phone: data.phone || '',
                        nmls_number: data.nmls_number || '',
                        company_name: data.company_name || '',
                        headshot_url: data.headshot_url || '',
                        lead_notifications_email: data.lead_notifications_email !== false,
                    });
                }
            } catch (err) {
                console.error('Error loading profile:', err);
            } finally {
                setLoading(false);
            }
        };

        if (user) loadProfile();
    }, [user]);

    const handleSave = async () => {
        if (!user) return;
        setSaving(true);
        setSaved(false);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({
                    display_name: profile.display_name,
                    phone: profile.phone,
                    nmls_number: profile.nmls_number,
                    company_name: profile.company_name,
                    headshot_url: profile.headshot_url,
                    lead_notifications_email: profile.lead_notifications_email,
                })
                .eq('id', user.id);

            if (error) throw error;
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            alert('Error saving profile: ' + msg);
        } finally {
            setSaving(false);
        }
    };

    const handleChange = (field: keyof ProfileData, value: string) => {
        setProfile(prev => ({ ...prev, [field]: value }));
        setSaved(false);
    };

    if (loading) return <div className="text-sm text-gray-500">Loading profile...</div>;

    return (
        <div className="space-y-4">
            {/* Headshot Preview */}
            <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 rounded-full border-2 border-gray-200 overflow-hidden bg-gray-100 flex items-center justify-center">
                    {profile.headshot_url ? (
                        <img
                            src={profile.headshot_url}
                            alt="Headshot"
                            className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                    ) : (
                        <span className="text-2xl text-gray-400">👤</span>
                    )}
                </div>
                <div className="flex-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Headshot URL</label>
                    <input
                        type="url"
                        value={profile.headshot_url}
                        onChange={e => handleChange('headshot_url', e.target.value)}
                        placeholder="https://example.com/photo.jpg"
                        className="w-full p-2 border rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
                    <input
                        type="text"
                        value={profile.display_name}
                        onChange={e => handleChange('display_name', e.target.value)}
                        placeholder="e.g. John Barragan"
                        className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                        type="tel"
                        value={profile.phone}
                        onChange={e => handleChange('phone', e.target.value)}
                        placeholder="(555) 555-5555"
                        className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">NMLS #</label>
                    <input
                        type="text"
                        value={profile.nmls_number}
                        onChange={e => handleChange('nmls_number', e.target.value)}
                        placeholder="e.g. 123456"
                        className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                    <input
                        type="text"
                        value={profile.company_name}
                        onChange={e => handleChange('company_name', e.target.value)}
                        placeholder="Above All Financial"
                        className="w-full p-2 border rounded focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
            </div>

            {/* Notification Preferences */}
            <div className="border rounded-lg p-4 bg-gray-50">
                <h3 className="text-sm font-bold text-gray-700 mb-3">🔔 Notification Preferences</h3>
                <label className="flex items-center justify-between cursor-pointer">
                    <div>
                        <span className="text-sm font-medium text-gray-700">Email me when a new lead arrives</span>
                        <p className="text-xs text-gray-400 mt-0.5">Sends an email to <strong>{user?.email}</strong> via Resend when Bonzo delivers a lead.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setProfile(prev => ({
                            ...prev,
                            lead_notifications_email: !prev.lead_notifications_email
                        }))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${profile.lead_notifications_email ? 'bg-blue-600' : 'bg-gray-300'
                            }`}
                    >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${profile.lead_notifications_email ? 'translate-x-6' : 'translate-x-1'
                            }`} />
                    </button>
                </label>
            </div>

            <div className="flex items-center gap-3 pt-2">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="bg-blue-600 text-white px-6 py-2 rounded font-bold hover:bg-blue-700 disabled:opacity-50"
                >
                    {saving ? 'Saving...' : 'Save Profile'}
                </button>
                {saved && (
                    <span className="text-green-600 text-sm font-medium">✓ Profile saved!</span>
                )}
            </div>
        </div>
    );
};
