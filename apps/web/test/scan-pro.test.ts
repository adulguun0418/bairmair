import { PAYMENT_PRODUCTS, SCAN_PRO_PLANS } from '@bairmair/db';
import { describe, expect, it } from 'vitest';
import type { PaymentRecord } from '@/server/payments';
import { scanProFulfilments, type ScanProPeriod } from '@/server/scan-pro';

const USER = '11111111-1111-4111-8111-111111111111';

function payment(product: string, userId: string | null = USER): PaymentRecord {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    userId,
    product,
    subjectId: null,
    amount: 19_900,
    description: 'bairmair scan Pro',
    status: 'paid',
    qpayInvoiceId: 'inv-1',
    checkout: { qrText: '', qrImage: '', shortUrl: '', bankApps: [] },
    paidAt: '2026-11-20T00:00:00Z',
    fulfilledAt: null,
    checkedAt: null,
    createdAt: '2026-11-20T00:00:00Z',
  };
}

describe('scan Pro fulfilments', () => {
  it('adds each product’s period for the payer, keyed by the payment', async () => {
    const added: ScanProPeriod[] = [];
    const fulfil = scanProFulfilments(async (period) => {
      added.push(period);
    });
    await fulfil.scan_pro_30d(payment('scan_pro_30d'));
    await fulfil.scan_pro_365d(payment('scan_pro_365d'));
    await fulfil.scan_pro_test(payment('scan_pro_test'));
    expect(added).toEqual([
      { userId: USER, paymentId: payment('x').id, product: 'scan_pro_30d', days: 30 },
      { userId: USER, paymentId: payment('x').id, product: 'scan_pro_365d', days: 365 },
      { userId: USER, paymentId: payment('x').id, product: 'scan_pro_test', days: 1 },
    ]);
  });

  it('adds nothing when the account is gone', async () => {
    const added: ScanProPeriod[] = [];
    const fulfil = scanProFulfilments(async (period) => {
      added.push(period);
    });
    await fulfil.scan_pro_30d(payment('scan_pro_30d', null));
    expect(added).toEqual([]);
  });

  it('a failed grant fails the delivery, so the payment is delivered again later', async () => {
    const fulfil = scanProFulfilments(async () => {
      throw new Error('database down');
    });
    await expect(fulfil.scan_pro_30d(payment('scan_pro_30d'))).rejects.toThrow('database down');
  });

  it('every Pro plan is a sellable product, testers only until release', () => {
    for (const product of Object.keys(SCAN_PRO_PLANS) as (keyof typeof SCAN_PRO_PLANS)[]) {
      expect(PAYMENT_PRODUCTS[product].testersOnly).toBe(true);
    }
    expect(PAYMENT_PRODUCTS.scan_pro_30d.amount).toBe(19_900);
    expect(PAYMENT_PRODUCTS.scan_pro_365d.amount).toBe(199_000);
  });
});
