'use client';

import { formatProUntil } from '@bairmair/browse';
import { LISTING_PACKAGE_LIMIT, PAYMENT_PRODUCTS } from '@bairmair/db';
import { createTranslator, formatMoney, localePath, type Locale } from '@bairmair/i18n';
import Link from 'next/link';
import { useMemo } from 'react';
import { useListingPlan } from '@/components/listing-package/use-listing-plan';
import { usePackagePurchase } from '@/components/listing-package/use-package-purchase';
import { QPayCheckout } from '@/components/payments/QPayCheckout';

const card = 'space-y-3 rounded-2xl bg-surface p-5 shadow-sm';
const primary =
  'rounded-full bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50';
const secondary =
  'inline-block rounded-full border border-line-2 px-4 py-2 font-medium hover:bg-surface-2';

/**
 * The account's listing package: the plan (free n / 1, or the package's end and n / 20, listings
 * a package's end hid) and buying the 30-day package right here with QPay. Shown only where the
 * listing limit applies, or to someone with a package or paused listings, so nobody is offered a
 * package while the limit is off for them.
 */
export function ListingPackageCard({
  userId,
  accessToken,
  locale,
}: {
  userId: string;
  accessToken: string;
  locale: Locale;
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const { plan, reload } = useListingPlan(userId);
  const { payment, busy, errorKey, notYet, buy, onPaymentChange, reset } = usePackagePurchase(
    accessToken,
    () => void reload(),
  );

  if (!plan || (!plan.enforced && !plan.packageUntil && plan.paused === 0)) return null;
  const until = plan.packageUntil;

  return (
    <section className={card} aria-live="polite">
      <h2 className="font-semibold">{t('listingPackage.title')}</h2>
      <div>
        <p className="font-medium">
          {until
            ? t('listingPackage.currentPackage', { date: formatProUntil(until, locale) })
            : t('listingPackage.currentFree', { live: plan.live, limit: plan.limit })}
        </p>
        {until && (
          <p className="text-sm text-fg-muted">
            {t('listingPackage.currentLive', { live: plan.live, limit: plan.limit })}
          </p>
        )}
        {plan.paused > 0 && (
          <p className="text-sm text-warning">
            {t('listingPackage.paused', { count: plan.paused })}
          </p>
        )}
      </div>

      {payment ? (
        <div className="space-y-3">
          <QPayCheckout locale={locale} payment={payment} onChange={onPaymentChange} />
          {payment.status === 'paid' && until && (
            <p role="status" className="text-center font-medium text-success">
              {t('listingPackage.activated', { date: formatProUntil(until, locale) })}
            </p>
          )}
          {payment.status !== 'pending' && (
            <button type="button" onClick={reset} className={secondary}>
              {t('listingPackage.choose')}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-fg-muted">
            {t('listingPackage.benefits.listings', { limit: LISTING_PACKAGE_LIMIT })} ·{' '}
            {formatMoney(PAYMENT_PRODUCTS.listing_pack_30d.amount, 'MNT')}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void buy('listing_pack_30d')}
              disabled={busy !== null}
              className={primary}
            >
              {busy
                ? t('payments.creating')
                : `${until ? t('listingPackage.extend') : t('listingPackage.buy')} ${formatMoney(
                    PAYMENT_PRODUCTS.listing_pack_30d.amount,
                    'MNT',
                  )}`}
            </button>
            <Link href={localePath(locale, '/my-listings/package')} className={secondary}>
              {t('listingPackage.details')}
            </Link>
          </div>
          {until && <p className="text-sm text-fg-muted">{t('listingPackage.extendNote')}</p>}
        </div>
      )}

      {notYet && (
        <p role="alert" className="rounded-2xl bg-surface-2 p-4 text-sm">
          {t('listingPackage.notYet')}
        </p>
      )}
      {errorKey && (
        <p role="alert" className="text-sm text-danger">
          {t(errorKey)}
        </p>
      )}
    </section>
  );
}
