'use client';

import { dbErrorKey } from '@bairmair/db';
import { createTranslator, type Locale } from '@bairmair/i18n';
import { useMemo, useState } from 'react';
import { MessageIcon, PhoneIcon } from '@/components/icons';
import { publicClient } from '@/lib/supabase-public';

type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'shown'; phone: string }
  | { kind: 'error'; message: 'rateLimited' | 'unavailable' | 'notAvailable' | 'failed' };

/** `+97699112233` → `+976 9911 2233`; other numbers as they are. */
export function formatPhone(e164: string): string {
  const match = /^\+976(\d{4})(\d{4})$/.exec(e164);
  return match ? `+976 ${match[1]} ${match[2]}` : e164;
}

/**
 * Tap to reveal the seller's number (rate-limited by `reveal_listing_contact`), then call or SMS.
 * The number is never in the page HTML, so it cannot be scraped from it.
 */
export function ContactButtons({ listingId, locale }: { listingId: string; locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [state, setState] = useState<State>({ kind: 'idle' });

  const reveal = async () => {
    setState({ kind: 'loading' });
    const { data, error } = await publicClient().rpc('reveal_listing_contact', {
      p_listing_id: listingId,
    });
    if (!error && data) {
      setState({ kind: 'shown', phone: data });
      return;
    }
    const key = dbErrorKey(error);
    setState({
      kind: 'error',
      message:
        key === 'rate_limited'
          ? 'rateLimited'
          : key === 'contact_unavailable'
            ? 'unavailable'
            : key === 'listing_not_available'
              ? 'notAvailable'
              : 'failed',
    });
  };

  const primary =
    'flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60';
  const secondary =
    'flex flex-1 items-center justify-center gap-2 rounded-xl border border-line-2 px-4 py-3 font-medium transition-colors hover:bg-surface-2';

  const call =
    'flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-medium text-on-primary transition-colors hover:bg-primary-hover';

  if (state.kind === 'shown') {
    return (
      <div className="space-y-3">
        <a
          href={`tel:${state.phone}`}
          className="block rounded-xl bg-surface-2 px-4 py-3 text-center text-xl font-semibold tracking-wide tabular-nums transition-colors hover:bg-surface-3"
        >
          {formatPhone(state.phone)}
        </a>
        <div className="flex gap-2">
          <a href={`tel:${state.phone}`} className={call}>
            <PhoneIcon className="size-4" />
            {t('listingPage.contact.call')}
          </a>
          <a href={`sms:${state.phone}`} className={secondary}>
            <MessageIcon className="size-4" />
            {t('listingPage.contact.sms')}
          </a>
        </div>
        <p className="text-center text-xs text-fg-subtle">{t('listingPage.contact.mention')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void reveal()}
        disabled={state.kind === 'loading'}
        aria-busy={state.kind === 'loading'}
        className={primary}
      >
        <PhoneIcon className="size-[18px]" />
        {state.kind === 'loading'
          ? t('listingPage.contact.loading')
          : t('listingPage.contact.show')}
      </button>
      {state.kind === 'error' && (
        <p role="alert" className="text-center text-sm text-danger">
          {t(`listingPage.contact.errors.${state.message}`)}
        </p>
      )}
    </div>
  );
}
