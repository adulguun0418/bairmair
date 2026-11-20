import { X509Certificate } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AppleVerificationError,
  handleAppTransaction,
  handleNotification,
  transactionUpdate,
  type AppleIapDeps,
  type AppleNotificationPayload,
  type AppleRenewalPayload,
  type AppleSubscriptionUpdate,
  type AppleTransactionPayload,
  type ApplyOutcome,
} from '@/server/apple-iap';
import { APPLE_ROOT_CA_G3 } from '@/server/apple-root-ca';
import { appleVerifier } from '@/server/apple-verifier';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const T0 = Date.parse('2026-11-20T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function tx(overrides: Partial<AppleTransactionPayload> = {}): AppleTransactionPayload {
  return {
    originalTransactionId: '2000000123',
    transactionId: '2000000456',
    bundleId: 'mn.bairmair.scan',
    productId: 'mn.bairmair.scan.pro.monthly',
    purchaseDate: T0,
    expiresDate: T0 + 30 * DAY,
    appAccountToken: USER,
    environment: 'Sandbox',
    signedDate: T0 + 1000,
    ...overrides,
  };
}

/** A verifier whose "JWS" strings are keys into fixed payloads; unknown ones fail to verify. */
function fakeDeps(
  payloads: Record<
    string,
    AppleTransactionPayload | AppleRenewalPayload | AppleNotificationPayload
  >,
  outcome: ApplyOutcome = 'applied',
) {
  const applied: AppleSubscriptionUpdate[] = [];
  const lookup = async <T>(jws: string): Promise<T> => {
    const payload = payloads[jws];
    if (!payload) throw new AppleVerificationError('bad signature');
    return payload as T;
  };
  const deps: AppleIapDeps = {
    verifier: { transaction: lookup, renewal: lookup, notification: lookup },
    store: {
      async apply(update) {
        applied.push(update);
        return outcome;
      },
    },
  };
  return { deps, applied };
}

describe('Apple Root CA - G3', () => {
  it('is the certificate Apple publishes (pinned fingerprint)', () => {
    const cert = new X509Certificate(Buffer.from(APPLE_ROOT_CA_G3, 'base64'));
    expect(cert.subject).toContain('CN=Apple Root CA - G3');
    expect(cert.fingerprint256).toBe(
      '63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79',
    );
  });

  it('the real verifier refuses data that is not signed by Apple', async () => {
    const verifier = appleVerifier({ appAppleId: 123 });
    const forged = `${Buffer.from('{"alg":"ES256"}').toString('base64url')}.${Buffer.from(
      JSON.stringify(tx()),
    ).toString('base64url')}.c2ln`;
    await expect(verifier.transaction(forged)).rejects.toBeInstanceOf(AppleVerificationError);
    await expect(verifier.notification('not a jws')).rejects.toBeInstanceOf(AppleVerificationError);
  });
});

describe('transactionUpdate', () => {
  it('maps a scan Pro transaction', () => {
    expect(transactionUpdate(tx())).toEqual({
      originalTransactionId: '2000000123',
      environment: 'Sandbox',
      transaction: {
        transactionId: '2000000456',
        productId: 'mn.bairmair.scan.pro.monthly',
        startsAt: new Date(T0),
        expiresAt: new Date(T0 + 30 * DAY),
        status: 'active',
        signedAt: new Date(T0 + 1000),
      },
    });
  });

  it('marks refunds and revocations', () => {
    expect(transactionUpdate(tx({ revocationDate: T0 + DAY }))?.transaction?.status).toBe(
      'refunded',
    );
    expect(
      transactionUpdate(tx({ revocationDate: T0 + DAY }), { revoked: true })?.transaction?.status,
    ).toBe('revoked');
  });

  it('refuses other apps, products, environments and incomplete data', () => {
    for (const bad of [
      { bundleId: 'mn.bairmair.app' },
      { productId: 'mn.bairmair.scan.coins' },
      { environment: 'Xcode' },
      { originalTransactionId: undefined },
      { expiresDate: undefined },
      { expiresDate: T0 - 1 },
      { signedDate: undefined },
    ]) {
      expect(transactionUpdate(tx(bad))).toBeNull();
    }
  });
});

