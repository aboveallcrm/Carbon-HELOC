import React, { useState } from 'react';

interface Props {
    onLogin: (email: string) => void;
}

export const AdminLogin: React.FC<Props> = ({ onLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = () => {
        // In a real app, this would verify against backend.
        // For this migration phase with "Convex for Postgres" requested but no full Auth spec, 
        // we simulate the check or expect the backend to verify.
        // Given the prompt "Super Admin email is barraganmortgage@gmail.com", we enforce this.

        if (email.toLowerCase() === 'barraganmortgage@gmail.com') {
            if (password === 'admin123') { // Temporary simple password or strictly email based?
                onLogin(email);
            } else {
                setError('Invalid password');
            }
        } else {
            setError('Unauthorized email');
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-slate-800 p-8 rounded-lg border border-yellow-600 text-center max-w-sm w-full">
                <h2 className="text-yellow-600 text-xl font-bold mb-4 uppercase">Admin Entry</h2>
                <input
                    type="email"
                    placeholder="Email"
                    className="w-full p-2 mb-2 rounded bg-slate-700 text-white border border-slate-600"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                />
                <input
                    type="password"
                    placeholder="Password"
                    className="w-full p-2 mb-4 rounded bg-slate-700 text-white border border-slate-600"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                />
                {error && <div className="text-red-500 text-xs mb-2">{error}</div>}
                <button
                    onClick={handleLogin}
                    className="bg-gradient-to-r from-yellow-600 to-yellow-700 text-white px-6 py-2 rounded font-bold uppercase w-full hover:scale-105 transition"
                >
                    Access Dashboard
                </button>
            </div>
        </div>
    );
};
