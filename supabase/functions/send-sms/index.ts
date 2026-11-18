// Deno entry point of the Send SMS auth hook. The logic is in handler.ts (unit-tested with Vitest).
// Deploy with JWT verification off: Auth signs the request with the hook secret instead.
import { Webhook } from 'npm:standardwebhooks@1.1.1';
import { gatewayFromEnv } from './gateways.ts';
import { createSendSmsHandler } from './handler.ts';
import { smsLimiterFromEnv } from './limits.ts';

const secret = Deno.env.get('SEND_SMS_HOOK_SECRET');
if (!secret) throw new Error('SEND_SMS_HOOK_SECRET is not set');

// Auth shows the secret as "v1,whsec_<base64>"; the library wants the base64 part.
const webhook = new Webhook(secret.replace(/^v1,whsec_/, ''));

const limiter = smsLimiterFromEnv((name) => Deno.env.get(name));
if (!limiter) console.log(JSON.stringify({ event: 'sms_limit_disabled' }));

Deno.serve(
  createSendSmsHandler({
    verify: (body, headers) => webhook.verify(body, headers),
    gateway: gatewayFromEnv((name) => Deno.env.get(name)),
    limiter,
    log: (event, fields) => console.log(JSON.stringify({ event, ...fields })),
  }),
);
