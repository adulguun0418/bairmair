/**
 * Build-time configuration from apps/scan/.env (see .env.example). Metro inlines
 * `process.env.EXPO_PUBLIC_*` when it bundles, so each variable must be read by its full name.
 * Everything here ends up in the app bundle: never put a secret in an EXPO_PUBLIC_ variable.
 */

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${name} is not set. Copy apps/scan/.env.example to .env and restart Metro.`);
  }
  return value;
}

export const env = {
  supabaseUrl: required('EXPO_PUBLIC_SUPABASE_URL', process.env.EXPO_PUBLIC_SUPABASE_URL),
  supabasePublishableKey: required(
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ),
  /** The web app (Next.js), which hosts the API routes and the scan links. */
  apiUrl: required('EXPO_PUBLIC_API_URL', process.env.EXPO_PUBLIC_API_URL).replace(/\/+$/, ''),
  /** The public website, for links (`<siteUrl>/s/<slug>`). Defaults to the API URL. */
  siteUrl: (
    process.env.EXPO_PUBLIC_SITE_URL ||
    required('EXPO_PUBLIC_API_URL', process.env.EXPO_PUBLIC_API_URL)
  ).replace(/\/+$/, ''),
};
