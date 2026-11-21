'use client';

import { formatProUntil } from '@bairmair/browse';
import {
  LISTING_FREE_LIMIT,
  LISTING_PACKAGE_LIMIT,
  PAYMENT_PRODUCTS,
  type ListingPackageProductKey,
  type PaymentResponse,
} from '@bairmair/db';
import { createTranslator, formatMoney, localePath, type Locale } from '@bairmair/i18n';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { signInHref } from '@/components/auth/sign-in-href';
import { QPayCheckout } from '@/components/payments/QPayCheckout';
import { createPayment, paymentErrorKey, PaymentRequestError } from '@/lib/payments';
import { useListingPlan } from './use-listing-plan';

const primary =
  'w-full rounded-full bg-primary px-5 py-2.5 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50';
const secondary =
  'rounded-full border border-line-2 px-4 py-2 font-medium hover:bg-surface-2 disabled:opacity-50';
const card = 'space-y-3 rounded-2xl bg-surface p-5 shadow-sm';

/** `?test=1` adds the 1-day, 100₮ product (testers only), for a cheap real-money check. */
function useShowTest(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => new URLSearchParams(window.location.search).get('test') === '1',
    () => false,
  );
}

/**
 * The listing package on the website, paid with QPay: the seller's plan, what the package gives,
 * and the checkout. A paid period is added by the server (from now, or from the end of the
 * current package) and listings hidden by a package's end are republished; the page then shows
 * the new end date and counts.
 */
export function ListingPackageView({ locale }: { locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const router = useRouter();
  const { session, ready } = useAuth();
  const userId = session?.user.id ?? null;
  const showTest = useShowTest();
  const { plan, failed, reload } = useListingPlan(userId);
  const [payment, setPayment] = useState<PaymentResponse | null>(null);
  const [busy, setBusy] = useState<ListingPackageProductKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notYet, setNotYet] = useState(false);

  useEffect(() => {
    if (ready && !userId) {
      router.replace(signInHref(locale, localePath(locale, '/my-listings/package')));
    }
  }, [ready, userId, locale, router]);

  if (!ready || !session || !userId) {
    return <div className="h-64 animate-pulse rounded-2xl bg-surface-3" />;
  }

  const until = plan?.packageUntil ?? null;
  const products: ListingPackageProductKey[] = showTest
    ? ['listing_pack_30d', 'listing_pack_test']
    : ['listing_pack_30d'];

  const buy = async (product: ListingPackageProductKey) => {
    setBusy(product);
    setError(null);
    try {
      setPayment(await createPayment(session.access_token, { product }));
    } catch (cause) {
      if (cause instanceof PaymentRequestError && cause.key === 'payment_forbidden') {
        setNotYet(true);
      } else {
        setError(t(paymentErrorKey(cause)));
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
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">{t('listingPackage.title')}</h1>
        <p className="text-fg-muted">{t('listingPackage.lead')}</p>
      </header>

      <section className={card} aria-live="polite">
        <h2 className="text-sm font-semibold text-fg-muted">{t('listingPackage.current')}</h2>
        {plan ? (
          <>
            {until ? (
              <p>
                <span className="text-lg font-semibold text-primary">
                  {t('listingPackage.currentPackage', { date: formatProUntil(until, locale) })}
                </span>
                <span className="block text-sm text-fg-muted">
                  {t('listingPackage.currentLive', { live: plan.live, limit: plan.limit })}
                </span>
              </p>
            ) : (
              <p className="text-lg font-semibold">
                {t('listingPackage.currentFree', { live: plan.live, limit: plan.limit })}
              </p>
            )}
            {plan.paused > 0 && (
              <p className="text-sm text-warning">
                {t('listingPackage.paused', { count: plan.paused })}
              </p>
            )}
            {!plan.enforced && (
              <p className="text-sm text-fg-muted">{t('listingPackage.notEnforced')}</p>
            )}
          </>
        ) : failed ? (
          <p role="alert" className="text-sm text-danger">
            {t('listingPackage.loadFailed')}
          </p>
        ) : (
          <div className="h-7 animate-pulse rounded-lg bg-surface-3" />
        )}
      </section>

      <section>
        <ul className="space-y-2">
          {(['listings', 'free', 'restore'] as const).map((key) => (
            <li key={key} className="flex gap-3">
              <span aria-hidden className="text-brand">
                ✓
              </span>
              <span>
                {t(`listingPackage.benefits.${key}`, {
                  limit: LISTING_PACKAGE_LIMIT,
                  free: LISTING_FREE_LIMIT,
                })}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {payment ? (
        <section className="space-y-3">
          <QPayCheckout locale={locale} payment={payment} onChange={onPaymentChange} />
          {payment.status === 'paid' && until && (
            <p role="status" className="text-center font-medium text-success">
              {t('listingPackage.activated', { date: formatProUntil(until, locale) })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {payment.status !== 'pending' && (
              <button type="button" onClick={() => setPayment(null)} className={secondary}>
                {t('listingPackage.choose')}
              </button>
            )}
            {payment.status === 'paid' && (
              <Link href={localePath(locale, '/my-listings')} className={secondary}>
                {t('listingPackage.backToListings')}
              </Link>
            )}
          </div>
        </section>
      ) : (
        <section className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            {products.map((product) => (
              <div
                key={product}
                className={`flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-sm ${
                  product === 'listing_pack_30d' ? 'ring-2 ring-brand' : ''
                }`}
              >
                <div className="space-y-1">
                  <p className="font-semibold">{t(`listingPackage.plans.${product}.name`)}</p>
                  <p className="text-2xl font-semibold">
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
          {until && <p className="text-sm text-fg-muted">{t('listingPackage.extendNote')}</p>}
          <p className="text-sm text-fg-muted">{t('listingPackage.noRenewal')}</p>
        </section>
      )}

      {notYet && (
        <p role="alert" className="rounded-2xl bg-surface-2 p-4 text-sm">
          {t('listingPackage.notYet')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
