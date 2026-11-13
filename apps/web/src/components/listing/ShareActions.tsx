'use client';

import { createTranslator, type Locale } from '@bairmair/i18n';
import { useMemo, useState, useSyncExternalStore } from 'react';

const noop = () => () => {};

/** Whether the browser has a share sheet (phones, Safari). False on the server. */
function useCanShare(): boolean {
  return useSyncExternalStore(
    noop,
    () => typeof navigator.share === 'function',
    () => false,
  );
}

/**
 * One-tap sharing: the system share sheet where there is one, a ready-made post to paste into
 * Facebook groups, and Facebook's own share dialog (which shows the floor-plan preview).
 */
export function ShareActions({ post, url, locale }: { post: string; url: string; locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const canShare = useCanShare();
  const [copied, setCopied] = useState(false);

  const share = async () => {
    try {
      await navigator.share({ text: post });
    } catch {
      // Cancelled by the user, or refused; nothing to do.
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(post);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const button =
    'flex flex-1 items-center justify-center rounded-full border border-stone-300 px-3 py-2 text-sm font-medium hover:bg-stone-50';
  return (
    <div className="flex flex-wrap gap-2">
      {canShare && (
        <button type="button" onClick={() => void share()} className={button}>
          {t('listingPage.share.button')}
        </button>
      )}
      <button type="button" onClick={() => void copy()} className={button} aria-live="polite">
        {copied ? t('listingPage.share.copied') : t('listingPage.share.copyText')}
      </button>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={button}
      >
        {t('listingPage.share.facebook')}
      </a>
    </div>
  );
}
