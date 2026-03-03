import React from 'react';
import { useAuth } from './AuthProvider';
import { GlobalSettings } from './GlobalSettings';
import { UserManagement } from './UserManagement';
import { TierManagement } from './TierManagement';

export const AdminDashboard: React.FC = () => {
    const { role, signOut } = useAuth();

    if (role !== 'super_admin' && role !== 'admin') {
        return (
            <div className="p-8 text-center text-red-600">
                <h2 className="text-xl font-bold">Access Denied</h2>
                <p>You do not have permission to view this page.</p>
                <button onClick={signOut} className="mt-4 text-blue-600 underline">Sign Out</button>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold text-gray-800">
                    {role === 'super_admin' ? 'Super Admin Dashboard' : 'Admin Dashboard'}
                </h1>
                <button
                    onClick={signOut}
                    className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300"
                >
                    Sign Out
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* User Management (Super Admin Only) */}
                {role === 'super_admin' && (
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h2 className="text-lg font-bold mb-4 border-b pb-2">User Management</h2>
                        <UserManagement />
                    </div>
                )}

                {/* Global Settings (Super Admin Only) */}
                {role === 'super_admin' && (
                    <div className="bg-white p-6 rounded-lg shadow">
                        <h2 className="text-lg font-bold mb-4 border-b pb-2">Global Settings</h2>
                        <GlobalSettings />
                    </div>
                )}

            </div>

            {/* Tier Management — full width, Super Admin only */}
            {role === 'super_admin' && (
                <div className="bg-white p-6 rounded-lg shadow mt-6">
                    <h2 className="text-lg font-bold mb-1 border-b pb-2">Subscription Tiers</h2>
                    <p className="text-xs text-gray-400 mb-4">Manually assign Carbon, Platinum, or Obsidian access to each user.</p>
                    <TierManagement />
                </div>
            )}

        </div>
    );
};
