import { describe, expect, it } from 'vitest';
import {
  FOREGROUND_CHECK_INTERVAL_MS,
  isBusyRoute,
  shouldCheckOnForeground,
  shouldShowBanner,
} from '../src/lib/app-update-logic';

describe('shouldCheckOnForeground', () => {
  const now = new Date('2026-11-18T10:00:00Z');

  it('checks when nothing has been checked yet', () => {
    expect(shouldCheckOnForeground(undefined, false, now)).toBe(true);
  });

  it('waits for the interval after the last check', () => {
    const recent = new Date(now.getTime() - FOREGROUND_CHECK_INTERVAL_MS + 1000);
    const old = new Date(now.getTime() - FOREGROUND_CHECK_INTERVAL_MS);
    expect(shouldCheckOnForeground(recent, false, now)).toBe(false);
    expect(shouldCheckOnForeground(old, false, now)).toBe(true);
  });

  it('does not start a second check while one is running or downloading', () => {
    expect(shouldCheckOnForeground(undefined, true, now)).toBe(false);
  });
});

describe('isBusyRoute', () => {
  it('flags the scanners', () => {
    expect(isBusyRoute(['listings', '[id]', 'scan'])).toBe(true);
    expect(isBusyRoute(['scan'])).toBe(true);
  });

  it('lets other screens through', () => {
    expect(isBusyRoute([])).toBe(false);
    expect(isBusyRoute(['(tabs)', '(search)', 'index'])).toBe(false);
    expect(isBusyRoute(['scan-test'])).toBe(false);
    expect(isBusyRoute(['scans', '[id]'])).toBe(false);
  });
});

describe('shouldShowBanner', () => {
  const segments = ['(tabs)', '(search)'];

  it('shows a downloaded update', () => {
    expect(shouldShowBanner({ pendingUpdateId: 'a', dismissedUpdateId: null, segments })).toBe(
      true,
    );
  });

  it('hides without a downloaded update', () => {
    expect(
      shouldShowBanner({ pendingUpdateId: undefined, dismissedUpdateId: null, segments }),
    ).toBe(false);
  });

  it('stays hidden after "later" for that update, but returns for a newer one', () => {
    expect(shouldShowBanner({ pendingUpdateId: 'a', dismissedUpdateId: 'a', segments })).toBe(
      false,
    );
    expect(shouldShowBanner({ pendingUpdateId: 'b', dismissedUpdateId: 'a', segments })).toBe(true);
  });

  it('waits while the seller is scanning', () => {
    expect(
      shouldShowBanner({
        pendingUpdateId: 'a',
        dismissedUpdateId: null,
        segments: ['listings', '[id]', 'scan'],
      }),
    ).toBe(false);
  });
});