describe('handleAppTransaction', () => {
  it('applies the caller’s purchase', async () => {
    const { deps, applied } = fakeDeps({ good: tx() });
    const outcome = await handleAppTransaction(deps, USER, { signedTransaction: 'good' });
    expect(outcome).toEqual({ ok: true, status: 200, body: { outcome: 'applied' } });
    expect(applied[0]?.userId).toBe(USER);
    expect(applied[0]?.renewal).toBeNull();
  });

  it('takes a transaction without an account token for the caller', async () => {
    const { deps, applied } = fakeDeps({ good: tx({ appAccountToken: undefined }) });
    await handleAppTransaction(deps, USER, { signedTransaction: 'good' });
    expect(applied[0]?.userId).toBe(USER);
  });

  it('refuses another account’s purchase without touching the store', async () => {
    const { deps, applied } = fakeDeps({ good: tx({ appAccountToken: OTHER }) });
    expect(await handleAppTransaction(deps, USER, { signedTransaction: 'good' })).toEqual({
      ok: false,
      status: 409,
      error: 'iap_other_account',
    });
    expect(applied).toEqual([]);
  });

  it('passes on the store’s ownership answer', async () => {
    const { deps } = fakeDeps({ good: tx({ appAccountToken: undefined }) }, 'other_account');
    expect(await handleAppTransaction(deps, USER, { signedTransaction: 'good' })).toMatchObject({
      status: 409,
    });
  });

  it('answers 400 for bodies and data that do not verify or are not ours', async () => {
    const { deps, applied } = fakeDeps({ other: tx({ productId: 'something.else' }) });
    for (const body of [
      null,
      {},
      { signedTransaction: '' },
      { signedTransaction: 'forged' },
      { signedTransaction: 'other' },
    ]) {
      expect(await handleAppTransaction(deps, USER, body)).toMatchObject({
        status: 400,
        error: 'iap_invalid',
      });
    }
    expect(applied).toEqual([]);
  });

  it('lets other failures through (500, the app retries)', async () => {
    const { deps } = fakeDeps({});
    deps.verifier.transaction = async () => {
      throw new Error('OCSP timeout');
    };
    await expect(handleAppTransaction(deps, USER, { signedTransaction: 'x' })).rejects.toThrow(
      'OCSP timeout',
    );
  });
});

describe('handleNotification', () => {
  const renewalInfo: AppleRenewalPayload = {
    originalTransactionId: '2000000123',
    autoRenewStatus: 0,
    environment: 'Sandbox',
    signedDate: T0 + 2000,
  };

  it('a renewal applies the transaction and the renewal info for the token’s account', async () => {
    const { deps, applied } = fakeDeps({
      note: {
        notificationType: 'DID_RENEW',
        data: { signedTransactionInfo: 'tx', signedRenewalInfo: 'ri' },
      },
      tx: tx({ expiresDate: T0 + 60 * DAY }),
      ri: { ...renewalInfo, autoRenewStatus: 1 },
    });
    expect(await handleNotification(deps, { signedPayload: 'note' })).toEqual({
      status: 200,
      handled: 'applied',
    });
    expect(applied[0]).toMatchObject({
      userId: USER,
      originalTransactionId: '2000000123',
      transaction: { expiresAt: new Date(T0 + 60 * DAY), status: 'active' },
      renewal: { autoRenew: true, signedAt: new Date(T0 + 2000) },
    });
  });

  it('refunds and revocations set the status', async () => {
    for (const [type, status] of [
      ['REFUND', 'refunded'],
      ['REVOKE', 'revoked'],
    ] as const) {
      const { deps, applied } = fakeDeps({
        note: { notificationType: type, data: { signedTransactionInfo: 'tx' } },
        tx: tx({ revocationDate: T0 + DAY }),
      });
      await handleNotification(deps, { signedPayload: 'note' });
      expect(applied[0]?.transaction?.status).toBe(status);
    }
  });

  it('renewal info alone (auto-renew turned off) keeps the row’s owner', async () => {
    const { deps, applied } = fakeDeps({
      note: { notificationType: 'DID_CHANGE_RENEWAL_STATUS', data: { signedRenewalInfo: 'ri' } },
      ri: renewalInfo,
    });
    await handleNotification(deps, { signedPayload: 'note' });
    expect(applied[0]).toEqual({
      userId: null,
      originalTransactionId: '2000000123',
      environment: 'Sandbox',
      transaction: null,
      renewal: { autoRenew: false, signedAt: new Date(T0 + 2000) },
    });
  });

  it('acknowledges tests and products that are not ours without applying anything', async () => {
    const { deps, applied } = fakeDeps({
      test: { notificationType: 'TEST' },
      other: { notificationType: 'SUBSCRIBED', data: { signedTransactionInfo: 'tx' } },
      tx: tx({ productId: 'something.else' }),
    });
    expect(await handleNotification(deps, { signedPayload: 'test' })).toEqual({
      status: 200,
      handled: 'test',
    });
    expect(await handleNotification(deps, { signedPayload: 'other' })).toEqual({
      status: 200,
      handled: 'ignored',
    });
    expect(applied).toEqual([]);
  });

  it('refuses what does not verify', async () => {
    const { deps } = fakeDeps({
      note: { notificationType: 'DID_RENEW', data: { signedTransactionInfo: 'forged' } },
    });
    expect(await handleNotification(deps, { signedPayload: 'forged' })).toEqual({ status: 400 });
    expect(await handleNotification(deps, { signedPayload: 'note' })).toEqual({ status: 400 });
    expect(await handleNotification(deps, null)).toEqual({ status: 400 });
  });
});
