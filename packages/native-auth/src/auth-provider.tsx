import type { CaptchaReturnTarget } from '@bairmair/browse';
import type { TypedSupabaseClient } from '@bairmair/db';
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** What an app gives the shared sign-in: its client, its public addresses, its own return link. */
export interface AuthConfig {
  /** The app's one Supabase client (session in AsyncStorage). */
  client: TypedSupabaseClient;
  supabaseUrl: string;
  supabasePublishableKey: string;
  /** The website (captcha page, terms, privacy), without a trailing slash. */
  siteUrl: string;
  /** Which app the captcha page returns to on iOS: `app` (bairmair) or `scan` (bairmair scan). */
  captchaReturn: CaptchaReturnTarget;
  /** Reports a problem worth knowing about (a captcha that never finished), if the app tracks
   * errors. */
  reportError?: (error: Error, context: Record<string, string>) => void;
}

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
  config: AuthConfig;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Reads `/auth/v1/settings`, a public endpoint that lists enabled providers, so the app shows
 * only the buttons that will work (Google stays hidden until its OAuth client is configured).
 */
async function fetchProviders(config: AuthConfig): Promise<AuthProviders> {
  try {
    const response = await fetch(`${config.supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: config.supabasePublishableKey },
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

/** The signed-in session for the whole app. `config` must not change while mounted. */
export function AuthProvider({ config, children }: { config: AuthConfig; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [providers, setProviders] = useState<AuthProviders>({ apple: false, google: false });

  useEffect(() => {
    let active = true;
    void config.client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setReady(true);
    });
    void fetchProviders(config).then((value) => active && setProviders(value));
    const { data } = config.client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [config]);

  return (
    <AuthContext.Provider value={{ session, ready, providers, config }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
