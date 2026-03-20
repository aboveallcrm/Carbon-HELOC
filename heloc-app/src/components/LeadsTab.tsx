import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthProvider';

interface LeadData {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    source_id?: string;
    raw?: unknown;
}

interface Lead {
    id: string;
    user_id: string;
    source: string;
    data: LeadData;
    status: string;
    created_at: string;
}

export const LeadsTab: React.FC = () => {
    const { user } = useAuth();
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(() => !!user);

    useEffect(() => {
        if (!user) return;

        let isActive = true;

        const loadLeads = async () => {
            const { data, error } = await supabase
                .from('leads')
                .select('*')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })
                .limit(50);

            if (!isActive) return;

            if (error) {
                console.error('Error fetching leads:', error);
            } else {
                setLeads((data as unknown as Lead[]) || []);
            }
            setLoading(false);
        };

        void loadLeads();

        const subscription = supabase
            .channel('leads_channel')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'leads',
                filter: `user_id=eq.${user.id}`
            }, payload => {
                setLeads(prev => [payload.new as unknown as Lead, ...prev]);
            })
            .subscribe();

        return () => {
            isActive = false;
            subscription.unsubscribe();
        };
    }, [user]);

    if (loading) return <div className="p-4 text-center text-gray-500">Loading leads...</div>;

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <h2 className="text-xl font-bold mb-4">Incoming Leads</h2>

            {leads.length === 0 ? (
                <div className="bg-white p-8 text-center rounded shadow text-gray-500">
                    No leads found yet. Start sending traffic to your webhook!
                </div>
            ) : (
                <div className="bg-white rounded shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {leads.map((lead) => (
                                <tr key={lead.id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        {new Date(lead.created_at).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {lead.data?.first_name} {lead.data?.last_name}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <div>{lead.data?.email || '—'}</div>
                                        <div className="text-xs text-gray-400">{lead.data?.phone || '—'}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs">
                                            {lead.source}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                            {lead.status || 'New'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <button className="text-blue-600 hover:text-blue-900" onClick={() => alert(JSON.stringify(lead.data?.raw, null, 2))}>
                                            View Payload
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
