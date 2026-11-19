import { authErrorKey, isCaptchaRequired } from '@bairmair/browse';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useColorScheme } from 'react-native';
import { needsCaptcha, sendPhoneCode, type PhoneMode } from '@/auth/actions';
import { CAPTCHA_IN_BROWSER, captchaTokenFromBrowser } from '@/auth/captcha-browser';
import { CaptchaView, type CaptchaState } from '@/auth/captcha-view';
import { useI18n } from '@/i18n/i18n';

export interface SendCode {
  /** Texts a code to `phone` (E.164); `onSent` follows on success. */
  send(phone: string): Promise<void>;
  busy: boolean;
  /** Localized, or null. */
  error: string | null;
  /** Android, once Supabase asked for a captcha: the inline check. Null otherwise. */
  captcha: ReactElement | null;
}

/**
 * Sending a sign-in code, with captcha only when Supabase asks for it. The code is first sent
 * without a token: while captcha protection is off in Supabase (the normal case) nobody sees a
 * captcha. When it is on, Auth answers `captcha_failed`, and the app runs the check and sends
 * again with the token: on iOS through the system browser sheet, on Android inline (the check is
 * shown under the field and the code goes out as soon as it passes). Switching captcha on or off
 * in Supabase therefore needs no app update.
 *
 * Adding a phone (`add-phone`) is not under captcha protection.
 */
export function useSendCode(mode: PhoneMode, onSent: (phone: string) => void): SendCode {
  const { t, locale } = useI18n();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Android: Supabase asked for a captcha, so the inline check stays on screen. */
  const [inline, setInline] = useState(false);
  /** Remounts the inline check: a token is single use. */
  const [captchaKey, setCaptchaKey] = useState(0);
  /** The inline check's current token, if any. */
  const token = useRef<string | null>(null);
  /** A number waiting for the inline check to pass. */
  const waiting = useRef<string | null>(null);

  const onSentRef = useRef(onSent);
  useEffect(() => {
    onSentRef.current = onSent;
  });

  const fail = (cause: unknown) => setError(t(`auth.errors.${authErrorKey(cause)}`));

  const sendWith = async (phone: string, captchaToken: string | null) => {
    await sendPhoneCode(phone, mode, captchaToken);
    onSentRef.current(phone);
  };

  /** Takes the inline token (single use) and asks the check for a new one. */
  const takeToken = (): string | null => {
    const current = token.current;
    if (current) {
      token.current = null;
      setCaptchaKey((n) => n + 1);
    }
    return current;
  };

  const send = async (phone: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    let waitForCheck = false;
    try {
      const ready = takeToken();
      try {
        await sendWith(phone, ready);
      } catch (cause) {
        if (ready || !needsCaptcha(mode) || !isCaptchaRequired(cause)) throw cause;
        if (CAPTCHA_IN_BROWSER) {
          const browserToken = await captchaTokenFromBrowser(locale, scheme);
          // Null: the person closed the sheet; nothing sent, nothing to say.
          if (browserToken) await sendWith(phone, browserToken);
        } else {
          waiting.current = phone;
          waitForCheck = true;
          setInline(true);
        }
      }
    } catch (cause) {
      fail(cause);
    } finally {
      if (!waitForCheck) setBusy(false);
    }
  };

  const onCaptcha = (state: CaptchaState) => {
    if (state.status !== 'ready') {
      token.current = null;
      if (state.status === 'failed' && waiting.current) {
        waiting.current = null;
        setBusy(false);
        setError(t('auth.errors.captcha'));
      }
      return;
    }
    token.current = state.token;
    const phone = waiting.current;
    if (!phone) return;
    waiting.current = null;
    void sendWith(phone, takeToken())
      .catch(fail)
      .finally(() => setBusy(false));
  };

  return {
    send,
    busy,
    error,
    captcha: inline ? <CaptchaView key={captchaKey} onChange={onCaptcha} /> : null,
  };
}
