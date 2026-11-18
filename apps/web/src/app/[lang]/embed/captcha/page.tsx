import type { Metadata, Viewport } from 'next';
import { CaptchaEmbed } from '@/components/embed/CaptchaEmbed';
import { getI18n } from '@/lib/i18n';
import { publicEnv } from '@/lib/public-env';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Cloudflare Turnstile on its own, for the mobile app: Turnstile runs only on pages of the
 * widget's hostnames, so the app's sign-in screens show this page in a WebView and take the
 * token from it (`@bairmair/browse` `captcha.ts`). Transparent, so it sits on the app's screen.
 */
export default async function CaptchaPage() {
  const { locale } = await getI18n();
  return (
    <>
      <style>{'html,body{background:transparent!important;margin:0}'}</style>
      <CaptchaEmbed siteKey={publicEnv.turnstileSiteKey} locale={locale} />
    </>
  );
}
