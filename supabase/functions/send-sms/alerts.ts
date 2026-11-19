/**
 * An email when sign-in codes spike (migration `20261122100000_sms_alerts.sql`). After each code
 * the hook records, it asks the database whether an alert is due; if so, it emails the owner
 * through Resend, so captcha can be switched on. No Deno APIs here, so Vitest can run it.
 */

import { alertMailerFromEnv, type Mailer } from '../_shared/resend.ts';
import { serviceCredentials } from '../_shared/service.ts';

export interface SmsSpike {
  codesLastHour: number;
  numbersLastHour: number;
  codesLastDay: number;
}

export interface SmsAlertStore {
  /** An alert that is due (already recorded), or null. */
  claim(threshold: number, signal: AbortSignal): Promise<({ id: number } & SmsSpike) | null>;
  /** Forgets an alert whose email failed, so the next code tries again. */
  release(id: number, signal: AbortSignal): Promise<void>;
}

/** Codes per hour that trigger an alert. Supabase's project cap is 30 per hour. */
export const DEFAULT_ALERT_PER_HOUR = 15;
/** Hours between two alerts (`claim_sms_alert`'s default). */
export const ALERT_QUIET_HOURS = 3;

export function alertEmail(spike: SmsSpike, threshold: number): { subject: string; text: string } {
  return {
    subject: `bairmair: ${spike.codesLastHour} sign-in codes in the last hour`,
    text: [
      `${spike.codesLastHour} sign-in codes were texted in the last hour, to ${spike.numbersLastHour} numbers ` +
        `(alert threshold: ${threshold} per hour). ${spike.codesLastDay} in the last 24 hours.`,
      '',
      'If that is not real people signing in, a bot is using up SMS (80₮ each). Supabase stops at 30 codes an hour ' +
        'for the whole project, and then nobody can get a code until the hour has passed.',
      '',
      'Switch captcha on:',
      '1. Fastest: Supabase dashboard → Authentication → Attack Protection → Enable Captcha protection ' +
        '(Turnstile; if it asks for the secret, it is TURNSTILE_SECRET_KEY in supabase/.env).',
      '2. Then in the repo: supabase/config.toml, [auth.captcha] enabled = true, and `pnpm auth:push --yes`, ' +
        'so a later push does not switch it off again.',
      'The apps need no update: they show the check when Supabase asks for it.',
      '',
      `The next alert comes at the earliest in ${ALERT_QUIET_HOURS} hours.`,
    ].join('\n'),
  };
}

/**
 * Checks for a spike and emails it. Never throws: the code has already gone out, and an alert
 * problem must not affect sign-in. Logs what happened.
 */
export async function checkSmsSpike(deps: {
  store: SmsAlertStore;
  mailer: Mailer;
  threshold: number;
  timeoutMs?: number;
  log?: (event: string, fields?: Record<string, unknown>) => void;
}): Promise<void> {
  const log = deps.log ?? (() => {});
  const timeoutMs = deps.timeoutMs ?? 10_000;
  let alert: Awaited<ReturnType<SmsAlertStore['claim']>>;
  try {
    alert = await deps.store.claim(deps.threshold, AbortSignal.timeout(timeoutMs));
  } catch (error) {
    log('sms_alert_check_failed', { reason: reason(error) });
    return;
  }
  if (!alert) return;
  const { id, ...spike } = alert;
  try {
    await deps.mailer.send(
      { ...alertEmail(spike, deps.threshold), idempotencyKey: `sms-alert-${id}` },
      AbortSignal.timeout(timeoutMs),
    );
    log('sms_alert_sent', { ...spike });
  } catch (error) {
    log('sms_alert_failed', { reason: reason(error), ...spike });
    try {
      await deps.store.release(id, AbortSignal.timeout(timeoutMs));
    } catch (releaseError) {
      log('sms_alert_release_failed', { reason: reason(releaseError) });
    }
  }
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** `claim_sms_alert` / `release_sms_alert` through PostgREST with the project's secret key. */
export function supabaseAlertStore(
  supabaseUrl: string,
  secretKey: string,
  fetchImpl: typeof fetch = fetch,
): SmsAlertStore {
  const base = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc`;
  const call = (name: string, args: unknown, signal: AbortSignal) =>
    fetchImpl(`${base}/${name}`, {
      method: 'POST',
      headers: { apikey: secretKey, 'content-type': 'application/json' },
      body: JSON.stringify(args),
      signal,
    });
  return {
    async claim(threshold, signal) {
      const response = await call('claim_sms_alert', { p_threshold: threshold }, signal);
      if (!response.ok) throw new Error(`claim_sms_alert ${response.status}`);
      const rows: unknown = await response.json();
      if (!Array.isArray(rows)) throw new Error('claim_sms_alert: unexpected response');
      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) return null;
      const numbers = [
        row.alert_id,
        row.codes_last_hour,
        row.numbers_last_hour,
        row.codes_last_day,
      ];
      if (!numbers.every((n) => typeof n === 'number')) {
        throw new Error('claim_sms_alert: unexpected row');
      }
      return {
        id: row.alert_id as number,
        codesLastHour: row.codes_last_hour as number,
        numbersLastHour: row.numbers_last_hour as number,
        codesLastDay: row.codes_last_day as number,
      };
    },
    async release(id, signal) {
      const response = await call('release_sms_alert', { p_alert_id: id }, signal);
      if (!response.ok) throw new Error(`release_sms_alert ${response.status}`);
    },
  };
}

/**
 * The spike check from the Edge Function's environment: `RESEND_API_KEY` and `SMS_ALERT_EMAIL`
 * (both required), `SMS_ALERT_PER_HOUR` (optional, default 15), `SMS_ALERT_FROM` (optional), and
 * the project's own URL and secret key. Null when something required is missing.
 */
export function smsSpikeCheckFromEnv(
  env: (name: string) => string | undefined,
  log?: (event: string, fields?: Record<string, unknown>) => void,
  fetchImpl: typeof fetch = fetch,
): (() => Promise<void>) | null {
  const credentials = serviceCredentials(env);
  const mailer = alertMailerFromEnv(env, fetchImpl);
  if (!credentials || !mailer) return null;
  const threshold = parseThreshold(env('SMS_ALERT_PER_HOUR'));
  const store = supabaseAlertStore(credentials.url, credentials.key, fetchImpl);
  return () => checkSmsSpike({ store, mailer, threshold, log });
}

export function parseThreshold(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : DEFAULT_ALERT_PER_HOUR;
}
