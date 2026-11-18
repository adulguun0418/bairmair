import { describe, expect, it, vi } from 'vitest';
import { smsLimiterFromEnv, supabaseSmsLimiter } from './limits.ts';

const URL_ = 'https://ref.supabase.co';

function fakeFetch(status: number, body: unknown) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }));
}

describe('supabaseSmsLimiter', () => {
  it('calls claim_sms_send with the secret key and the number', async () => {
    const fetchImpl = fakeFetch(200, true);
    const allowed = await supabaseSmsLimiter(`${URL_}/`, 'sb_secret_x', fetchImpl).claim(
      '+97699112233',
      AbortSignal.timeout(1000),
    );
    expect(allowed).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(`${URL_}/rest/v1/rpc/claim_sms_send`);
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).apikey).toBe('sb_secret_x');
    expect(JSON.parse(init?.body as string)).toEqual({ p_phone: '+97699112233' });
  });

  it('passes on a refusal', async () => {
    const limiter = supabaseSmsLimiter(URL_, 'k', fakeFetch(200, false));
    expect(await limiter.claim('+97699112233', AbortSignal.timeout(1000))).toBe(false);
  });

  it('throws on an error status or an unexpected body', async () => {
    const signal = AbortSignal.timeout(1000);
    await expect(
      supabaseSmsLimiter(URL_, 'k', fakeFetch(401, { message: 'no' })).claim('+976', signal),
    ).rejects.toThrow(/401/);
    await expect(
      supabaseSmsLimiter(URL_, 'k', fakeFetch(200, { ok: true })).claim('+976', signal),
    ).rejects.toThrow(/unexpected/);
  });
});

describe('smsLimiterFromEnv', () => {
  const env = (values: Record<string, string>) => (name: string) => values[name];

  it('uses the default secret key', async () => {
    const fetchImpl = fakeFetch(200, true);
    const limiter = smsLimiterFromEnv(
      env({
        SUPABASE_URL: URL_,
        SUPABASE_SECRET_KEYS: '{"default":"sb_secret_new"}',
        SUPABASE_SERVICE_ROLE_KEY: 'legacy',
      }),
      fetchImpl,
    );
    await limiter!.claim('+97699112233', AbortSignal.timeout(1000));
    expect((fetchImpl.mock.calls[0]![1]?.headers as Record<string, string>).apikey).toBe(
      'sb_secret_new',
    );
  });

  it('falls back to the legacy service role key', async () => {
    const fetchImpl = fakeFetch(200, true);
    const limiter = smsLimiterFromEnv(
      env({
        SUPABASE_URL: URL_,
        SUPABASE_SECRET_KEYS: 'not json',
        SUPABASE_SERVICE_ROLE_KEY: 'legacy',
      }),
      fetchImpl,
    );
    await limiter!.claim('+97699112233', AbortSignal.timeout(1000));
    expect((fetchImpl.mock.calls[0]![1]?.headers as Record<string, string>).apikey).toBe('legacy');
  });

  it('is null without a URL or a key', () => {
    expect(smsLimiterFromEnv(env({ SUPABASE_SECRET_KEYS: '{"default":"k"}' }))).toBeNull();
    expect(smsLimiterFromEnv(env({ SUPABASE_URL: URL_ }))).toBeNull();
  });
});
