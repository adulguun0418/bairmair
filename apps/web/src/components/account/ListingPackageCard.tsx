'use client';

import { formatProUntil } from '@bairmair/browse';
import {
  LISTING_PACKAGE_LIMIT,
  PAYMENT_PRODUCTS,
  type ListingPackageProductKey,
} from '@bairmair/db';
import { createTranslator, formatMoney, localePath, type Locale } from '@bairmair/i18n';
import Link from 'next/link';
import { useMemo } from 'react';
import { useListingPlan } from '@/components/listing-package/use-listing-plan';
import { usePackagePurchase } from '@/components/listing-package/use-package-purchase';
import { QPayCheckout } from '@/components/payments/QPayCheckout';

const card = 'space-y-4 rounded-2xl bg-surface p-5 shadow-sm ring-2 ring-brand';
const primary =
  'w-full rounded-full bg-primary px-4 py-2 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50';
const SOLD: ListingPackageProductKey[] = ['listing_pack_30d', 'listing_pack_90d'];
const secondary =
  'inline-block rounded-full border border-line-2 px-4 py-2 font-medium hover:bg-surface-2';

/**
 * "Pro болох" at the top of the account page: the listing plan (free n / 1, or the package's end
 * and n / 20, listings a package's end hid) and buying the 30- or 90-day package right here with
 * QPay. Shown only where the
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
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-primary">
          {until
            ? t('listingPackage.proActive', { date: formatProUntil(until, locale) })
            : t('listingPackage.pro')}
        </h2>
        <p className="text-sm text-fg-muted">
          {until
            ? t('listingPackage.currentLive', { live: plan.live, limit: plan.limit })
            : `${t('listingPackage.currentFree', { live: plan.live, limit: plan.limit })} · ${t(
                'listingPackage.proLead',
                { limit: LISTING_PACKAGE_LIMIT },
              )}`}
        </p>
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
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {SOLD.map((product) => (
              <div key={product} className="flex flex-col gap-3 rounded-xl bg-surface-2 p-4">
                <div>
                  <p className="flex items-center justify-between gap-2 font-semibold">
                    {t(`listingPackage.plans.${product}.name`)}
                    {product === 'listing_pack_90d' && (
                      <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand">
                        {t('listingPackage.plans.listing_pack_90d.note')}
                      </span>
                    )}
                  </p>
                  <p className="text-xl font-semibold">
                    {formatMoney(PAYMENT_PRODUCTS[product].amount, 'MNT')}
                  </p>
                  <p className="text-sm text-fg-muted">
                    {t(`listingPackage.plans.${product}.period`)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void buy(product)}
                  disabled={busy !== null}
                  className={`${primary} mt-auto`}
                >
                  {busy === product
                    ? t('payments.creating')
                    : until
                      ? t('listingPackage.extend')
                      : t('listingPackage.buy')}
                </button>
              </div>
            ))}
          </div>
          <Link href={localePath(locale, '/my-listings/package')} className={secondary}>
            {t('listingPackage.details')}
          </Link>
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
