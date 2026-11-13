import type { Database, TypedSupabaseClient } from '@bairmair/db';
import { createClient } from '@supabase/supabase-js';
import { publicEnv } from './public-env';

let client: TypedSupabaseClient | null = null;

/**
 * Supabase with the publishable key and no session: role `anon`, so RLS shows only live
 * listings. Used by server components and by the browser (RPCs such as the phone reveal).
 *
 * Its own `storageKey`: in the browser it lives next to `browserClient()`, and two auth clients
 * on the default key warn "Multiple GoTrueClient instances". It never stores a session anyway.
 */
export function publicClient(): TypedSupabaseClient {
  client ??= createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: 'bairmair-anon',
    },
  });
  return client;
}
