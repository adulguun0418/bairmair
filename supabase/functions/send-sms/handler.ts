/**
 * Supabase Auth "Send SMS" hook. Auth calls this, signed with Standard Webhooks, whenever it
 * needs to text an OTP, instead of using a built-in SMS provider. Test phone numbers configured
 * in Auth never reach the hook.
 *
 * No Deno APIs here, so Vitest can run it; index.ts wires it to Deno.serve.
 */

export interface SmsGateway {
  /** Sends `text` to `to` (E.164, e.g. "+97699112233"). Throws on failure. */
  send(to: string, text: string, signal: AbortSignal): Promise<void>;
}

export interface SendSmsDeps {
  /** Verifies the Standard Webhooks signature and returns the parsed payload. Throws if invalid. */
  verify(body: string, headers: Record<string, string>): unknown;
  gateway: SmsGateway;
  /** Auth waits 5 s for the hook in total, so the gateway call must finish sooner. */
  gatewayTimeoutMs?: number;
  log?: (event: string, fields?: Record<string, unknown>) => void;
}

export interface OtpRequest {
  /** E.164 */
  phone: string;
  otp: string;
}

/**
 * Reads the hook payload: `{ user: { phone }, sms: { otp, phone? } }`. On a phone-number change
 * `sms.phone` is the new number and `user.phone` the old one, so `sms.phone` wins.
 * Auth sends numbers without the leading '+'.
 */
export function parseOtpRequest(payload: unknown): OtpRequest | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const { user, sms } = payload as {
    user?: { phone?: unknown };
    sms?: { otp?: unknown; phone?: unknown };
  };
  const otp = sms?.otp;
  const rawPhone = typeof sms?.phone === 'string' && sms.phone !== '' ? sms.phone : user?.phone;
  if (typeof otp !== 'string' || !/^\d{4,10}$/.test(otp)) return null;
  if (typeof rawPhone !== 'string') return null;
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length < 8) return null;
  return { phone: `+${digits}`, otp };
}

/** Mongolian numbers: +976 and 8 digits. The local gateway reaches only these. */
export function isMongolianNumber(e164: string): boolean {
  return /^\+976\d{8}$/.test(e164);
}

/**
 * The SMS text. Cyrillic makes the whole message unicode, and WeSend fits 65 unicode characters
 * in one part (each part is billed); keep it under that. iOS and Android offer the code for
 * autofill when the text says "код".
 */
export function otpMessage(otp: string): string {
  return `Bairmair код: ${otp}. Хэнд ч бүү хэлээрэй.`;
}

/** "+97699112233" -> "+976991****3", for logs. Never log the OTP. */
export function maskPhone(e164: string): string {
  return e164.length <= 8 ? '****' : `${e164.slice(0, 7)}****${e164.slice(-1)}`;
}

/**
 * An error Auth passes on to the app: HTTP 200 with `{ error: { http_code, message } }`.
 * Auth reads the error body only from a 200 response; any other status becomes a generic
 * "Unexpected status code returned from hook" and the reason is lost.
 */
function hookError(httpCode: number, message: string): Response {
  return Response.json({ error: { http_code: httpCode, message } }, { status: 200 });
}

/** A rejection for callers that are not Auth (wrong method, bad signature). */
function reject(status: number, message: string): Response {
  return Response.json({ error: { http_code: status, message } }, { status });
}

export function createSendSmsHandler(deps: SendSmsDeps): (req: Request) => Promise<Response> {
  const log = deps.log ?? (() => {});
  const timeoutMs = deps.gatewayTimeoutMs ?? 4000;

  return async (req) => {
    if (req.method !== 'POST') return reject(405, 'method_not_allowed');

    const body = await req.text();
    let payload: unknown;
    try {
      payload = deps.verify(body, Object.fromEntries(req.headers));
    } catch {
      log('invalid_signature');
      return reject(401, 'invalid_signature');
    }

    const request = parseOtpRequest(payload);
    if (!request) {
      log('invalid_payload');
      return hookError(400, 'invalid_payload');
    }
    if (!isMongolianNumber(request.phone)) {
      log('unsupported_phone_number', { phone: maskPhone(request.phone) });
      return hookError(400, 'unsupported_phone_number');
    }

    try {
      await deps.gateway.send(
        request.phone,
        otpMessage(request.otp),
        AbortSignal.timeout(timeoutMs),
      );
    } catch (error) {
      log('sms_send_failed', {
        phone: maskPhone(request.phone),
        reason: error instanceof Error ? error.message : String(error),
      });
      return hookError(500, 'sms_send_failed');
    }

    log('sms_sent', { phone: maskPhone(request.phone) });
    return Response.json({});
  };
}
