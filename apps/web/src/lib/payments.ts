import {
  apiErrorKey,
  paymentPath,
  PAYMENTS_PATH,
  type ApiErrorKey,
  type CreatePaymentRequest,
  type PaymentResponse,
} from '@bairmair/db';

/** The website's calls to its own payment routes, with the visitor's access token. */

export class PaymentRequestError extends Error {
  constructor(readonly key: ApiErrorKey | null) {
    super(key ?? 'payment request failed');
  }
}

async function send(token: string, path: string, init: RequestInit = {}): Promise<PaymentResponse> {
  const response = await fetch(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
    cache: 'no-store',
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new PaymentRequestError(apiErrorKey(body));
  return body as PaymentResponse;
}

export function createPayment(token: string, request: CreatePaymentRequest) {
  return send(token, PAYMENTS_PATH, { method: 'POST', body: JSON.stringify(request) });
}

export function fetchPayment(token: string, id: string, check: boolean) {
  return send(token, paymentPath(id, { check }));
}

export function cancelPayment(token: string, id: string) {
  return send(token, paymentPath(id), { method: 'DELETE' });
}

const SHOWN_ERRORS = ['payment_forbidden', 'payment_unavailable', 'payment_rate_limited'] as const;
type ShownError = (typeof SHOWN_ERRORS)[number];

/** Text key for a failed payment request. */
export function paymentErrorKey(error: unknown): `payments.errors.${ShownError | 'generic'}` {
  const key = error instanceof PaymentRequestError ? error.key : null;
  const shown = SHOWN_ERRORS.find((candidate) => candidate === key);
  return shown ? `payments.errors.${shown}` : 'payments.errors.generic';
}
