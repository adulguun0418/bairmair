import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { parseAuthRedirect } from './redirect';

/**
 * Sign-in and phone actions. Errors are supabase-js Auth errors; screens turn them into text
 * with `authErrorKey`. A user closing the Apple sheet or the browser is `'canceled'`, not an error.
 */

/** 'sign-in': phone sign-in or sign-up. 'add-phone': a signed-in user adds or changes a phone. */
export type PhoneMode = 'sign-in' | 'add-phone';

export type SignInResult = 'signed-in' | 'canceled';

/** Sends the 6-digit SMS code (through the send-sms hook). `phone` is E.164. */
export async function sendPhoneCode(phone: string, mode: PhoneMode): Promise<void> {
  const { error } =
    mode === 'sign-in'
      ? await supabase.auth.signInWithOtp({ phone })
      : await supabase.auth.updateUser({ phone });
  if (error) throw error;
}

export async function verifyPhoneCode(
  phone: string,
  token: string,
  mode: PhoneMode,
): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({
    phone,
    token,
    type: mode === 'sign-in' ? 'sms' : 'phone_change',
  });
  if (error) throw error;
}

/**
 * Native Sign in with Apple, then `signInWithIdToken`. Apple sends the name only on the first
 * authorization and never in the token, so it is saved right away (auth metadata, and the
 * profile name if the user has none yet).
 */
export async function signInWithApple(): Promise<SignInResult> {
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return 'canceled';
    throw error;
  }
  if (!credential.identityToken) throw new Error('Apple returned no identity token');

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });
  if (error) throw error;

  const given = credential.fullName?.givenName ?? undefined;
  const family = credential.fullName?.familyName ?? undefined;
  const fullName = [given, family].filter(Boolean).join(' ').trim();
  if (fullName) {
    // Best effort: a failure here must not undo a successful sign-in.
    await supabase.auth.updateUser({
      data: { full_name: fullName, given_name: given, family_name: family },
    });
    await supabase
      .from('profiles')
      .update({ display_name: fullName.slice(0, 80) })
      .eq('id', data.user.id)
      .is('display_name', null);
  }
  return 'signed-in';
}

/**
 * Google through Supabase's browser OAuth flow (no native module). The in-app browser session
 * ends at `bairmair://auth/callback`, whose fragment carries the tokens.
 */
export async function signInWithGoogle(): Promise<SignInResult> {
  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return 'canceled';

  const redirect = parseAuthRedirect(result.url);
  if (redirect.kind === 'error') {
    throw Object.assign(new Error(redirect.description || redirect.code), { code: redirect.code });
  }
  if (redirect.kind === 'none') throw new Error('The sign-in redirect carried no session');

  const { error: sessionError } = await supabase.auth.setSession({
    access_token: redirect.accessToken,
    refresh_token: redirect.refreshToken,
  });
  if (sessionError) throw sessionError;
  return 'signed-in';
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
