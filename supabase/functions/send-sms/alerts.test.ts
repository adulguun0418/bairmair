import { describe, expect, it, vi } from 'vitest';
import {
  alertEmail,
  checkSmsSpike,
  DEFAULT_ALERT_FROM,
  DEFAULT_ALERT_PER_HOUR,
  parseThreshold,
  resendMailer,
  smsSpikeCheckFromEnv,
  supabaseAlertStore,
  type Mailer,
  type SmsAlertStore,
} from './alerts.ts';

const URL_ = 'https://ref.supabase.co';
const spike = { codesLastHour: 18, numbersLastHour: 17, codesLastDay: 42 };

function fakeFetch(...responses: [number, unknown][]) {
  const queue = [...responses];
  return vi.fn<typeof fetch>(async () => {
    const [status, body] = queue.shift() ?? [200, null];
    return new Response(JSON.stringify(body), { status });
  });
}

function fakeStore(due: boolean, opts: { claimFails?: boolean } = {}) {
  const released: number[] = [];
  const claims: number[] = [];
  const store: SmsAlertStore = {
    async claim(threshold) {
      claims.push(threshold);
      if (opts.claimFails) throw new Error('db down');
      return due ? { id: 7, ...spike } : null;
    },
    async release(id) {
      released.push(id);
    },
  };
  return { store, released, claims };
}

function fakeMailer(fails = false) {
  const sent: Parameters<Mailer['send']>[0][] = [];
  const mailer: Mailer = {
    async send(email) {
      if (fails) throw new Error('resend 500');
      sent.push(email);
    },
  };
  return { mailer, sent };
}

describe('checkSmsSpike', () => {
  it('emails a due alert once, keyed by its id', async () => {
    const { store, released, claims } = fakeStore(true);
    const { mailer, sent } = fakeMailer();
    const logs: string[] = [];
    await checkSmsSpike({ store, mailer, threshold: 15, log: (e) => logs.push(e) });
    expect(claims).toEqual([15]);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.idempotencyKey).toBe('sms-alert-7');
    expect(sent[0]?.subject).toBe(alertEmail(spike, 15).subject);
    expect(released).toEqual([]);
    expect(logs).toEqual(['sms_alert_sent']);
  });

  it('sends nothing when no alert is due', async () => {
    const { store } = fakeStore(false);
    const { mailer, sent } = fakeMailer();
    await checkSmsSpike({ store, mailer, threshold: 15 });
    expect(sent).toEqual([]);
  });

  it('releases the alert when the email fails, so the next code tries again', async () => {
    const { store, released } = fakeStore(true);
    const { mailer } = fakeMailer(true);
    const logs: string[] = [];
    await checkSmsSpike({ store, mailer, threshold: 15, log: (e) => logs.push(e) });
    expect(released).toEqual([7]);
    expect(logs).toEqual(['sms_alert_failed']);
  });

  it('never throws when the database check fails', async () => {
    const { store } = fakeStore(true, { claimFails: true });
    const { mailer, sent } = fakeMailer();
    const logs: string[] = [];
    await expect(
      checkSmsSpike({ store, mailer, threshold: 15, log: (e) => logs.push(e) }),
    ).resolves.toBeUndefined();
    expect(sent).toEqual([]);
    expect(logs).toEqual(['sms_alert_check_failed']);
  });
});

describe('alertEmail', () => {
  it('states the numbers and how to switch captcha on', () => {
    const { subject, text } = alertEmail(spike, 15);
    expect(subject).toBe('bairmair: 18 sign-in codes in the last hour');
    expect(text).toContain('to 17 numbers');
    expect(text).toContain('42 in the last 24 hours');
    expect(text).toContain('Attack Protection');
    expect(text).toContain('pnpm auth:push --yes');
  });
});

