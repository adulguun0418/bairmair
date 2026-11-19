import { describe, expect, it, vi } from 'vitest';
import { alertMailerFromEnv, DEFAULT_ALERT_FROM, resendMailer } from './resend.ts';

function fakeFetch(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

const email = { subject: 's', text: 't', idempotencyKey: 'alert-1' };

describe('resendMailer', () => {
  it('posts the email with the key and an idempotency key', async () => {
    const fetchImpl = fakeFetch(200, { id: 'e1' });
    await resendMailer('re_x', 'me@example.com', DEFAULT_ALERT_FROM, fetchImpl).send(
      email,
      AbortSignal.timeout(1000),
    );
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer re_x');
    expect(headers['idempotency-key']).toBe('alert-1');
    expect(JSON.parse(init?.body as string)).toEqual({
      from: DEFAULT_ALERT_FROM,
      to: ['me@example.com'],
      subject: 's',
      text: 't',
    });
  });

  it('throws with the status on failure', async () => {
    const mailer = resendMailer('re_x', 'me@example.com', DEFAULT_ALERT_FROM, fakeFetch(403, {}));
    await expect(mailer.send(email, AbortSignal.timeout(1000))).rejects.toThrow('resend 403');
  });
});

describe('alertMailerFromEnv', () => {
  it('needs the key and the address; the sender is optional', async () => {
    const env: Record<string, string> = {
      RESEND_API_KEY: 're_x',
      SMS_ALERT_EMAIL: 'me@example.com',
    };
    expect(alertMailerFromEnv((n) => ({ ...env, RESEND_API_KEY: '' })[n] || undefined)).toBeNull();
    expect(alertMailerFromEnv((n) => ({ ...env, SMS_ALERT_EMAIL: '' })[n] || undefined)).toBeNull();

    const fetchImpl = fakeFetch(200, {});
    const custom = { ...env, SMS_ALERT_FROM: 'bairmair <alerts@example.mn>' };
    await alertMailerFromEnv((n) => custom[n as keyof typeof custom], fetchImpl)!.send(
      email,
      AbortSignal.timeout(1000),
    );
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]?.body as string).from).toBe(
      'bairmair <alerts@example.mn>',
    );
  });
});
