import { describe, expect, it } from 'vitest';
import {
  deliveryResult,
  finishesTransaction,
  isDeliverable,
  sendTransaction,
  yearlySavingPercent,
} from '../src/pro/delivery';

describe('delivering an App Store transaction', () => {
  it('finishes it once the server has it or can never take it', () => {
    expect(deliveryResult(200, { outcome: 'applied' })).toBe('delivered');
    expect(deliveryResult(409, { error: 'iap_other_account' })).toBe('other_account');
    expect(deliveryResult(400, { error: 'iap_invalid' })).toBe('invalid');
    for (const result of ['delivered', 'other_account', 'invalid'] as const) {
      expect(finishesTransaction(result)).toBe(true);
    }
  });

  it('keeps it for later on an expired session, server errors and unknown answers', () => {
    for (const [status, body] of [
      [401, { error: 'unauthorized' }],
      [500, { error: 'server_error' }],
      [502, null],
      [409, { error: 'something_else' }],
    ] as const) {
      const result = deliveryResult(status, body);
      expect(result).toBe('retry');
      expect(finishesTransaction(result)).toBe(false);
    }
  });

  it('sends the signed transaction with the session, and survives a dead network', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const ok = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ outcome: 'applied' }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await sendTransaction(ok, 'https://example.test', 'token', 'jws')).toBe('delivered');
    expect(calls[0]?.url).toBe('https://example.test/api/iap/apple/transactions');
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: 'Bearer token' });
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({ signedTransaction: 'jws' });

    const offline = (async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    expect(await sendTransaction(offline, 'https://example.test', 'token', 'jws')).toBe('retry');
  });

  it('sends only completed scan Pro purchases', () => {
    const base = {
      id: '1',
      productId: 'mn.bairmair.scan.pro.monthly',
      purchaseState: 'purchased',
      purchaseToken: 'jws',
    };
    expect(isDeliverable(base)).toBe(true);
    expect(isDeliverable({ ...base, purchaseState: 'pending' })).toBe(false);
    expect(isDeliverable({ ...base, productId: 'other' })).toBe(false);
    expect(isDeliverable({ ...base, purchaseToken: null })).toBe(false);
  });
});

describe('yearly saving', () => {
  it('compares the yearly price with twelve months in the same currency', () => {
    const month = { price: 23_000, currency: 'MNT' };
    expect(yearlySavingPercent(month, { price: 199_000, currency: 'MNT' })).toBe(27);
    expect(yearlySavingPercent(month, { price: 199_000, currency: 'USD' })).toBeNull();
    expect(yearlySavingPercent(month, { price: 276_000, currency: 'MNT' })).toBeNull();
    expect(yearlySavingPercent(undefined, { price: 1, currency: 'MNT' })).toBeNull();
  });
});
