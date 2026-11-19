import { randomInt } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { admin, anonClient } from './helpers';

// Migrations 20261121100000 (claim_sms_send) and 20261122100000 (claim_sms_alert /
// release_sms_alert): the send-sms hook's per-number limit and SMS spike alert. Both are for the
// hook's secret key only.
//
// The test records one code for a fake +976 0… number (no SMS is sent: only the hook texts, and
// the log row expires after a day). Alerts it claims are released again, so a real alert is
// never held back by the test's quiet period.

const anon = anonClient();

describe('SMS spike alert', () => {
  it('is closed to the public key', async () => {
    const claim = await anon.rpc('claim_sms_alert', { p_threshold: 1 });
    expect(claim.error?.code).toBe('42501');
    const release = await anon.rpc('release_sms_alert', { p_alert_id: 1 });
    expect(release.error?.code).toBe('42501');
    const send = await anon.rpc('claim_sms_send', { p_phone: '+97600000000' });
    expect(send.error?.code).toBe('42501');
  });

  it('is not due under the threshold', async () => {
    const { data, error } = await admin.rpc('claim_sms_alert', { p_threshold: 1000 });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('is due over the threshold, once per quiet period, and can be released', async () => {
    const phone = `+97600${String(randomInt(0, 1_000_000)).padStart(6, '0')}`;
    const recorded = await admin.rpc('claim_sms_send', { p_phone: phone });
    expect(recorded.error).toBeNull();
    expect(recorded.data).toBe(true);

    // Quiet period 0: due regardless of earlier (real) alerts.
    const first = await admin.rpc('claim_sms_alert', { p_threshold: 1, p_quiet_minutes: 0 });
    expect(first.error).toBeNull();
    const alert = first.data?.[0];
    expect(alert).toBeDefined();
    if (!alert) return;
    try {
      expect(alert.codes_last_hour).toBeGreaterThanOrEqual(1);
      expect(alert.numbers_last_hour).toBeGreaterThanOrEqual(1);
      expect(alert.numbers_last_hour).toBeLessThanOrEqual(alert.codes_last_hour);
      expect(alert.codes_last_day).toBeGreaterThanOrEqual(alert.codes_last_hour);

      // Just recorded, so not due again within a quiet period.
      const again = await admin.rpc('claim_sms_alert', { p_threshold: 1, p_quiet_minutes: 60 });
      expect(again.error).toBeNull();
      expect(again.data).toEqual([]);
    } finally {
      const released = await admin.rpc('release_sms_alert', { p_alert_id: alert.alert_id });
      expect(released.error).toBeNull();
    }
  });
});
