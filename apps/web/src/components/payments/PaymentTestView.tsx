'use client';

import { PAYMENT_PRODUCTS, type PaymentResponse, type PaymentStatus } from '@bairmair/db';
import { createTranslator, formatDate, formatMoney, localePath, type Locale } from '@bairmair/i18n';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { signInHref } from '@/components/auth/sign-in-href';
import { createPayment, fetchPayment, paymentErrorKey, PaymentRequestError } from '@/lib/payments';
import { browserClient } from '@/lib/supabase-browser';
import { QPayCheckout } from './QPayCheckout';

const primary =
  'rounded-full bg-primary px-5 py-2.5 font-medium text-on-primary hover:bg-primary-hover disabled:opacity-50';
const card = 'space-y-3 rounded-2xl bg-surface p-5 shadow-sm';

interface HistoryRow {
  id: string;
  amount: number;
  status: PaymentStatus;
  created_at: string;
}

/**
 * A real-money check of the QPay flow on production: pay the `test` product (100₮), watch it go
 * from pending to paid, see recent payments. The server allows only the ids in `PAYMENT_TESTERS`;
 * everyone else gets "testers only" with their id to add.
 */
export function PaymentTestView({ locale }: { locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const router = useRouter();
  const { session, ready } = useAuth();
  const userId = session?.user.id ?? null;
  const [payment, setPayment] = useState<PaymentResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [history, setHistory] = useState<HistoryRow[] | null>(null);

  useEffect(() => {
    if (ready && !userId) {
      router.replace(signInHref(locale, localePath(locale, '/payments/test')));
    }
  }, [ready, userId, locale, router]);

  // Bumped to load the history again (after creating or finishing a payment).
  const [historyVersion, setHistoryVersion] = useState(0);
  const reloadHistory = () => setHistoryVersion((version) => version + 1);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void browserClient()
      .from('payments')
      .select('id, amount, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (active) setHistory(data ?? []);
      });
    return () => {
      active = false;
    };
  }, [userId, historyVersion]);

  if (!ready || !session || !userId) {
    return <div className="h-64 animate-pulse rounded-2xl bg-surface-3" />;
  }

  const amount = formatMoney(PAYMENT_PRODUCTS.test.amount, 'MNT');

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setPayment(await createPayment(session.access_token, { product: 'test' }));
      reloadHistory();
    } catch (cause) {
      if (cause instanceof PaymentRequestError && cause.key === 'payment_forbidden') {
        setForbidden(true);
      } else {
        setError(t(paymentErrorKey(cause)));
      }
    } finally {
      setBusy(false);
    }
  };

  const show = async (id: string) => {
    setError(null);
    try {
      setPayment(await fetchPayment(session.access_token, id, true));
    } catch (cause) {
      setError(t(paymentErrorKey(cause)));
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{t('payments.testTitle')}</h1>
        <p className="text-fg-muted">{t('payments.testLead', { amount })}</p>
      </header>

      {forbidden ? (
        <section role="alert" className={card}>
          <p className="font-medium">{t('payments.notTester')}</p>
          <p className="text-sm break-all text-fg-muted">{t('payments.yourId', { id: userId })}</p>
        </section>
      ) : payment ? (
        <section className="space-y-3">
          <QPayCheckout
            locale={locale}
            payment={payment}
            onChange={(next) => {
              setPayment(next);
              reloadHistory();
            }}
          />
          {payment.status !== 'pending' && (
            <button type="button" onClick={() => setPayment(null)} className={primary}>
              {t('payments.again')}
            </button>
          )}
        </section>
      ) : (
        <button type="button" onClick={() => void start()} disabled={busy} className={primary}>
          {busy ? t('payments.creating') : t('payments.create', { amount })}
        </button>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <section className={card}>
        <h2 className="font-semibold">{t('payments.history')}</h2>
        {history === null ? (
          <div className="h-16 animate-pulse rounded-xl bg-surface-3" />
        ) : history.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('payments.noHistory')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {history.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>{formatDate(row.created_at, locale)}</span>
                <span>{formatMoney(Number(row.amount), 'MNT')}</span>
                <span className={row.status === 'paid' ? 'text-success' : 'text-fg-muted'}>
                  {t(`payments.status.${row.status}`)}
                </span>
                <button
                  type="button"
                  onClick={() => void show(row.id)}
                  className="text-primary underline"
                >
                  {t('payments.show')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
