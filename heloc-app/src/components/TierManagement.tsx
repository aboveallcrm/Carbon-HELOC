import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { Tier } from './AuthProvider';

type UserRow = {
    id: string;
    email: string;
    role: string;
    tier: Tier | null;
};

const TIERS: Tier[] = ['starter', 'pro', 'enterprise'];

const TIER_CONFIG: Record<Tier, { label: string; color: string; emoji: string; description: string }> = {
    starter: {
        label: 'Starter',
        color: 'bg-gray-100 text-gray-700 border border-gray-300',
        emoji: '⚫',
        description: 'Quote Builder, Refi Architect, Parser, PDF/Email',
    },
    pro: {
        label: 'Pro',
        color: 'bg-purple-100 text-purple-800 border border-purple-300',
        emoji: '🔷',
        description: 'Everything in Starter + Leads, Ezra AI, CRM Sync',
    },
    enterprise: {
        label: 'Enterprise',
        color: 'bg-teal-100 text-teal-800 border border-teal-300',
        emoji: '🌟',
        description: '5 Team Seats, White Label, Unlimited AI, HeyGen',
    },
};

export const TierManagement: React.FC = () => {
    const [users, setUsers] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);

    const loadUsers = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('profiles')
            .select('id, email, role, tier')
            .order('email');
        setUsers((data || []) as UserRow[]);
        setLoading(false);
    };

    useEffect(() => {
        // eslint-disable-next-line
        loadUsers();
    }, []);

    const updateTier = async (userId: string, newTier: Tier) => {
        setSavingId(userId);
        const { error } = await supabase
            .from('profiles')
            .update({ tier: newTier })
            .eq('id', userId);
        if (error) {
            alert('Error updating tier: ' + error.message);
        } else {
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, tier: newTier } : u));
        }
        setSavingId(null);
    };

    const tierBadge = (tier: Tier | null) => {
        const config = TIER_CONFIG[tier ?? 'starter'];
        return (
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${config.color}`}>
                {config.emoji} {config.label}
            </span>
        );
    };

    if (loading) return <div className="text-sm text-gray-500">Loading...</div>;

    return (
        <div className="space-y-4">
            {/* Tier Legend */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {TIERS.map(t => {
                    const config = TIER_CONFIG[t];
                    return (
                        <div key={t} className={`p-3 rounded-lg border text-xs ${config.color}`}>
                            <div className="font-bold text-sm mb-1">{config.emoji} {config.label}</div>
                            <div className="opacity-80">{config.description}</div>
                        </div>
                    );
                })}
            </div>

            {/* User Tier Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b">
                            <th className="text-left pb-2 text-xs font-bold text-gray-500 uppercase">User</th>
                            <th className="text-left pb-2 text-xs font-bold text-gray-500 uppercase">Current Tier</th>
                            <th className="text-left pb-2 text-xs font-bold text-gray-500 uppercase">Change Tier</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id} className="border-b last:border-0 hover:bg-gray-50">
                                <td className="py-3 pr-4">
                                    <div className="font-medium text-gray-800">{user.email || '—'}</div>
                                    <div className="text-xs text-gray-400 capitalize">{user.role}</div>
                                </td>
                                <td className="py-3 pr-4">
                                    {tierBadge(user.tier)}
                                </td>
                                <td className="py-3">
                                    <select
                                        value={user.tier ?? 'starter'}
                                        disabled={savingId === user.id}
                                        onChange={e => updateTier(user.id, e.target.value as Tier)}
                                        className="text-xs border rounded px-2 py-1 bg-white disabled:opacity-50"
                                    >
                                        {TIERS.map(t => (
                                            <option key={t} value={t}>{TIER_CONFIG[t].emoji} {TIER_CONFIG[t].label}</option>
                                        ))}
                                    </select>
                                    {savingId === user.id && (
                                        <span className="ml-2 text-xs text-gray-400">Saving...</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="flex justify-end">
                <button onClick={loadUsers} className="text-xs text-blue-600 hover:underline">Refresh</button>
            </div>
        </div>
    );
};
