import { SCAN_PRO_PLANS, type ScanProProductKey } from '@bairmair/db';
import type { Fulfilment } from './payments';

/**
 * bairmair scan Pro bought with QPay: once a scan Pro payment is paid, its period is added to the
 * payer's Pro (`add_scan_pro_period`: from now, or from the end of the current Pro; repeating it
 * for the same payment adds nothing, so a retried delivery is safe).
 */

export interface ScanProPeriod {
  userId: string;
  paymentId: string;
  product: ScanProProductKey;
  days: number;
}

export type AddScanProPeriod = (period: ScanProPeriod) => Promise<void>;

export function scanProFulfilments(add: AddScanProPeriod): Record<ScanProProductKey, Fulfilment> {
  const fulfilment =
    (product: ScanProProductKey): Fulfilment =>
    async (payment) => {
      // The account was deleted after paying: there is nobody to make Pro. The payment stays
      // as an accounting record.
      if (!payment.userId) return;
      await add({
        userId: payment.userId,
        paymentId: payment.id,
        product,
        days: SCAN_PRO_PLANS[product].days,
      });
    };
  return {
    scan_pro_30d: fulfilment('scan_pro_30d'),
    scan_pro_365d: fulfilment('scan_pro_365d'),
    scan_pro_test: fulfilment('scan_pro_test'),
  };
}
