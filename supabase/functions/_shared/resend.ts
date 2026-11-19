/**
 * Alert emails to the project owner through Resend (send-sms's SMS spike alert, the alerts
 * function's reveal spike alert). No Deno APIs here, so Vitest can run it.
 */

export interface Mailer {
  send(
    email: { subject: string; text: string; idempotencyKey: string },
    signal: AbortSignal,
  ): Promise<void>;
}

export const DEFAULT_ALERT_FROM = 'bairmair <onboarding@resend.dev>';

/**
 * Resend's email API. Without a verified domain, Resend sends only from `onboarding@resend.dev`
 * and only to the address the Resend account was made with, which is enough for an alert to
 * the owner.
 */
export function resendMailer(
  apiKey: string,
  to: string,
  from: string,
  fetchImpl: typeof fetch = fetch,
): Mailer {
  return {
    async send({ subject, text, idempotencyKey }, signal) {
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({ from, to: [to], subject, text }),
        signal,
      });
      if (!response.ok) {
        // Resend's error body is `{ name, message }`; it never echoes the key.
        const body = await response.text().catch(() => '');
        throw new Error(`resend ${response.status} ${body.slice(0, 200)}`);
      }
    },
  };
}

/**
 * The owner's alert mailer from the function's environment: `RESEND_API_KEY` and
 * `SMS_ALERT_EMAIL` (the address every alert goes to, SMS or not), `SMS_ALERT_FROM` optional.
 * Null without the key or the address.
 */
export function alertMailerFromEnv(
  env: (name: string) => string | undefined,
  fetchImpl: typeof fetch = fetch,
): Mailer | null {
  const apiKey = env('RESEND_API_KEY');
  const to = env('SMS_ALERT_EMAIL');
  if (!apiKey || !to) return null;
  return resendMailer(apiKey, to, env('SMS_ALERT_FROM') || DEFAULT_ALERT_FROM, fetchImpl);
}
