'use client';

import {
  fetchListingPromotions,
  formatProUntil,
  NO_PROMOTION,
  type PromotionStatus,
} from '@bairmair/browse';
import {
  LISTING_PROMOTION_PLANS,
  LISTING_TIERS,
  PAYMENT_PRODUCTS,
  type ListingPromotionProductKey,
  type ListingTier,
  type PaymentResponse,
} from '@bairmair/db';
import { createTranslator, formatMoney, type Locale } from '@bairmair/i18n';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { QPayCheckout } from '@/components/payments/QPayCheckout';
import { createPayment, paymentErrorKey, PaymentRequestError } from '@/lib/payments';
import { browserClient } from '@/lib/supabase-browser';

const PRODUCTS_BY_TIER: Record<ListingTier, ListingPromotionProductKey[]> = {
  gold: ['listing_gold_7d', 'listing_gold_14d'],
  silver: ['listing_silver_7d', 'listing_silver_14d'],
};

const primary =
  'rounded-full bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50';
const secondary =
  'rounded-full border border-line-2 px-4 py-2 font-medium hover:bg-surface-2 disabled:opacity-50';

const TIER_CARD: Record<ListingTier, string> = {
  gold: 'ring-2 ring-[#d9a21b] bg-[linear-gradient(180deg,rgba(245,200,76,0.16),transparent_60%)]',
  silver:
    'ring-2 ring-[#9aa5b5] bg-[linear-gradient(180deg,rgba(154,165,181,0.18),transparent_60%)]',
};

/**
 * Gold / Silver for one listing, paid with QPay (website only: the app shows the badges but sells
 * nothing, App Store 3.1.1). Shows what is bought and until when, and the four products. The
 * server checks that the listing is published and the seller's before making the invoice, and
 * adds the period once paid; the section then reloads.
 */
export function PromotionSection({
  listingId,
  published,
  locale,
}: {
  listingId: string;
  published: boolean;
  locale: Locale;
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const [status, setStatus] = useState<PromotionStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [payment, setPayment] = useState<PaymentResponse | null>(null);
  const [busy, setBusy] = useState<ListingPromotionProductKey | null>(null);
  const [errorKey, setErrorKey] = useState<ReturnType<typeof paymentErrorKey> | null>(null);
  const [notYet, setNotYet] = useState(false);

  const reload = useCallback(async () => {
    try {
      const all = await fetchListingPromotions(browserClient(), [listingId]);
      setStatus(all.get(listingId) ?? NO_PROMOTION);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [listingId]);

  useEffect(() => {
    let active = true;
    fetchListingPromotions(browserClient(), [listingId])
      .then((all) => {
        if (!active) return;
        setStatus(all.get(listingId) ?? NO_PROMOTION);
        setFailed(false);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [listingId]);

  const buy = async (product: ListingPromotionProductKey) => {
    if (!token) return;
    setBusy(product);
    setErrorKey(null);
    try {
      setPayment(await createPayment(token, { product, subjectId: listingId }));
    } catch (cause) {
      if (cause instanceof PaymentRequestError && cause.key === 'payment_forbidden') {
        setNotYet(true);
      } else {
        setErrorKey(paymentErrorKey(cause));
      }
    } finally {
      setBusy(null);
    }
  };

  const onPaymentChange = (next: PaymentResponse) => {
    setPayment(next);
    if (next.status === 'paid') void reload();
  };

  return (
    <div className="space-y-4" aria-live="polite">
      <p className="text-sm text-fg-muted">{t('promotion.lead')}</p>

      {failed ? (
        <p role="alert" className="text-sm text-danger">
          {t('promotion.loadFailed')}
        </p>
      ) : status ? (
        <CurrentPromotion status={status} locale={locale} />
      ) : (
        <div className="h-6 animate-pulse rounded-lg bg-surface-3" />
      )}

      {!published ? (
        <p className="rounded-2xl bg-surface-2 p-4 text-sm">{t('promotion.publishFirst')}</p>
      ) : payment ? (
        <div className="space-y-3">
          <QPayCheckout locale={locale} payment={payment} onChange={onPaymentChange} />
          {payment.status === 'paid' && (
            <p role="status" className="text-center font-medium text-success">
              {t('promotion.activated')}
            </p>
          )}
          {payment.status !== 'pending' && (
            <button type="button" onClick={() => setPayment(null)} className={secondary}>
              {t('promotion.choose')}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {LISTING_TIERS.map((tier) => (
              <div key={tier} className={`space-y-3 rounded-2xl p-4 ${TIER_CARD[tier]}`}>
                <div>
                  <p className="flex items-center gap-1.5 font-semibold">
                    <span aria-hidden>★</span>
                    {t(`promotion.tiers.${tier}`)}
                  </p>
                  <p className="text-sm text-fg-muted">{t(`promotion.tierLead.${tier}`)}</p>
                </div>
                <ul className="space-y-2">
                  {PRODUCTS_BY_TIER[tier].map((product) => (
                    <li key={product} className="flex items-center justify-between gap-3">
                      <span>
                        <span className="block font-medium">
                          {t('promotion.days', { days: LISTING_PROMOTION_PLANS[product].days })}
                        </span>
                        <span className="text-sm text-fg-muted">
                          {formatMoney(PAYMENT_PRODUCTS[product].amount, 'MNT')}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void buy(product)}
                        disabled={busy !== null || !token}
                        className={primary}
                      >
                        {busy === product
                          ? t('payments.creating')
                          : (tier === 'gold' ? status?.goldUntil : status?.silverUntil)
                            ? t('promotion.extend')
                            : t('promotion.buy')}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <ul className="space-y-1 text-sm text-fg-muted">
            <li>{t('promotion.stacking')}</li>
            <li>{t('promotion.clockRuns')}</li>
            <li>{t('promotion.noRenewal')}</li>
          </ul>
        </>
      )}

      {errorKey && (
        <p role="alert" className="text-sm text-danger">
          {t(errorKey)}
        </p>
      )}
      {notYet && (
        <p role="alert" className="rounded-2xl bg-surface-2 p-4 text-sm">
          {t('promotion.notYet')}
        </p>
      )}
    </div>
  );
}

function CurrentPromotion({ status, locale }: { status: PromotionStatus; locale: Locale }) {
  const t = createTranslator(locale);
  if (!status.goldUntil && !status.silverUntil) {
    return <p className="font-medium">{t('promotion.none')}</p>;
  }
  return (
    <div className="space-y-1">
      {status.goldUntil && (
        <p className="font-semibold text-[#a8780c] dark:text-[#f2c94c]">
          ★ {t('promotion.now.gold', { date: formatProUntil(status.goldUntil, locale) })}
        </p>
      )}
      {status.silverUntil && (
        <p className="font-semibold text-fg-2">
          ★{' '}
          {t(status.goldUntil ? 'promotion.laterSilver' : 'promotion.now.silver', {
            date: formatProUntil(status.silverUntil, locale),
          })}
        </p>
      )}
      {status.tier === null && <p className="text-sm text-fg-muted">{t('promotion.queued')}</p>}
    </div>
  );
}
