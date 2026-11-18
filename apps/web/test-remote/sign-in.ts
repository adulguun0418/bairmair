import type { Database } from '@bairmair/db';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Password sign-in for test users, ending with the session on `client` (a publishable-key client
 * such as the website's). Password sign-in is under Auth's captcha protection, which skips
 * requests made with the secret key, so a throwaway secret-key client signs in. Same shape as
 * supabase-js's `signInWithPassword` result.
 */
export async function signInForTest(
  client: SupabaseClient<Database>,
  credentials: { phone: string; password: string },
): Promise<{ data: { session: Session }; error: null }> {
  const auth = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ).auth;
  const { data, error } = await auth.signInWithPassword(credentials);
  if (error) throw error;
  const set = await client.auth.setSession(data.session);
  if (set.error) throw set.error;
  return { data: { session: data.session }, error: null };
}
