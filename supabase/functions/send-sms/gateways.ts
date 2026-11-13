import type { SmsGateway } from './handler.ts';

/**
 * Picks the SMS gateway from the function's secrets. `SMS_GATEWAY` names the adapter:
 * - `wesend`: WeSend (https://wesend.mn/docs), key in `WESEND_API_KEY`.
 * Without a gateway, real numbers get a clear error and only Auth's test numbers (which skip the
 * hook) can sign in.
 */
export function gatewayFromEnv(
  env: (name: string) => string | undefined,
  fetchImpl: typeof fetch = fetch,
): SmsGateway {
  const name = env('SMS_GATEWAY');
  switch (name) {
    case undefined:
    case '':
      return notConfigured('SMS_GATEWAY is not set');
    case 'wesend': {
      const apiKey = env('WESEND_API_KEY');
      if (!apiKey) return notConfigured('WESEND_API_KEY is not set');
      return wesendGateway(apiKey, fetchImpl);
    }
    default:
      return notConfigured(`unknown SMS_GATEWAY "${name}"`);
  }
}

function notConfigured(reason: string): SmsGateway {
  return {
    send() {
      return Promise.reject(new Error(`sms gateway not configured: ${reason}`));
    },
  };
}

export const WESEND_SMS_URL = 'https://api.wesend.mn/v1/sms';

/**
 * WeSend's plain SMS endpoint, `POST /v1/sms` with `{ to, text }`. Supabase Auth makes and checks
 * the code, so WeSend's own `/v1/verify` (which makes a second code) is not used.
 *
 * - `to` is the 8-digit local number; WeSend picks the carrier from its prefix.
 * - Cyrillic is sent as unicode automatically (65 characters per part, 80₮ per part).
 * - `Idempotency-Key` is a hash of number and text: when Auth retries the hook after a timeout,
 *   WeSend answers with the first send instead of texting the same code twice.
 * - Errors come back as `{ error: { code, message } }`; the code goes into the thrown message
 *   (and so into the function's logs), the API key never does.
 */
export function wesendGateway(apiKey: string, fetchImpl: typeof fetch = fetch): SmsGateway {
  return {
    async send(to, text, signal) {
      const local = to.replace(/^\+976/, '');
      const response = await fetchImpl(WESEND_SMS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': await idempotencyKey(local, text),
        },
        body: JSON.stringify({ to: local, text }),
        signal,
      });
      if (response.ok) return;
      throw new Error(`wesend ${response.status} ${await errorCode(response)}`);
    },
  };
}

/** `bairmair-<sha256 hex>` of number and text: printable ASCII, well under WeSend's 255. */
async function idempotencyKey(to: string, text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${to}\n${text}`));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'));
  return `bairmair-${hex.join('')}`;
}

/** WeSend's error code (`insufficient_credits`, `unsupported_number`, …), or `unknown`. */
async function errorCode(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown } };
    const code = body.error?.code;
    return typeof code === 'string' && /^[a-z_]{1,64}$/.test(code) ? code : 'unknown';
  } catch {
    return 'unknown';
  }
}
