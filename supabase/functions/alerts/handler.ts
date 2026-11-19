/**
 * The `alerts` Edge Function: emails alerts the database queued in `private.alerts` (migration
 * `20261123100000_reveal_limits.sql`). The database calls it through pg_net when it records one.
 *
 * The request carries nothing: the function takes the pending alerts itself with the secret key,
 * so anyone calling it can at most make it send alerts that are really pending (deployed without
 * JWT verification, since pg_net has no user token). No Deno APIs here, so Vitest can run it.
 */

import type { Mailer } from '../_shared/resend.ts';
import { rpcCaller } from '../_shared/service.ts';

export interface AlertRow {
  id: number;
  kind: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface AlertQueue {
  /** Pending alerts, marked emailed. */
  take(signal: AbortSignal): Promise<AlertRow[]>;
  /** Marks an alert pending again (its email failed). */
  release(id: number, signal: AbortSignal): Promise<void>;
}

/** Hours between two alerts of a kind (`private.note_reveal_spike`). */
export const ALERT_QUIET_HOURS = 3;

const num = (value: unknown): number => (typeof value === 'number' ? value : 0);

export function alertEmail(alert: AlertRow): { subject: string; text: string } {
  if (alert.kind === 'reveals') return revealsEmail(alert.details);
  return {
    subject: `bairmair alert: ${alert.kind}`,
    text: `${alert.kind} at ${alert.created_at}\n\n${JSON.stringify(alert.details, null, 2)}`,
  };
}

function revealsEmail(d: Record<string, unknown>): { subject: string; text: string } {
  const total = num(d.reveals_last_hour);
  const budget = num(d.anon_budget);
  return {
    subject: `bairmair: ${total} phone numbers revealed in the last hour`,
    text: [
      `${total} seller phone numbers were revealed in the last hour (alert threshold: ${num(d.threshold)}).`,
      `- ${num(d.anonymous)} by visitors who were not signed in, from ${num(d.ip_addresses)} IP addresses`,
      `- ${num(d.signed_in)} by ${num(d.users)} signed-in users`,
      `- ${num(d.listings)} different listings; ${num(d.reveals_last_day)} reveals in the last 24 hours`,
      '',
      'Many IP addresses each revealing a few different listings looks like a scraper collecting ' +
        "sellers' numbers through rotating proxies.",
      '',
      `Limits now: anonymous visitors together ${budget} an hour (past that, they are asked to sign in); ` +
        'each IP address 10 an hour and 30 a day; each signed-in user 30 an hour.',
      '',
      'To require sign-in for every reveal now (Supabase dashboard → SQL Editor):',
      "  insert into private.settings (key, value) values ('anon_reveals_per_hour', '0')",
      '  on conflict (key) do update set value = excluded.value;',
      "Back to the default later: delete from private.settings where key = 'anon_reveals_per_hour';",
      'The apps need no update: they already show "sign in to see the number".',
      '',
      `The next alert comes at the earliest in ${ALERT_QUIET_HOURS} hours.`,
    ].join('\n'),
  };
}

export function createAlertsHandler(deps: {
  queue: AlertQueue | null;
  mailer: Mailer | null;
  timeoutMs?: number;
  log?: (event: string, fields?: Record<string, unknown>) => void;
}): (req: Request) => Promise<Response> {
  const log = deps.log ?? (() => {});
  const timeoutMs = deps.timeoutMs ?? 10_000;

  return async (req) => {
    if (req.method !== 'POST')
      return Response.json({ error: 'method_not_allowed' }, { status: 405 });
    const { queue, mailer } = deps;
    if (!queue || !mailer) {
      // Alerts stay pending; the next call after configuring sends them.
      log('alerts_not_configured');
      return Response.json({ error: 'not_configured' }, { status: 503 });
    }

    let alerts: AlertRow[];
    try {
      alerts = await queue.take(AbortSignal.timeout(timeoutMs));
    } catch (error) {
      log('alerts_take_failed', { reason: reason(error) });
      return Response.json({ error: 'take_failed' }, { status: 502 });
    }

    let sent = 0;
    let failed = 0;
    for (const alert of alerts) {
      try {
        await mailer.send(
          { ...alertEmail(alert), idempotencyKey: `alert-${alert.id}` },
          AbortSignal.timeout(timeoutMs),
        );
        sent += 1;
        log('alert_sent', { id: alert.id, kind: alert.kind });
      } catch (error) {
        failed += 1;
        log('alert_failed', { id: alert.id, kind: alert.kind, reason: reason(error) });
        try {
          await queue.release(alert.id, AbortSignal.timeout(timeoutMs));
        } catch (releaseError) {
          log('alert_release_failed', { id: alert.id, reason: reason(releaseError) });
        }
      }
    }
    return Response.json({ sent, failed });
  };
}

const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** `take_alerts` / `release_alert` through PostgREST with the project's secret key. */
export function supabaseAlertQueue(
  credentials: { url: string; key: string },
  fetchImpl: typeof fetch = fetch,
): AlertQueue {
  const call = rpcCaller(credentials, fetchImpl);
  return {
    async take(signal) {
      const rows: unknown = await (await call('take_alerts', {}, signal)).json();
      if (!Array.isArray(rows)) throw new Error('take_alerts: unexpected response');
      return rows.filter(
        (row): row is AlertRow =>
          typeof row === 'object' &&
          row !== null &&
          typeof (row as AlertRow).id === 'number' &&
          typeof (row as AlertRow).kind === 'string',
      );
    },
    async release(id, signal) {
      await call('release_alert', { p_alert_id: id }, signal);
    },
  };
}
