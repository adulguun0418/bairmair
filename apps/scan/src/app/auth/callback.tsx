import { Redirect } from 'expo-router';

/**
 * Target of the OAuth redirect `bairmairscan://auth/callback`. The in-app browser session reads
 * the tokens itself (`signInWithGoogle`); if the system also opens this link, go home.
 */
export default function AuthCallback() {
  return <Redirect href="/" />;
}
