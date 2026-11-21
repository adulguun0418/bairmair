'use client';

import type { ListingPackageProductKey, PaymentResponse } from '@bairmair/db';
import { useState } from 'react';
import { createPayment, paymentErrorKey, PaymentRequestError } from '@/lib/payments';

/**
 * Buying a listing package with QPay, shared by the package page and the account card: creates
 * the invoice, follows it (through `QPayCheckout`'s `onChange`), and reports `paid` so the caller
 * reloads the plan. `notYet` when the product is still testers only.
 */
export function usePackagePurchase(accessToken: string | null, onPaid: () => void) {
  const [payment, setPayment] = useState<PaymentResponse | null>(null);
  const [busy, setBusy] = useState<ListingPackageProductKey | null>(null);
  const [errorKey, setErrorKey] = useState<ReturnType<typeof paymentErrorKey> | null>(null);
  const [notYet, setNotYet] = useState(false);

  const buy = async (product: ListingPackageProductKey) => {
    if (!accessToken) return;
    setBusy(product);
    setErrorKey(null);
    try {
      setPayment(await createPayment(accessToken, { product }));
    } catch (cause) {
      if (cause instanceof PaymentRequestError && cause.key === 'payment_forbidden') {
        setNotYet(true);
      } else {
        setErrorKey(paymentErrorKey(cause));
      }
    } finally {
      setBusy(null);
    }
  };

  const onPaymentChange = (next: PaymentResponse) => {
    setPayment(next);
    if (next.status === 'paid') onPaid();
  };

  return { payment, busy, errorKey, notYet, buy, onPaymentChange, reset: () => setPayment(null) };
}
