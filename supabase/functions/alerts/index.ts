// Deno entry point of the `alerts` Edge Function. The logic is in handler.ts (unit-tested with
// Vitest). Deploy with JWT verification off: the database calls it through pg_net without a token,
// and the function only sends alerts that are really pending.
import { alertMailerFromEnv } from '../_shared/resend.ts';
import { serviceCredentials } from '../_shared/service.ts';
import { createAlertsHandler, supabaseAlertQueue } from './handler.ts';

const env = (name: string) => Deno.env.get(name);
const credentials = serviceCredentials(env);

Deno.serve(
  createAlertsHandler({
    queue: credentials ? supabaseAlertQueue(credentials) : null,
    mailer: alertMailerFromEnv(env),
    log: (event, fields) => console.log(JSON.stringify({ event, ...fields })),
  }),
);
