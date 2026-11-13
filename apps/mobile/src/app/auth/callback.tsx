import { Redirect } from 'expo-router';

/**
 * Target of the OAuth redirect `bairmair://auth/callback`. The in-app browser session reads the
 * tokens itself (`signInWithGoogle`); if the system also opens this link, just go to the account.
 */
export default function AuthCallback() {
  return <Redirect href="/account" />;
}
