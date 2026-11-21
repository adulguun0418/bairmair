import { LISTING_PACKAGE_PLANS, type ListingPackageProductKey } from '@bairmair/db';
import type { Fulfilment } from './payments';

/**
 * Listing packages bought with QPay: once a package payment is paid, its period is added to the
 * payer's packages and the listings a previous package's end had hidden are republished
 * (`add_listing_package_period`: from now, or from the end of the current package; repeating it
 * for the same payment adds no time, so a retried delivery is safe).
 */

export interface ListingPackagePeriod {
  userId: string;
  paymentId: string;
  product: ListingPackageProductKey;
  days: number;
}

export type AddListingPackagePeriod = (period: ListingPackagePeriod) => Promise<void>;

export function listingPackageFulfilments(
  add: AddListingPackagePeriod,
): Record<ListingPackageProductKey, Fulfilment> {
  const fulfilment =
    (product: ListingPackageProductKey): Fulfilment =>
    async (payment) => {
      // The account was deleted after paying: nobody to give the package to. The payment stays
      // as an accounting record.
      if (!payment.userId) return;
      await add({
        userId: payment.userId,
        paymentId: payment.id,
        product,
        days: LISTING_PACKAGE_PLANS[product].days,
      });
    };
  return {
    listing_pack_30d: fulfilment('listing_pack_30d'),
    listing_pack_test: fulfilment('listing_pack_test'),
  };
}
