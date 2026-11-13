import { describe, expect, it } from 'vitest';
import { parseAuthRedirect } from '../src/auth/redirect';

describe('parseAuthRedirect', () => {
  it('reads tokens from the fragment', () => {
    expect(
      parseAuthRedirect(
        'bairmair://auth/callback#access_token=a.b.c&expires_in=3600&refresh_token=r1&token_type=bearer',
      ),
    ).toEqual({ kind: 'tokens', accessToken: 'a.b.c', refreshToken: 'r1' });
  });

  it('reads errors from the query or the fragment', () => {
    expect(
      parseAuthRedirect(
        'bairmair://auth/callback?error=access_denied&error_code=provider_disabled&error_description=Unsupported+provider',
      ),
    ).toEqual({
      kind: 'error',
      code: 'provider_disabled',
      description: 'Unsupported provider',
    });
    expect(parseAuthRedirect('bairmair://auth/callback#error=server_error')).toEqual({
      kind: 'error',
      code: 'server_error',
      description: '',
    });
  });

  it('returns none when the URL carries neither', () => {
    expect(parseAuthRedirect('bairmair://auth/callback')).toEqual({ kind: 'none' });
    expect(parseAuthRedirect('bairmair://auth/callback#access_token=only')).toEqual({
      kind: 'none',
    });
  });
});
