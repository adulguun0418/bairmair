'use client';

import { createTranslator, DEFAULT_LOCALE, isLocale, localePath } from '@bairmair/i18n';
import { useParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { captureError } from '@/lib/analytics';

/** Which error boundary caught the error; sent with the report. */
export type ErrorBoundaryKind = 'site' | 'embed' | 'global';

/**
 * The page shown when rendering fails (`error.tsx`, `global-error.tsx`): reports the error to
 * PostHog (error boundaries keep it from PostHog's uncaught-error handler) and offers a retry.
 * The digest is Next.js' reference for the server-side error; it is in the server report too.
 */
export function ErrorView({
  error,
  reset,
  boundary,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  boundary: ErrorBoundaryKind;
}) {
  const params = useParams<{ lang?: string }>();
  const locale = isLocale(params?.lang) ? params.lang : DEFAULT_LOCALE;
  const t = useMemo(() => createTranslator(locale), [locale]);

  useEffect(() => {
    captureError(error, { boundary, digest: error.digest });
  }, [error, boundary]);

  return (
    <section className="mx-auto flex max-w-xl flex-col items-start gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold">{t('errorPage.title')}</h1>
      <p className="text-fg-muted">{t('errorPage.body')}</p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary"
        >
          {t('errorPage.retry')}
        </button>
        {boundary !== 'embed' && (
          // A full page load: after an error the client router may be in a bad state.
          <a
            href={localePath(locale, '/')}
            className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold"
          >
            {t('errorPage.home')}
          </a>
        )}
      </div>
      {error.digest && (
        <p className="text-xs text-fg-muted">{t('errorPage.reference', { code: error.digest })}</p>
      )}
    </section>
  );
}
