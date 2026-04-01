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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [tier, setTier] = useState<Tier | null>(null);
    const [demoTier, setDemoTier] = useState<Tier | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchUserRole(session.user.id);
            } else {
                setLoading(false);
            }
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchUserRole(session.user.id);
            } else {
                setRole(null);
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
        await supabase.auth.signOut();
        setRole(null);
        setTier(null);
        setLoading(false);
    };

    return (
        <AuthContext.Provider value={{ session, user, role, tier: demoTier || tier, realTier: tier, loading, signOut, setDemoTier }}>
            {children}
        </AuthContext.Provider>
    );
};
