import { LISTING_PACKAGE_PLANS, PAYMENT_PRODUCTS } from '@bairmair/db';
import { describe, expect, it } from 'vitest';
import { listingPackageFulfilments, type ListingPackagePeriod } from '@/server/listing-package';
import type { PaymentRecord } from '@/server/payments';

const USER = '11111111-1111-4111-8111-111111111111';
const PAYMENT_ID = '33333333-3333-4333-8333-333333333333';

function payment(product: string, userId: string | null = USER): PaymentRecord {
  return {
    id: PAYMENT_ID,
    userId,
    product,
    subjectId: null,
    amount: 29_900,
    description: 'bairmair: 20 зарын багц',
    status: 'paid',
    qpayInvoiceId: 'inv-1',
    checkout: { qrText: '', qrImage: '', shortUrl: '', bankApps: [] },
    paidAt: '2026-11-21T00:00:00Z',
    fulfilledAt: null,
    checkedAt: null,
    createdAt: '2026-11-21T00:00:00Z',
  };
}

describe('listing package fulfilments', () => {
  it('adds each product’s period for the payer, keyed by the payment', async () => {
    const added: ListingPackagePeriod[] = [];
    const fulfil = listingPackageFulfilments(async (period) => {
      added.push(period);
    });
    await fulfil.listing_pack_30d(payment('listing_pack_30d'));
    await fulfil.listing_pack_90d(payment('listing_pack_90d'));
    await fulfil.listing_pack_test(payment('listing_pack_test'));
    expect(added).toEqual([
      { userId: USER, paymentId: PAYMENT_ID, product: 'listing_pack_30d', days: 30 },
      { userId: USER, paymentId: PAYMENT_ID, product: 'listing_pack_90d', days: 90 },
      { userId: USER, paymentId: PAYMENT_ID, product: 'listing_pack_test', days: 1 },
    ]);
  });

  it('adds nothing when the account is gone', async () => {
    const added: ListingPackagePeriod[] = [];
    const fulfil = listingPackageFulfilments(async (period) => {
      added.push(period);
    });
    await fulfil.listing_pack_30d(payment('listing_pack_30d', null));
    expect(added).toEqual([]);
  });

  it('a failed grant fails the delivery, so the payment is delivered again later', async () => {
    const fulfil = listingPackageFulfilments(async () => {
      throw new Error('database down');
    });
    await expect(fulfil.listing_pack_30d(payment('listing_pack_30d'))).rejects.toThrow(
      'database down',
    );
  });

  it('every package is a product, testers only until the limit is on for everyone', () => {
    for (const product of Object.keys(
      LISTING_PACKAGE_PLANS,
    ) as (keyof typeof LISTING_PACKAGE_PLANS)[]) {
      expect(PAYMENT_PRODUCTS[product].testersOnly).toBe(true);
    }
    // Temporary test prices; 29,900₮ and 79,900₮ at launch.
    expect(PAYMENT_PRODUCTS.listing_pack_30d.amount).toBe(100);
    expect(LISTING_PACKAGE_PLANS.listing_pack_30d.days).toBe(30);
    expect(PAYMENT_PRODUCTS.listing_pack_90d.amount).toBe(250);
    expect(LISTING_PACKAGE_PLANS.listing_pack_90d.days).toBe(90);
  });
});
