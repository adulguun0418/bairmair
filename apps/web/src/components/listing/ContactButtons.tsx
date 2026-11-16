'use client';

import { dbErrorKey } from '@bairmair/db';
import { createTranslator, type Locale } from '@bairmair/i18n';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { CheckIcon, CopyIcon, MessageIcon, PhoneIcon } from '@/components/icons';
import { track } from '@/lib/analytics';
import { browserClient } from '@/lib/supabase-browser';

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
 * Numbers revealed in this tab: kept in memory and in sessionStorage (so a reload shows them
 * again without another request), and shared by every contact button of the listing (the card
 * and the phone's bottom bar show the number together).
 */
const cacheKey = (listingId: string) => `bairmair-phone:${listingId}`;
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function readCached(listingId: string): string | null {
  const known = memory.get(listingId);
  if (known) return known;
  try {
    return sessionStorage.getItem(cacheKey(listingId));
  } catch {
    return null;
  }
}

function writeCached(listingId: string, phone: string): void {
  memory.set(listingId, phone);
  try {
    sessionStorage.setItem(cacheKey(listingId), phone);
  } catch {
    // Storage blocked: the number is still shown, just not remembered after a reload.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Tap to reveal the seller's number (rate-limited by `reveal_listing_contact`). The button turns
 * into the number in place (tap to call), with SMS and copy beside it: same height, no jump.
 * The number is never in the page HTML, so it cannot be scraped from it.
 *
 * Sent with the visitor's session when signed in (their own hourly budget instead of the shared
 * per-IP one). A repeat reveal of the same listing within the hour is free on the server.
 *
 * `bar`: the slimmer version in the phone's bottom bar (no copy button).
 */
export function ContactButtons({
  listingId,
  locale,
  variant = 'card',
}: {
  listingId: string;
  locale: Locale;
  variant?: 'card' | 'bar';
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [revealed, setState] = useState<State>({ kind: 'idle' });
  const [copied, setCopied] = useState(false);
  const bar = variant === 'bar';
  const placement = { listing_id: listingId, placement: variant };
  // Not on the server (no storage there): the button renders first, the number right after.
  const cached = useSyncExternalStore(
    subscribe,
    () => readCached(listingId),
    () => null,
  );
  const state: State =
    revealed.kind === 'idle' && cached ? { kind: 'shown', phone: cached } : revealed;

  const reveal = async () => {
    setState({ kind: 'loading' });
    const { data, error } = await browserClient().rpc('reveal_listing_contact', {
      p_listing_id: listingId,
    });
    if (!error && data) {
      track('phone_revealed', placement);
      writeCached(listingId, data);
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

  // Both states are one row of the same height, so revealing the number moves nothing.
  const row = `flex items-center gap-2 ${bar ? 'h-11' : 'h-13'}`;
  const primary =
    'flex h-full flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-medium text-on-primary transition-colors hover:bg-primary-hover disabled:opacity-60';
  const square =
    'flex aspect-square h-full shrink-0 items-center justify-center rounded-xl border border-line-2 text-fg-2 transition-colors hover:bg-surface-2 hover:text-fg';

  if (state.kind === 'shown') {
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(state.phone);
        track('phone_copied', { listing_id: listingId });
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } catch {
        setCopied(false);
      }
    };
    return (
      <div className={row}>
        <a
          href={`tel:${state.phone}`}
          onClick={() => track('contact_call', placement)}
          title={`${t('listingPage.contact.call')} · ${t('listingPage.contact.mention')}`}
          className={`${primary} whitespace-nowrap px-3 font-semibold tabular-nums sm:text-[17px]`}
        >
          <PhoneIcon className="size-[18px] shrink-0" />
          {formatPhone(state.phone)}
          <span className="sr-only">
            {t('listingPage.contact.call')}. {t('listingPage.contact.mention')}
          </span>
        </a>
        <a
          href={`sms:${state.phone}`}
          onClick={() => track('contact_sms', placement)}
          aria-label={t('listingPage.contact.sms')}
          title={t('listingPage.contact.sms')}
          className={square}
        >
          <MessageIcon className="size-5" />
        </a>
        {!bar && (
          <button
            type="button"
            onClick={() => void copy()}
            aria-label={copied ? t('listingPage.share.copied') : t('listingPage.contact.copy')}
            title={copied ? t('listingPage.share.copied') : t('listingPage.contact.copy')}
            aria-live="polite"
            className={square}
          >
            {copied ? (
              <CheckIcon className="size-5 text-success" />
            ) : (
              <CopyIcon className="size-5" />
            )}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={bar ? 'relative' : 'space-y-2'}>
      <div className={row}>
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
            : bar
              ? t('listingPage.contact.call')
              : t('listingPage.contact.show')}
        </button>
      </div>
      {state.kind === 'error' && (
        <p
          role="alert"
          className={
            bar
              ? 'absolute bottom-full right-0 mb-2 w-64 rounded-xl bg-surface p-2 text-center text-xs text-danger shadow-lg ring-1 ring-line'
              : 'text-center text-sm text-danger'
          }
        >
          {t(`listingPage.contact.errors.${state.message}`)}
        </p>
      )}
    </div>
  );
}
