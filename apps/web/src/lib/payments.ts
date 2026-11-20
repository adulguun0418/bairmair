import { paymentsApi } from '@bairmair/browse';

/** The website's calls to its own payment routes (same origin), with the visitor's token. */
const api = paymentsApi('');

export const createPayment = api.create;
export const fetchPayment = api.get;
export const cancelPayment = api.cancel;
export { paymentErrorKey, PaymentRequestError } from '@bairmair/browse';
