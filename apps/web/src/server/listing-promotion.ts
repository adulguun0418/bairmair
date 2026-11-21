import {
  LISTING_PROMOTION_PLANS,
  type ListingPromotionProductKey,
  type ListingTier,
} from '@bairmair/db';
import type { Fulfilment } from './payments';

/**
 * Gold / Silver listings bought with QPay: once paid, the period is added to the listing
 * (`add_listing_promotion_period`: same tier after its last period, Gold before queued Silver
 * time; repeating it for the same payment adds nothing, so a retried delivery is safe).
 */

export interface ListingPromotionPeriod {
  userId: string;
  listingId: string;
  paymentId: string;
  product: ListingPromotionProductKey;
  tier: ListingTier;
  days: number;
}

export type AddListingPromotionPeriod = (period: ListingPromotionPeriod) => Promise<void>;

export function listingPromotionFulfilments(
  add: AddListingPromotionPeriod,
): Record<ListingPromotionProductKey, Fulfilment> {
  const fulfilment =
    (product: ListingPromotionProductKey): Fulfilment =>
    async (payment) => {
      // Account deleted after paying, or (never for these products) no listing: nothing to
      // promote. The payment stays as an accounting record.
      if (!payment.userId || !payment.subjectId) return;
      const plan = LISTING_PROMOTION_PLANS[product];
      await add({
        userId: payment.userId,
        listingId: payment.subjectId,
        paymentId: payment.id,
        product,
        tier: plan.tier,
        days: plan.days,
      });
    };
  return {
    listing_gold_7d: fulfilment('listing_gold_7d'),
    listing_gold_14d: fulfilment('listing_gold_14d'),
    listing_silver_7d: fulfilment('listing_silver_7d'),
    listing_silver_14d: fulfilment('listing_silver_14d'),
  };
}
