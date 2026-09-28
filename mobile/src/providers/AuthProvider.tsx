import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { unregisterPushToken } from '@/lib/push';
import type { Me } from '@/types/models';

// Session + "my profile" (MOBILE-PLAN.md §5.4). `me` does profiles.select and
// private_profiles.select in parallel for the signed-in user, keyed by uid so
// it clears automatically on sign-out/sign-in. PushProvider (P4/P5) will read
// `user` here to register/unregister the Expo push token on sign-in/out.

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  /** undefined while `me` is still loading, null when signed out. */
  me: Me | null | undefined;
  loading: boolean;
  meLoading: boolean;
  refreshMe: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      queryClient.invalidateQueries({ queryKey: ['me'] });
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [queryClient]);

  const uid = session?.user?.id ?? null;

  const meQuery = useQuery({
    queryKey: ['me', uid],
    enabled: !!uid,
    queryFn: async (): Promise<Me> => {
      const [profileRes, privateRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', uid as string).single(),
        supabase.from('private_profiles').select('*').eq('id', uid as string).single(),
      ]);
      if (profileRes.error) throw profileRes.error;
      if (privateRes.error) throw privateRes.error;
      return { profile: profileRes.data, private: privateRes.data };
    },
  });

  const refreshMe = async () => {
    await queryClient.invalidateQueries({ queryKey: ['me', uid] });
  };

  const signOut = async () => {
    // MOBILE-PLAN.md §3: delete the push token row before signing out — RLS
    // needs the still-valid session to allow the delete.
    await unregisterPushToken(uid);
    await supabase.auth.signOut();
    queryClient.clear();
  };

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    me: uid ? meQuery.data : null,
    loading,
    meLoading: !!uid && meQuery.isLoading,
    refreshMe,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
