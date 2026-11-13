'use client';

import type { Database, TypedSupabaseClient } from '@bairmair/db';
import { createClient } from '@supabase/supabase-js';
import { publicEnv } from './public-env';

let client: TypedSupabaseClient | null = null;

/**
 * Supabase in the browser with the visitor's session (kept in localStorage). Pages stay
 * server-rendered and cached for everyone; only the parts that depend on who is signed in
 * (header links, ♡, report, account, saved) use this client.
 */
export function browserClient(): TypedSupabaseClient {
  client ??= createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

/** A same-site path to return to after signing in, or null. Never another origin. */
export function safeNextPath(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return null;
  }
  return value;
}
