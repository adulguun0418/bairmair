/**
 * When to look for an over-the-air update and when to offer the restart. Pure, so it is tested
 * without the native module (`app-update.tsx` wires it to expo-updates).
 */

/** At most one foreground check per this interval (the launch check counts too). */
export const FOREGROUND_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** Should coming back to the foreground start a check? */
export function shouldCheckOnForeground(lastCheck: Date | undefined, busy: boolean, now: Date) {
  if (busy) return false;
  if (!lastCheck) return true;
  return now.getTime() - lastCheck.getTime() >= FOREGROUND_CHECK_INTERVAL_MS;
}

/**
 * Screens where a restart would lose work the phone has not saved: the scanners (a capture lives
 * only in memory until it is exported). The banner waits until the seller leaves them.
 */
export function isBusyRoute(segments: readonly string[]): boolean {
  const last = segments[segments.length - 1];
  return last === 'scan';
}

/**
 * Show the banner for a downloaded update, unless the visitor dismissed this one (a newer
 * download shows it again) or is on a screen where a restart would lose work.
 */
export function shouldShowBanner(input: {
  pendingUpdateId: string | undefined;
  dismissedUpdateId: string | null;
  segments: readonly string[];
}): boolean {
  const { pendingUpdateId, dismissedUpdateId, segments } = input;
  if (!pendingUpdateId) return false;
  if (pendingUpdateId === dismissedUpdateId) return false;
  return !isBusyRoute(segments);
}
