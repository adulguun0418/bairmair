// Deno entry point of the Send SMS auth hook. The logic is in handler.ts (unit-tested with Vitest).
// Deploy with JWT verification off: Auth signs the request with the hook secret instead.
import { Webhook } from 'npm:standardwebhooks@1.1.1';
import { smsSpikeCheckFromEnv } from './alerts.ts';
import { gatewayFromEnv } from './gateways.ts';
import { createSendSmsHandler } from './handler.ts';
import { smsLimiterFromEnv } from './limits.ts';

const secret = Deno.env.get('SEND_SMS_HOOK_SECRET');
if (!secret) throw new Error('SEND_SMS_HOOK_SECRET is not set');

// Auth shows the secret as "v1,whsec_<base64>"; the library wants the base64 part.
const webhook = new Webhook(secret.replace(/^v1,whsec_/, ''));

const limiter = smsLimiterFromEnv((name) => Deno.env.get(name));
if (!limiter) console.log(JSON.stringify({ event: 'sms_limit_disabled' }));

const log = (event: string, fields?: Record<string, unknown>) =>
  console.log(JSON.stringify({ event, ...fields }));

// The SMS spike email (needs RESEND_API_KEY and SMS_ALERT_EMAIL as function secrets).
const spikeCheck = smsSpikeCheckFromEnv((name) => Deno.env.get(name), log);
if (!spikeCheck) log('sms_alert_disabled');

Deno.serve(
  createSendSmsHandler({
    verify: (body, headers) => webhook.verify(body, headers),
    gateway: gatewayFromEnv((name) => Deno.env.get(name)),
    limiter,
    afterClaim: spikeCheck,
    // Supabase's background tasks: the function stays alive until the check is done.
    background: (task) => EdgeRuntime.waitUntil(task),
    log,
  }),
);
