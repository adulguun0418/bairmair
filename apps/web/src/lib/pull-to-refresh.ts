/**
 * Pull-to-refresh for the site opened from the home screen.
 *
 * Safari's own pull-to-refresh is part of its browser UI; a home-screen web app (standalone
 * display) has no browser UI, so the gesture is gone. `PullToRefresh` puts it back there only.
 * This module holds the pure parts: when we are standalone, how far the indicator follows the
 * finger, and which way a drag is going.
 */

export const PULL = {
  /** Indicator offset (px) at which letting go refreshes. */
  threshold: 64,
  /** The indicator never travels further than this (px). */
  max: 112,
  /** The indicator moves this much per pixel of finger travel (resistance, like Safari). */
  resistance: 0.55,
  /** Finger travel (px) before a drag counts as vertical or horizontal. */
  slop: 8,
} as const;

/** True in a home-screen web app: iOS (`navigator.standalone`) or the standard display mode. */
export function isStandaloneDisplay(win: {
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: object;
}): boolean {
  // `standalone` is Safari-only and missing from the DOM types.
  if ((win.navigator as { standalone?: unknown } | undefined)?.standalone === true) return true;
  return win.matchMedia?.(STANDALONE_QUERY).matches ?? false;
}

export const STANDALONE_QUERY = '(display-mode: standalone), (display-mode: fullscreen)';

/** How far the indicator sits below its resting place for a finger moved `dy` px down. */
export function pullOffset(dy: number): number {
  if (dy <= 0) return 0;
  return Math.min(PULL.max, Math.round(dy * PULL.resistance));
}

export type PullPhase = 'pulling' | 'ready';

/** Whether letting go at this offset refreshes. */
export function pullPhase(offset: number): PullPhase {
  return offset >= PULL.threshold ? 'ready' : 'pulling';
}

/**
 * The fate of a drag that began at the top of the page, given the finger's travel so far.
 * `pull`: a downward drag, ours. `cancel`: sideways (a photo strip) or upward (normal scrolling).
 * `undecided`: not far enough to tell.
 */
export function dragIntent(dx: number, dy: number): 'pull' | 'cancel' | 'undecided' {
  if (Math.abs(dx) < PULL.slop && Math.abs(dy) < PULL.slop) return 'undecided';
  if (dy > 0 && dy >= Math.abs(dx)) return 'pull';
  return 'cancel';
}

/**
 * Whether a CSS `touch-action` value leaves vertical panning to the page. Elements that take
 * vertical drags themselves (`none`, `pan-x`, a plan you draw lines on) must keep them.
 */
export function allowsVerticalPan(touchAction: string): boolean {
  const value = touchAction.trim();
  if (value === '' || value === 'auto' || value === 'manipulation') return true;
  return value.split(/\s+/).some((part) => part === 'pan-y' || part === 'pan-down');
}
