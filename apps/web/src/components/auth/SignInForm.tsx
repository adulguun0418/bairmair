'use client';

import { authErrorKey, formatMongolianPhone, type AuthErrorKey } from '@bairmair/browse';
import { createTranslator, localePath, type Locale } from '@bairmair/i18n';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { browserClient, safeNextPath } from '@/lib/supabase-browser';
import { useAuth } from './AuthProvider';
import { Turnstile } from './Turnstile';

/** Auth's minimum time between two codes to one number (`max_frequency`). */
const RESEND_SECONDS = 60;

type Step = { kind: 'phone' } | { kind: 'code'; phone: string; sentAt: number };
type Message = { key: 'invalidPhone' } | { key: AuthErrorKey } | null;

/**
 * Website sign-in with a Mongolian phone number: number + Turnstile → our `/api/auth/otp` texts
 * a code → the browser checks the code with Supabase and keeps the session. New numbers get an
 * account, as in the app. Afterwards it returns to `?next=` (same site only).
 */
export function SignInForm({ locale, siteKey }: { locale: Locale; siteKey: string }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get('next')) ?? localePath(locale, '/account');
  const { session, ready } = useAuth();

  const [step, setStep] = useState<Step>({ kind: 'phone' });
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  const [now, setNow] = useState(() => Date.now());

  // Already signed in (or just signed in): go on.
  useEffect(() => {
    if (ready && session) router.replace(next);
  }, [ready, session, next, router]);

  // Ticks the resend countdown.
  useEffect(() => {
    if (step.kind !== 'code') return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [step.kind]);

  const sendCode = async (number: string) => {
    if (!token) {
      setMessage({ key: 'captcha' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/auth/otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: number, captchaToken: token }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        sent?: boolean;
        phone?: string;
        error?: string;
      };
      if (response.ok && body.sent && body.phone) {
        setStep({ kind: 'code', phone: body.phone, sentAt: Date.now() });
        setNow(Date.now());
        setCode('');
      } else if (body.error === 'invalid_phone') {
        setMessage({ key: 'invalidPhone' });
      } else {
        setMessage({ key: authErrorKey({ code: body.error }) });
      }
    } catch {
      setMessage({ key: 'network' });
    } finally {
      setBusy(false);
      // Tokens are single use.
      setResetKey((n) => n + 1);
    }
  };

  const verify = async () => {
    if (step.kind !== 'code') return;
    setBusy(true);
    setMessage(null);
    const { error } = await browserClient().auth.verifyOtp({
      phone: step.phone,
      token: code.trim(),
      type: 'sms',
    });
    setBusy(false);
    if (error) setMessage({ key: authErrorKey(error) });
    // On success the session listener redirects.
  };

  const errorText =
    message &&
    (message.key === 'invalidPhone' ? t('auth.invalidPhone') : t(`auth.errors.${message.key}`));
  const input =
    'w-full rounded-xl border border-stone-300 px-4 py-3 text-lg outline-none focus:border-stone-900';
  const primary =
    'w-full rounded-full bg-stone-900 px-5 py-3 font-medium text-white hover:bg-stone-700 disabled:opacity-50';

  if (step.kind === 'code') {
    const wait = Math.max(0, RESEND_SECONDS - Math.floor((now - step.sentAt) / 1000));
    return (
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void verify();
        }}
      >
        <h1 className="text-2xl font-semibold">{t('auth.codeTitle')}</h1>
        <p className="text-stone-600">
          {t('auth.codeSent', { phone: formatMongolianPhone(step.phone) })}
        </p>
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t('auth.codeLabel')}</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            className={`${input} tracking-[0.4em]`}
          />
        </label>
        {errorText && (
          <p role="alert" className="text-sm text-red-700">
            {errorText}
          </p>
        )}
        <button type="submit" disabled={busy || code.length !== 6} className={primary}>
          {t('auth.verify')}
        </button>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button
            type="button"
            onClick={() => {
              setStep({ kind: 'phone' });
              setMessage(null);
            }}
            className="underline"
          >
            {t('auth.changeNumber')}
          </button>
          {wait > 0 ? (
            <span className="text-stone-500">{t('auth.resendIn', { seconds: wait })}</span>
          ) : (
            <button
              type="button"
              disabled={busy || !token}
              onClick={() => void sendCode(step.phone)}
              className="underline disabled:opacity-50"
            >
              {t('auth.resend')}
            </button>
          )}
        </div>
        {/* A fresh token for "send again". */}
        <Turnstile siteKey={siteKey} language={locale} resetKey={resetKey} onToken={setToken} />
      </form>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        void sendCode(phone);
      }}
    >
      <h1 className="text-2xl font-semibold">{t('auth.title')}</h1>
      <p className="text-stone-600">{t('auth.intro')}</p>
      <label className="block space-y-1">
        <span className="text-sm font-medium">{t('auth.phoneLabel')}</span>
        <div className="flex items-center gap-2">
          <span className="text-lg text-stone-500">+976</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder={t('auth.phonePlaceholder')}
            inputMode="tel"
            autoComplete="tel-national"
            autoFocus
            className={input}
          />
        </div>
      </label>
      <Turnstile siteKey={siteKey} language={locale} resetKey={resetKey} onToken={setToken} />
      {errorText && (
        <p role="alert" className="text-sm text-red-700">
          {errorText}
        </p>
      )}
      <button type="submit" disabled={busy || phone.trim() === '' || !token} className={primary}>
        {t('auth.sendCode')}
      </button>
    </form>
  );
}
