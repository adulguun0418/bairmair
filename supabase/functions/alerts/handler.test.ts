import { describe, expect, it, vi } from 'vitest';
import type { Mailer } from '../_shared/resend.ts';
import {
  alertEmail,
  createAlertsHandler,
  supabaseAlertQueue,
  type AlertQueue,
  type AlertRow,
} from './handler.ts';

const reveals: AlertRow = {
  id: 4,
  kind: 'reveals',
  created_at: '2026-11-19T01:00:00Z',
  details: {
    reveals_last_hour: 120,
    anonymous: 110,
    ip_addresses: 37,
    signed_in: 10,
    users: 2,
    listings: 64,
    reveals_last_day: 180,
    threshold: 100,
    anon_budget: 150,
  },
};

function fakeQueue(rows: AlertRow[], opts: { takeFails?: boolean } = {}) {
  const released: number[] = [];
  const queue: AlertQueue = {
    async take() {
      if (opts.takeFails) throw new Error('db down');
      return rows;
    },
    async release(id) {
      released.push(id);
    },
  };
  return { queue, released };
}

function fakeMailer(failFor: number[] = []) {
  const sent: Parameters<Mailer['send']>[0][] = [];
  let calls = 0;
  const mailer: Mailer = {
    async send(email) {
      calls += 1;
      if (failFor.includes(calls)) throw new Error('resend 500');
      sent.push(email);
    },
  };
  return { mailer, sent };
}

const post = () => new Request('http://localhost/alerts', { method: 'POST', body: '{}' });

describe('alerts function', () => {
  it('emails every pending alert, keyed by its id', async () => {
    const { queue, released } = fakeQueue([reveals, { ...reveals, id: 5 }]);
    const { mailer, sent } = fakeMailer();
    const res = await createAlertsHandler({ queue, mailer })(post());
    expect(await res.json()).toEqual({ sent: 2, failed: 0 });
    expect(sent.map((e) => e.idempotencyKey)).toEqual(['alert-4', 'alert-5']);
    expect(released).toEqual([]);
  });

  it('puts an alert back when its email fails, and still sends the others', async () => {
    const { queue, released } = fakeQueue([reveals, { ...reveals, id: 5 }]);
    const { mailer, sent } = fakeMailer([1]);
    const res = await createAlertsHandler({ queue, mailer })(post());
    expect(await res.json()).toEqual({ sent: 1, failed: 1 });
    expect(released).toEqual([4]);
    expect(sent.map((e) => e.idempotencyKey)).toEqual(['alert-5']);
  });

  it('answers 503 without taking anything while not configured', async () => {
    const take = vi.fn(async () => [reveals]);
    const res = await createAlertsHandler({
      queue: { take, release: async () => {} },
      mailer: null,
    })(post());
    expect(res.status).toBe(503);
    expect(take).not.toHaveBeenCalled();
  });

  it('answers 502 when the queue cannot be read, 405 to anything but POST', async () => {
    const { mailer } = fakeMailer();
    const failing = createAlertsHandler({
      queue: fakeQueue([], { takeFails: true }).queue,
      mailer,
    });
    expect((await failing(post())).status).toBe(502);
    expect((await failing(new Request('http://localhost/alerts'))).status).toBe(405);
  });
});

describe('alertEmail', () => {
  it('describes a reveal spike and how to require sign-in', () => {
    const { subject, text } = alertEmail(reveals);
    expect(subject).toBe('bairmair: 120 phone numbers revealed in the last hour');
    expect(text).toContain('110 by visitors who were not signed in, from 37 IP addresses');
    expect(text).toContain('10 by 2 signed-in users');
    expect(text).toContain('64 different listings; 180 reveals in the last 24 hours');
    expect(text).toContain('together 150 an hour');
    expect(text).toContain("values ('anon_reveals_per_hour', '0')");
  });

  it('falls back to the raw details for an unknown kind', () => {
    const { subject, text } = alertEmail({ ...reveals, kind: 'other', details: { a: 1 } });
    expect(subject).toBe('bairmair alert: other');
    expect(text).toContain('"a": 1');
  });
});

describe('supabaseAlertQueue', () => {
  const credentials = { url: 'https://ref.supabase.co/', key: 'sb_secret_x' };

  it('takes alerts with the secret key and drops malformed rows', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify([reveals, { id: 'x' }]), { status: 200 }),
    );
    const rows = await supabaseAlertQueue(credentials, fetchImpl).take(AbortSignal.timeout(1000));
    expect(rows).toEqual([reveals]);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://ref.supabase.co/rest/v1/rpc/take_alerts');
    expect((init?.headers as Record<string, string>).apikey).toBe('sb_secret_x');
  });

  it('releases by id and throws on an error status', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}', { status: 500 }));
    await expect(
      supabaseAlertQueue(credentials, fetchImpl).release(4, AbortSignal.timeout(1000)),
    ).rejects.toThrow('release_alert 500');
    expect(JSON.parse(fetchImpl.mock.calls[0]![1]?.body as string)).toEqual({ p_alert_id: 4 });
  });
});
