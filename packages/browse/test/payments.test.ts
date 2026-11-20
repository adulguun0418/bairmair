import { describe, expect, it } from 'vitest';
import { paymentErrorKey, PaymentRequestError, paymentsApi } from '../src/payments';

function recorder(answer: Response) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    return answer.clone();
  };
  return { calls, fetcher };
}

describe('paymentsApi', () => {
  it('sends the token and the product, never an amount', async () => {
    const { calls, fetcher } = recorder(Response.json({ id: 'p1', status: 'pending' }));
    const api = paymentsApi('https://site.test/', fetcher);
    await api.create('tok', { product: 'test' });
    expect(calls[0]!.url).toBe('https://site.test/api/payments');
    expect(calls[0]!.init).toMatchObject({
      method: 'POST',
      body: '{"product":"test"}',
      headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
    });
  });

  it('builds the check and cancel paths (same origin on the website)', async () => {
    const { calls, fetcher } = recorder(Response.json({ id: 'p1' }));
    const api = paymentsApi('', fetcher);
    await api.get('tok', 'p1', true);
    await api.cancel('tok', 'p1');
    expect(calls.map((call) => [call.init?.method, call.url])).toEqual([
      ['GET', '/api/payments/p1?check=1'],
      ['DELETE', '/api/payments/p1'],
    ]);
  });

  it('throws the API error key', async () => {
    const { fetcher } = recorder(Response.json({ error: 'payment_forbidden' }, { status: 403 }));
    const error = await paymentsApi('', fetcher)
      .create('tok', { product: 'test' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PaymentRequestError);
    expect(error).toMatchObject({ key: 'payment_forbidden', status: 403 });
  });
});

describe('paymentErrorKey', () => {
  it('names known errors and falls back to a generic text', () => {
    expect(paymentErrorKey(new PaymentRequestError('payment_rate_limited', 429))).toBe(
      'payments.errors.payment_rate_limited',
    );
    expect(paymentErrorKey(new PaymentRequestError('server_error', 500))).toBe(
      'payments.errors.generic',
    );
    expect(paymentErrorKey(new TypeError('Network request failed'))).toBe(
      'payments.errors.generic',
    );
  });
});
