/**
 * Settings that are safe in the browser. Next.js inlines `NEXT_PUBLIC_*` at build time, so each
 * variable is read by its literal name.
 */

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is not set. Copy apps/web/.env.example to .env.local.`);
  return value;
}

export const publicEnv = {
  get supabaseUrl(): string {
    return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabasePublishableKey(): string {
    return required(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    );
  },
  /** Cloudflare Turnstile site key for the sign-in form (public by design). */
  get turnstileSiteKey(): string {
    return required('NEXT_PUBLIC_TURNSTILE_SITE_KEY', process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  },
  /** Origin of shared links and Open Graph URLs, without a trailing slash. */
  get siteUrl(): string {
    return (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
  },
};
