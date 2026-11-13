import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';

/** Which sign-in methods are switched on in the Supabase project (Auth settings). */
export interface AuthProviders {
  apple: boolean;
  google: boolean;
}

interface AuthValue {
  session: Session | null;
  /** False until the stored session has been read at startup. */
  ready: boolean;
  providers: AuthProviders;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Reads `/auth/v1/settings`, a public endpoint that lists enabled providers, so the app shows
 * only the buttons that will work (Google stays hidden until its OAuth client is configured).
 */
async function fetchProviders(): Promise<AuthProviders> {
  try {
    const response = await fetch(`${env.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: env.supabasePublishableKey },
    });
    if (!response.ok) return { apple: false, google: false };
    const settings = (await response.json()) as { external?: Record<string, unknown> };
    return {
      apple: settings.external?.apple === true,
      google: settings.external?.google === true,
    };
  } catch {
    return { apple: false, google: false };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [providers, setProviders] = useState<AuthProviders>({ apple: false, google: false });

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    void fetchProviders().then((value) => active && setProviders(value));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, ready, providers }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
