import {
  apiErrorKey,
  paymentPath,
  PAYMENTS_PATH,
  type ApiErrorKey,
  type CreatePaymentRequest,
  type PaymentResponse,
  type TypedSupabaseClient,
} from '@bairmair/db';

/**
 * The payment routes of the web server (`/api/payments`), for the website and the app. Each call
 * takes the visitor's access token; `apiBase` is `''` on the website (same origin) and the web
 * server's URL in the app.
 */

export class PaymentRequestError extends Error {
  constructor(
    readonly key: ApiErrorKey | null,
    readonly status: number,
  ) {
    super(key ?? `payment request failed (HTTP ${status})`);
    this.name = 'PaymentRequestError';
  }
}

export interface PaymentsApi {
  create(token: string, request: CreatePaymentRequest): Promise<PaymentResponse>;
  /** `check`: a pending payment is checked with QPay first (for polling). */
  get(token: string, id: string, check: boolean): Promise<PaymentResponse>;
  cancel(token: string, id: string): Promise<PaymentResponse>;
}

export function paymentsApi(apiBase: string, fetcher: typeof fetch = fetch): PaymentsApi {
  const base = apiBase.replace(/\/+$/, '');

  async function send(
    token: string,
    path: string,
    init: { method?: string; body?: string } = {},
  ): Promise<PaymentResponse> {
    const response = await fetcher(`${base}${path}`, {
      method: init.method ?? 'GET',
      body: init.body,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      cache: 'no-store',
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new PaymentRequestError(apiErrorKey(body), response.status);
    return body as PaymentResponse;
  }

  return {
    create: (token, request) =>
      send(token, PAYMENTS_PATH, { method: 'POST', body: JSON.stringify(request) }),
    get: (token, id, check) => send(token, paymentPath(id, { check })),
    cancel: (token, id) => send(token, paymentPath(id), { method: 'DELETE' }),
  };
}

const SHOWN_ERRORS = [
  'payment_forbidden',
  'payment_unavailable',
  'payment_rate_limited',
  'payment_listing_not_published',
] as const;
type ShownError = (typeof SHOWN_ERRORS)[number];

/** Text key (`payments.errors.*`) for a failed payment request. */
export function paymentErrorKey(error: unknown): `payments.errors.${ShownError | 'generic'}` {
  const key = error instanceof PaymentRequestError ? error.key : null;
  const shown = SHOWN_ERRORS.find((candidate) => candidate === key);
  return shown ? `payments.errors.${shown}` : 'payments.errors.generic';
}

export interface PaymentHistoryRow {
  id: string;
  amount: number;
  status: PaymentResponse['status'];
  createdAt: string;
}

/** The signed-in user's latest payments (RLS: own rows only), newest first. */
export async function fetchPaymentHistory(
  client: TypedSupabaseClient,
  limit = 10,
): Promise<PaymentHistoryRow[]> {
  const { data, error } = await client
    .from('payments')
    .select('id, amount, status, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    amount: Number(row.amount),
    status: row.status,
    createdAt: row.created_at,
  }));
}
