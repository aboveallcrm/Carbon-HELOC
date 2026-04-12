import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';

import { supabase } from '../lib/supabaseClient';

export type Tier = 'starter' | 'pro' | 'enterprise';

interface AuthContextType {
    session: Session | null;
    user: User | null;
    role: string | null;
    tier: Tier | null;
    realTier: Tier | null;
    loading: boolean;
    signOut: () => Promise<void>;
    setDemoTier: (t: Tier | null) => void;
}

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    role: null,
    tier: null,
    realTier: null,
    loading: true,
    signOut: async () => { },
    setDemoTier: () => { },
});

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);

// Check if we're in development mode with missing Supabase credentials
const isDevMode = () => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    return !url || !key || url === '' || key === '';
};

// Mock user for local development when Supabase is not configured
const MOCK_USER: User = {
    id: 'mock-user-id',
    email: 'demo@aboveall.com',
    user_metadata: { full_name: 'Demo Loan Officer' },
    app_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
} as User;

const MOCK_SESSION: Session = {
    user: MOCK_USER,
    access_token: 'mock-token',
    refresh_token: 'mock-refresh',
    expires_in: 3600,
    token_type: 'bearer',
} as Session;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [tier, setTier] = useState<Tier | null>(null);
    const [demoTier, setDemoTier] = useState<Tier | null>(null);
    const [loading, setLoading] = useState(true);
    const [devMode, setDevMode] = useState(false);

    useEffect(() => {
        // Check if we're in dev mode (missing Supabase credentials)
        if (isDevMode()) {
            console.warn('DEVELOPMENT MODE: Using mock authentication. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY for production.');
            setDevMode(true);
            setSession(MOCK_SESSION);
            setUser(MOCK_USER);
            setRole('admin');
            setTier('enterprise');
            setLoading(false);
            return;
        }

        // Production: Use real Supabase auth
        const initAuth = async () => {
            try {
                // Get initial session
                const { data: { session } } = await supabase.auth.getSession();
                setSession(session);
                setUser(session?.user ?? null);
                
                if (session?.user) {
                    await fetchUserRole(session.user.id);
                } else {
                    setLoading(false);
                }
            } catch (error) {
                console.error('Auth initialization error:', error);
                setLoading(false);
            }
        };

        initAuth();

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchUserRole(session.user.id);
            } else {
                setRole(null);
                setTier(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const fetchUserRole = async (userId: string) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('role, tier')
                .eq('id', userId)
                .single();

            if (error) {
                console.error('Error fetching role:', error);
                setRole('user');
                setTier('starter');
            } else {
                setRole(data?.role || 'user');
                setTier((data?.tier as Tier) || 'starter');
            }
        } catch (e) {
            console.error('Error fetching role:', e);
            setRole('user');
            setTier('starter');
        } finally {
            setLoading(false);
        }
    };

    const signOut = async () => {
        if (devMode) {
            // In dev mode, just reload the page
            window.location.reload();
        } else {
            await supabase.auth.signOut();
            setRole(null);
            setTier(null);
            setSession(null);
            setUser(null);
        }
    };

    const handleSetDemoTier = (t: Tier | null) => {
        setDemoTier(t);
    };

    // Use demo tier if set, otherwise real tier
    const effectiveTier = demoTier ?? tier;

    return (
        <AuthContext.Provider value={{
            session,
            user,
            role,
            tier: effectiveTier,
            realTier: tier,
            loading,
            signOut,
            setDemoTier: handleSetDemoTier,
        }}>
            {children}
        </AuthContext.Provider>
    );
};
