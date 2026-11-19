'use client';

/* eslint-disable @next/next/no-img-element -- a data: QR code and QPay's bank logos */

import { PAYMENT_LIMITS, type PaymentResponse } from '@bairmair/db';
import { createTranslator, formatMoney, type Locale } from '@bairmair/i18n';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { cancelPayment, fetchPayment, paymentErrorKey } from '@/lib/payments';

const secondary =
  'rounded-full border border-line-2 px-4 py-2 font-medium hover:bg-surface-2 disabled:opacity-50';

function clockTime(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/**
 * Pays one QPay invoice: QR code (computers, or another phone), the bank apps (phones), QPay's
 * own page, and the status. While pending it asks the server every few seconds (the server asks
 * QPay), only while the tab is visible. Controlled and product-neutral: the parent keeps the
 * payment and decides what happens once it is paid.
 */
export function QPayCheckout({
  locale,
  payment,
  onChange,
}: {
  locale: Locale;
  payment: PaymentResponse;
  onChange: (payment: PaymentResponse) => void;
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const { session } = useAuth();
  const token = session?.access_token ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = useEffectEvent((next: PaymentResponse) => onChange(next));

  useEffect(() => {
    if (payment.status !== 'pending' || !token) return;
    let stopped = false;
    const poll = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const next = await fetchPayment(token, payment.id, true);
        if (!stopped && next.status !== 'pending') changed(next);
      } catch {
        // Try again on the next tick.
      }
    };
    const timer = window.setInterval(() => void poll(), PAYMENT_LIMITS.pollSeconds * 1000);
    const onVisible = () => void poll();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [payment.id, payment.status, token]);

  const cancel = async () => {
    if (!token || !window.confirm(t('payments.cancelConfirm'))) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await cancelPayment(token, payment.id));
    } catch (cause) {
      setError(t(paymentErrorKey(cause)));
    } finally {
      setBusy(false);
    }
  };

  const amount = formatMoney(payment.amount, payment.currency);

  if (payment.status !== 'pending' || !payment.checkout) {
    const paid = payment.status === 'paid';
    return (
      <div
        role="status"
        className={`rounded-2xl p-5 text-center font-medium ${paid ? 'bg-success/10 text-success' : 'bg-surface-2 text-fg-muted'}`}
      >
        <p className="text-2xl">{amount}</p>
        <p>{paid ? t('payments.paid') : t(`payments.status.${payment.status}`)}</p>
      </div>
    );
  }

  const { checkout } = payment;
  return (
    <div className="space-y-5 rounded-2xl bg-surface p-5 shadow-sm">
      <div className="text-center">
        <p className="text-3xl font-semibold">{amount}</p>
        <p className="text-sm text-fg-muted">{payment.description}</p>
      </div>

      <figure className="flex flex-col items-center gap-2">
        <img
          src={`data:image/png;base64,${checkout.qrImage}`}
          alt={t('payments.scanQr')}
          width={240}
          height={240}
          className="rounded-xl bg-white p-2"
        />
        <figcaption className="text-sm text-fg-muted">{t('payments.scanQr')}</figcaption>
      </figure>

      {checkout.bankApps.length > 0 && (
        <div className="hidden space-y-2 pointer-coarse:block">
          <p className="text-sm font-medium">{t('payments.apps')}</p>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {checkout.bankApps.map((app) => (
              <li key={app.name}>
                <a
                  href={app.link}
                  className="flex flex-col items-center gap-1 rounded-xl p-2 text-center text-xs hover:bg-surface-2"
                >
                  {app.logo && (
                    <img
                      src={app.logo}
                      alt=""
                      width={48}
                      height={48}
                      loading="lazy"
                      className="size-12 rounded-xl"
                    />
                  )}
                  <span>{locale === 'mn' ? app.description : app.name}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <a href={checkout.shortUrl} target="_blank" rel="noopener noreferrer" className={secondary}>
          {t('payments.openQPay')}
        </a>
        <button type="button" onClick={() => void cancel()} disabled={busy} className={secondary}>
          {t('payments.cancel')}
        </button>
      </div>

      <p role="status" className="flex items-center justify-between gap-3 text-sm text-fg-muted">
        <span className="animate-pulse">{t('payments.waiting')}</span>
        <span>{t('payments.validUntil', { time: clockTime(payment.expiresAt) })}</span>
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
