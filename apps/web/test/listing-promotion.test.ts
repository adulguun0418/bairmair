import { LISTING_PROMOTION_PLANS, PAYMENT_PRODUCTS } from '@bairmair/db';
import { describe, expect, it } from 'vitest';
import {
  listingPromotionFulfilments,
  type ListingPromotionPeriod,
} from '@/server/listing-promotion';
import type { PaymentRecord } from '@/server/payments';

const USER = '11111111-1111-4111-8111-111111111111';
const LISTING = '22222222-2222-4222-8222-222222222222';
const PAYMENT_ID = '33333333-3333-4333-8333-333333333333';

function payment(
  product: string,
  fields: { userId?: string | null; subjectId?: string | null } = {},
): PaymentRecord {
  return {
    id: PAYMENT_ID,
    userId: fields.userId === undefined ? USER : fields.userId,
    product,
    subjectId: fields.subjectId === undefined ? LISTING : fields.subjectId,
    amount: 100,
    description: 'bairmair: Алтан зар',
    status: 'paid',
    qpayInvoiceId: 'inv-1',
    checkout: { qrText: '', qrImage: '', shortUrl: '', bankApps: [] },
    paidAt: '2026-11-21T00:00:00Z',
    fulfilledAt: null,
    checkedAt: null,
    createdAt: '2026-11-21T00:00:00Z',
  };
}

describe('listing promotion fulfilments', () => {
  it('adds each product’s tier and period to the paid listing', async () => {
    const added: ListingPromotionPeriod[] = [];
    const fulfil = listingPromotionFulfilments(async (period) => {
      added.push(period);
    });
    await fulfil.listing_gold_7d(payment('listing_gold_7d'));
    await fulfil.listing_gold_14d(payment('listing_gold_14d'));
    await fulfil.listing_silver_7d(payment('listing_silver_7d'));
    await fulfil.listing_silver_14d(payment('listing_silver_14d'));
    const base = { userId: USER, listingId: LISTING, paymentId: PAYMENT_ID };
    expect(added).toEqual([
      { ...base, product: 'listing_gold_7d', tier: 'gold', days: 7 },
      { ...base, product: 'listing_gold_14d', tier: 'gold', days: 14 },
      { ...base, product: 'listing_silver_7d', tier: 'silver', days: 7 },
      { ...base, product: 'listing_silver_14d', tier: 'silver', days: 14 },
    ]);
  });

  it('adds nothing without an account or a listing', async () => {
    const added: ListingPromotionPeriod[] = [];
    const fulfil = listingPromotionFulfilments(async (period) => {
      added.push(period);
    });
    await fulfil.listing_gold_7d(payment('listing_gold_7d', { userId: null }));
    await fulfil.listing_gold_7d(payment('listing_gold_7d', { subjectId: null }));
    expect(added).toEqual([]);
  });

  it('a failed grant fails the delivery, so it is retried later', async () => {
    const fulfil = listingPromotionFulfilments(async () => {
      throw new Error('database down');
    });
    await expect(fulfil.listing_silver_7d(payment('listing_silver_7d'))).rejects.toThrow(
      'database down',
    );
  });

  it('every tier product needs a listing and is testers only for now', () => {
    for (const product of Object.keys(
      LISTING_PROMOTION_PLANS,
    ) as (keyof typeof LISTING_PROMOTION_PLANS)[]) {
      expect(PAYMENT_PRODUCTS[product].subject).toBe('listing');
      expect(PAYMENT_PRODUCTS[product].testersOnly).toBe(true);
      // Temporary test prices; Gold 15,000₮ / 25,000₮, Silver 8,000₮ / 13,000₮ at launch.
      expect(PAYMENT_PRODUCTS[product].amount).toBe(
        LISTING_PROMOTION_PLANS[product].days === 7 ? 50 : 100,
      );
    }
  });
});
