import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

type Profile = {
    id: string;
    email: string;
    role: 'super_admin' | 'admin' | 'user';
    created_at: string;
};

export const UserManagement: React.FC = () => {
    const [users, setUsers] = useState<Profile[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, email, role, created_at')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setUsers(data || []);
        } catch (err) {
            console.error('Error loading users:', err);
        } finally {
            setLoading(false);
        }
    };

    const updateRole = async (userId: string, newRole: Profile['role']) => {
        setSavingId(userId);
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ role: newRole })
                .eq('id', userId);

            if (error) throw error;

            // Update local state
            setUsers(prev =>
                prev.map(u => u.id === userId ? { ...u, role: newRole } : u)
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            alert('Error updating role: ' + msg);
        } finally {
            setSavingId(null);
        }
    };

    const roleBadge = (role: Profile['role']) => {
        const styles: Record<Profile['role'], string> = {
            super_admin: 'bg-purple-100 text-purple-800',
            admin: 'bg-blue-100 text-blue-800',
            user: 'bg-gray-100 text-gray-700',
        };
        return (
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${styles[role]}`}>
                {role.replace('_', ' ')}
            </span>
        );
    };

    if (loading) return <div className="text-sm text-gray-500">Loading users...</div>;

    return (
        <div className="space-y-3">
            <div className="flex justify-between items-center mb-2">
                <p className="text-sm text-gray-500">{users.length} registered user{users.length !== 1 ? 's' : ''}</p>
                <button
                    onClick={loadUsers}
                    className="text-xs text-blue-600 hover:underline"
                >
                    Refresh
                </button>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b">
                            <th className="text-left pb-2 text-xs font-bold text-gray-500 uppercase">Email</th>
                            <th className="text-left pb-2 text-xs font-bold text-gray-500 uppercase">Role</th>
                            <th className="text-left pb-2 text-xs font-bold text-gray-500 uppercase">Joined</th>
                            <th className="text-left pb-2 text-xs font-bold text-gray-500 uppercase">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(user => (
                            <tr key={user.id} className="border-b last:border-0 hover:bg-gray-50">
                                <td className="py-3 pr-4 text-gray-800 font-medium">{user.email || '—'}</td>
                                <td className="py-3 pr-4">{roleBadge(user.role)}</td>
                                <td className="py-3 pr-4 text-gray-400 text-xs">
                                    {new Date(user.created_at).toLocaleDateString()}
                                </td>
                                <td className="py-3">
                                    {user.role !== 'super_admin' ? (
                                        <select
                                            value={user.role}
                                            disabled={savingId === user.id}
                                            onChange={e => updateRole(user.id, e.target.value as Profile['role'])}
                                            className="text-xs border rounded px-2 py-1 bg-white disabled:opacity-50"
                                        >
                                            <option value="user">User</option>
                                            <option value="admin">Admin</option>
                                            <option value="super_admin">Super Admin</option>
                                        </select>
                                    ) : (
                                        <span className="text-xs text-gray-400 italic">Protected</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {users.length === 0 && (
                <div className="text-center py-6 text-gray-400 text-sm">No users found.</div>
            )}
        </div>
    );
};
