'use client';

import {
  fetchAppleSubscription,
  fetchScanPlan,
  formatProUntil,
  type AppleProSubscription,
  type ScanPlan,
} from '@bairmair/browse';
import {
  PAYMENT_PRODUCTS,
  SCAN_PRO_PLANS,
  USER_SCAN_FREE_LIMIT,
  USER_SCAN_PRO_LIMIT,
  type PaymentResponse,
  type ScanProProductKey,
} from '@bairmair/db';
import { createTranslator, formatMoney, localePath, type Locale } from '@bairmair/i18n';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { signInHref } from '@/components/auth/sign-in-href';
import { QPayCheckout } from '@/components/payments/QPayCheckout';
import { createPayment, paymentErrorKey, PaymentRequestError } from '@/lib/payments';
import { browserClient } from '@/lib/supabase-browser';

const primary =
  'w-full rounded-full bg-primary px-5 py-2.5 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50';
const secondary =
  'rounded-full border border-line-2 px-4 py-2 font-medium hover:bg-surface-2 disabled:opacity-50';
const card = 'space-y-3 rounded-2xl bg-surface p-5 shadow-sm';

const SOLD: ScanProProductKey[] = ['scan_pro_30d', 'scan_pro_365d'];

/** `?test=1` adds the 1-day, 100₮ product (testers only), for a cheap real-money check. */
function useShowTest(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => new URLSearchParams(window.location.search).get('test') === '1',
    () => false,
  );
}

/**
 * bairmair scan Pro on the website, paid with QPay: the visitor's plan, what Pro gives, the
 * prepaid periods, and the checkout. A paid period is added by the server (from now, or from the
 * end of the current Pro); the page then shows the new end date. The app picks it up through the
 * same account.
 */
export function ScanProView({ locale }: { locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const router = useRouter();
  const { session, ready } = useAuth();
  const userId = session?.user.id ?? null;
  const showTest = useShowTest();
  const [plan, setPlan] = useState<ScanPlan | null>(null);
  const [planFailed, setPlanFailed] = useState(false);
  const [apple, setApple] = useState<AppleProSubscription | null>(null);
  const [payment, setPayment] = useState<PaymentResponse | null>(null);
  const [busy, setBusy] = useState<ScanProProductKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notYet, setNotYet] = useState(false);

  useEffect(() => {
    if (ready && !userId) {
      router.replace(signInHref(locale, localePath(locale, '/scan-pro')));
    }
  }, [ready, userId, locale, router]);

  const loadPlan = useCallback(async () => {
    try {
      setPlan(await fetchScanPlan(browserClient()));
      setPlanFailed(false);
    } catch {
      setPlanFailed(true);
    }
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchScanPlan(browserClient())
      .then((next) => active && setPlan(next))
      .catch(() => active && setPlanFailed(true));
    fetchAppleSubscription(browserClient())
      .then((next) => active && setApple(next))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId]);

  if (!ready || !session || !userId) {
    return <div className="h-64 animate-pulse rounded-2xl bg-surface-3" />;
  }

  const pro = plan?.proUntil ?? null;
  const products: ScanProProductKey[] = showTest ? [...SOLD, 'scan_pro_test'] : SOLD;

  const buy = async (product: ScanProProductKey) => {
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
    if (next.status === 'paid') void loadPlan();
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">{t('scanPro.title')}</h1>
        <p className="text-fg-muted">{t('scanPro.lead')}</p>
      </header>

      <section className={card} aria-live="polite">
        <h2 className="text-sm font-semibold text-fg-muted">{t('scanPro.current')}</h2>
        {plan ? (
          pro ? (
            <p>
              <span className="text-lg font-semibold text-primary">
                {t('scanPro.currentPro', { date: formatProUntil(pro, locale) })}
              </span>
              <span className="block text-sm text-fg-muted">
                {t('scanPro.currentKept', { kept: plan.kept })}
              </span>
            </p>
          ) : (
            <p className="text-lg font-semibold">
              {t('scanPro.currentFree', { kept: plan.kept, limit: plan.limit })}
            </p>
          )
        ) : planFailed ? (
          <p role="alert" className="text-sm text-danger">
            {t('scanPro.loadFailed')}
          </p>
        ) : (
          <div className="h-7 animate-pulse rounded-lg bg-surface-3" />
        )}
      </section>

      <section className="space-y-2">
        <ul className="space-y-2">
          {(['scans', 'links', 'keep', 'app'] as const).map((key) => (
            <li key={key} className="flex gap-3">
              <span aria-hidden className="text-brand">
                ✓
              </span>
              <span>{t(`scanPro.benefits.${key}`, { free: USER_SCAN_FREE_LIMIT })}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-fg-muted">
          {t('scanPro.fairUse', { limit: USER_SCAN_PRO_LIMIT })}
        </p>
      </section>

      {payment ? (
        <section className="space-y-3">
          <QPayCheckout locale={locale} payment={payment} onChange={onPaymentChange} />
          {payment.status === 'paid' && pro && (
            <p role="status" className="text-center font-medium text-success">
              {t('scanPro.activated', { date: formatProUntil(pro, locale) })}
            </p>
          )}
          {payment.status !== 'pending' && (
            <button type="button" onClick={() => setPayment(null)} className={secondary}>
              {t('scanPro.choose')}
            </button>
          )}
        </section>
      ) : (
        <section className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-2">
            {products.map((product) => (
              <PlanCard
                key={product}
                product={product}
                locale={locale}
                action={pro ? t('scanPro.extend') : t('scanPro.buy')}
                busy={busy === product}
                disabled={busy !== null}
                onBuy={() => void buy(product)}
              />
            ))}
          </div>
          {apple && apple.autoRenew !== false && (
            <p role="note" className="rounded-2xl bg-surface-2 p-4 text-sm">
              {t('scanPro.appleNote')}
            </p>
          )}
          {pro && <p className="text-sm text-fg-muted">{t('scanPro.extendNote')}</p>}
          <p className="text-sm text-fg-muted">{t('scanPro.noRenewal')}</p>
        </section>
      )}

      {notYet && (
        <p role="alert" className="rounded-2xl bg-surface-2 p-4 text-sm">
          {t('scanPro.notYet')}
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

function PlanCard({
  product,
  locale,
  action,
  busy,
  disabled,
  onBuy,
}: {
  product: ScanProProductKey;
  locale: Locale;
  action: string;
  busy: boolean;
  disabled: boolean;
  onBuy: () => void;
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const { period } = SCAN_PRO_PLANS[product];
  const highlighted = period === 'year';
  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl bg-surface p-5 shadow-sm ${highlighted ? 'ring-2 ring-brand' : ''}`}
    >
      <div className="space-y-1">
        <p className="flex items-center justify-between gap-2 font-semibold">
          {t(`scanPro.plans.${product}.name`)}
          {product === 'scan_pro_365d' && (
            <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand">
              {t('scanPro.plans.scan_pro_365d.note')}
            </span>
          )}
        </p>
        <p className="text-2xl font-semibold">
          {formatMoney(PAYMENT_PRODUCTS[product].amount, 'MNT')}
        </p>
        <p className="text-sm text-fg-muted">{t(`scanPro.plans.${product}.period`)}</p>
      </div>
      <button type="button" onClick={onBuy} disabled={disabled} className={`${primary} mt-auto`}>
        {busy ? t('payments.creating') : action}
      </button>
    </div>
  );
}
