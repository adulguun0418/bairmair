import type { SmsGateway } from './handler.ts';

/**
 * Picks the SMS gateway from the function's secrets. `SMS_GATEWAY` names the adapter.
 * The Mongolian gateway adapter is added once the gateway is chosen; until then real numbers get
 * a clear error and only Auth's test numbers (which skip the hook) can sign in.
 */
export function gatewayFromEnv(env: (name: string) => string | undefined): SmsGateway {
  const name = env('SMS_GATEWAY');
  switch (name) {
    case undefined:
    case '':
      return notConfigured('SMS_GATEWAY is not set');
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
