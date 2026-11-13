import { describe, expect, it } from 'vitest';
import { gatewayFromEnv, WESEND_SMS_URL, wesendGateway } from './gateways.ts';

const KEY = 'ws_test_0000000000000000000000000000000000000000000';

/** A fake fetch that records requests and answers with `status` and `body`. */
function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const signal = () => AbortSignal.timeout(1000);

describe('WeSend gateway', () => {
  it('posts the 8-digit number and the text with the bearer key', async () => {
    const { fetchImpl, calls } = fakeFetch(200, { id: 'x', status: 'sent' });
    await wesendGateway(KEY, fetchImpl).send('+97699112233', 'Bairmair код: 123456', signal());

    expect(calls).toHaveLength(1);
    const { url, init } = calls[0]!;
    expect(url).toBe(WESEND_SMS_URL);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({
      to: '99112233',
      text: 'Bairmair код: 123456',
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('sends the same idempotency key for the same message only', async () => {
    const { fetchImpl, calls } = fakeFetch(200, {});
    const gateway = wesendGateway(KEY, fetchImpl);
    await gateway.send('+97699112233', 'code 111111', signal());
    await gateway.send('+97699112233', 'code 111111', signal());
    await gateway.send('+97699112233', 'code 222222', signal());

    const keys = calls.map(
      (call) => (call.init.headers as Record<string, string>)['Idempotency-Key'],
    );
    expect(keys[0]).toMatch(/^bairmair-[0-9a-f]{64}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
    // The key is a hash: neither the code nor the number appears in it.
    expect(keys[0]).not.toContain('111111');
    expect(keys[0]).not.toContain('99112233');
  });

  it('throws with WeSend’s status and error code, never the API key', async () => {
    const { fetchImpl } = fakeFetch(402, {
      error: { code: 'insufficient_credits', message: 'Not enough credits.', balance: 40 },
    });
    const sending = wesendGateway(KEY, fetchImpl).send('+97699112233', 'x', signal());
    await expect(sending).rejects.toThrow('wesend 402 insufficient_credits');
    await sending.catch((error: Error) => expect(error.message).not.toContain(KEY));
  });

  it('copes with an error body that is not WeSend’s JSON', async () => {
    const fetchImpl = (async () => new Response('Bad Gateway', { status: 502 })) as typeof fetch;
    await expect(wesendGateway(KEY, fetchImpl).send('+97699112233', 'x', signal())).rejects.toThrow(
      'wesend 502 unknown',
    );
  });
});

describe('gatewayFromEnv', () => {
  it('builds the WeSend gateway from SMS_GATEWAY and WESEND_API_KEY', async () => {
    const { fetchImpl, calls } = fakeFetch(200, {});
    const env: Record<string, string> = { SMS_GATEWAY: 'wesend', WESEND_API_KEY: KEY };
    await gatewayFromEnv((name) => env[name], fetchImpl).send('+97699112233', 'x', signal());
    expect(calls).toHaveLength(1);
  });

  it('fails clearly without a key or with an unknown gateway', async () => {
    const noKey = gatewayFromEnv((name) => (name === 'SMS_GATEWAY' ? 'wesend' : undefined));
    await expect(noKey.send('+97699112233', 'x', signal())).rejects.toThrow(
      /WESEND_API_KEY is not set/,
    );
    const unknown = gatewayFromEnv((name) => (name === 'SMS_GATEWAY' ? 'other' : undefined));
    await expect(unknown.send('+97699112233', 'x', signal())).rejects.toThrow(
      /unknown SMS_GATEWAY/,
    );
  });
});
