'use client';

import { createTranslator, type Locale } from '@bairmair/i18n';
import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useDismiss } from '@/components/header/use-dismiss';
import { CheckIcon, CopyIcon, FacebookIcon, LinkIcon, ShareIcon } from '@/components/icons';

const noop = () => () => {};

/** Whether the browser has a share sheet (phones, Safari). False on the server. */
function useCanShare(): boolean {
  return useSyncExternalStore(
    noop,
    () => typeof navigator.share === 'function',
    () => false,
  );
}

type Copied = 'link' | 'text' | null;

/**
 * "Share" button opening a menu: the system share sheet where there is one, the link, a
 * ready-made post to paste into Facebook groups, and Facebook's own share dialog (which shows
 * the floor-plan preview).
 */
export function ShareActions({
  post,
  url,
  locale,
  className = '',
}: {
  post: string;
  url: string;
  locale: Locale;
  className?: string;
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const canShare = useCanShare();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<Copied>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);

  const share = async () => {
    close();
    try {
      await navigator.share({ text: post });
    } catch {
      // Cancelled by the user, or refused; nothing to do.
    }
  };
  const copy = async (what: 'link' | 'text') => {
    try {
      await navigator.clipboard.writeText(what === 'link' ? url : post);
      setCopied(what);
      setTimeout(() => {
        setCopied(null);
        close();
      }, 1200);
    } catch {
      setCopied(null);
    }
  };

  const item =
    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg';
  const copyLabel = (what: 'link' | 'text') =>
    copied === what
      ? t('listingPage.share.copied')
      : what === 'link'
        ? t('listingPage.share.copyLink')
        : t('listingPage.share.copyText');

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-line-2 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-surface-2"
      >
        <ShareIcon className="size-4" />
        {t('listingPage.share.button')}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-60 rounded-xl border border-line bg-surface p-1 shadow-lg">
          <button
            type="button"
            onClick={() => void copy('link')}
            className={item}
            aria-live="polite"
          >
            {copied === 'link' ? (
              <CheckIcon className="size-4 text-success" />
            ) : (
              <LinkIcon className="size-4" />
            )}
            {copyLabel('link')}
          </button>
          <button
            type="button"
            onClick={() => void copy('text')}
            className={item}
            aria-live="polite"
          >
            {copied === 'text' ? (
              <CheckIcon className="size-4 text-success" />
            ) : (
              <CopyIcon className="size-4" />
            )}
            {copyLabel('text')}
          </button>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={close}
            className={item}
          >
            <FacebookIcon className="size-4 text-[#1877f2]" />
            {t('listingPage.share.facebook')}
          </a>
          {canShare && (
            <>
              <div className="my-1 border-t border-line" />
              <button type="button" onClick={() => void share()} className={item}>
                <ShareIcon className="size-4" />
                {t('listingPage.share.more')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
