/**
 * Reads the URL Supabase Auth redirects to after a browser OAuth sign-in. With the default
 * (implicit) flow the tokens are in the fragment; errors can be in the query or the fragment.
 * See https://supabase.com/docs/guides/auth/native-mobile-deep-linking
 */
export type AuthRedirect =
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'error'; code: string; description: string }
  | { kind: 'none' };

function params(part: string): URLSearchParams {
  return new URLSearchParams(part.replace(/^[?#]/, ''));
}

export function parseAuthRedirect(url: string): AuthRedirect {
  const hashAt = url.indexOf('#');
  const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const queryAt = beforeHash.indexOf('?');
  const query = params(queryAt === -1 ? '' : beforeHash.slice(queryAt));
  const fragment = params(hashAt === -1 ? '' : url.slice(hashAt));

  const read = (name: string) => fragment.get(name) ?? query.get(name);

  const error = read('error_code') ?? read('error');
  if (error) return { kind: 'error', code: error, description: read('error_description') ?? '' };

  const accessToken = read('access_token');
  const refreshToken = read('refresh_token');
  if (accessToken && refreshToken) return { kind: 'tokens', accessToken, refreshToken };
  return { kind: 'none' };
}
