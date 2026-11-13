import { ACCOUNT_PATH } from '@bairmair/db';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { forgetListingsOf } from '@/listings/listings';

/**
 * Deletes the signed-in user's account for good (`DELETE /api/account` on the web server, which
 * removes their files, listings and the Auth user), then clears their listings from this phone
 * and signs out here. The server's session is already gone with the user, so the sign-out is
 * local only.
 *
 * Throws if the server did not confirm; the account then still exists (or is partly cleaned up,
 * and a retry finishes it).
 */
export async function deleteAccount(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data.session;
  if (!session) throw new Error('not signed in');

  const response = await fetch(`${env.apiUrl}${ACCOUNT_PATH}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!response.ok) throw new Error(`account deletion failed: HTTP ${response.status}`);

  await forgetListingsOf(session.user.id);
  await supabase.auth.signOut({ scope: 'local' });
}