describe('supabaseAlertStore', () => {
  it('claims with the secret key and reads the row', async () => {
    const fetchImpl = fakeFetch([
      200,
      [{ alert_id: 3, codes_last_hour: 18, numbers_last_hour: 17, codes_last_day: 42 }],
    ]);
    const alert = await supabaseAlertStore(`${URL_}/`, 'sb_secret_x', fetchImpl).claim(
      15,
      AbortSignal.timeout(1000),
    );
    expect(alert).toEqual({ id: 3, ...spike });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${URL_}/rest/v1/rpc/claim_sms_alert`);
    expect((init?.headers as Record<string, string>).apikey).toBe('sb_secret_x');
    expect(JSON.parse(init?.body as string)).toEqual({ p_threshold: 15 });
  });

  it('returns null for no row and throws on errors', async () => {
    const signal = AbortSignal.timeout(1000);
    expect(await supabaseAlertStore(URL_, 'k', fakeFetch([200, []])).claim(15, signal)).toBeNull();
    await expect(
      supabaseAlertStore(URL_, 'k', fakeFetch([401, {}])).claim(15, signal),
    ).rejects.toThrow('claim_sms_alert 401');
    await expect(
      supabaseAlertStore(URL_, 'k', fakeFetch([200, [{ alert_id: 'x' }]])).claim(15, signal),
    ).rejects.toThrow('unexpected row');
  });

  it('releases by id', async () => {
    const fetchImpl = fakeFetch([200, null]);
    await supabaseAlertStore(URL_, 'k', fetchImpl).release(3, AbortSignal.timeout(1000));
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${URL_}/rest/v1/rpc/release_sms_alert`);
    expect(JSON.parse(init?.body as string)).toEqual({ p_alert_id: 3 });
  });
});

describe('resendMailer', () => {
  it('posts the email with the key and an idempotency key', async () => {
    const fetchImpl = fakeFetch([200, { id: 'e1' }]);
    await resendMailer('re_x', 'me@example.com', DEFAULT_ALERT_FROM, fetchImpl).send(
      { subject: 's', text: 't', idempotencyKey: 'sms-alert-1' },
      AbortSignal.timeout(1000),
    );
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer re_x');
    expect(headers['idempotency-key']).toBe('sms-alert-1');
    expect(JSON.parse(init?.body as string)).toEqual({
      from: DEFAULT_ALERT_FROM,
      to: ['me@example.com'],
      subject: 's',
      text: 't',
    });
  });

  it('throws with the status on failure', async () => {
    const mailer = resendMailer('re_x', 'me@example.com', DEFAULT_ALERT_FROM, fakeFetch([403, {}]));
    await expect(
      mailer.send({ subject: 's', text: 't', idempotencyKey: 'k' }, AbortSignal.timeout(1000)),
    ).rejects.toThrow('resend 403');
  });
});

describe('smsSpikeCheckFromEnv', () => {
  const base: Record<string, string> = {
    SUPABASE_URL: URL_,
    SUPABASE_SECRET_KEYS: '{"default":"sb_secret_x"}',
    RESEND_API_KEY: 're_x',
    SMS_ALERT_EMAIL: 'me@example.com',
  };

  it('is null without the Resend key, the address or the project credentials', () => {
    for (const missing of ['RESEND_API_KEY', 'SMS_ALERT_EMAIL', 'SUPABASE_URL']) {
      const env = { ...base, [missing]: '' };
      expect(smsSpikeCheckFromEnv((name) => env[name] || undefined)).toBeNull();
    }
  });

  it('checks with the configured threshold', async () => {
    const fetchImpl = fakeFetch([200, []]);
    const env: Record<string, string> = { ...base, SMS_ALERT_PER_HOUR: '20' };
    await smsSpikeCheckFromEnv((name) => env[name], undefined, fetchImpl)!();
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]?.body as string)).toEqual({ p_threshold: 20 });
  });
});

describe('parseThreshold', () => {
  it('takes whole numbers from 1 to 1000, else the default', () => {
    expect(parseThreshold('20')).toBe(20);
    for (const bad of [undefined, '', '0', '-3', '2.5', 'abc', '5000']) {
      expect(parseThreshold(bad)).toBe(DEFAULT_ALERT_PER_HOUR);
    }
  });
});
