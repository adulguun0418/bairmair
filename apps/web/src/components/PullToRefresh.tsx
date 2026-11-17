'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  PULL,
  STANDALONE_QUERY,
  allowsVerticalPan,
  dragIntent,
  isStandaloneDisplay,
  pullOffset,
  pullPhase,
  type PullPhase,
} from '@/lib/pull-to-refresh';

type Phase = 'idle' | PullPhase | 'refreshing';

/** Indicator offset while the page reloads. */
const REST = 72;
/** Idle position: the 40 px disc and its shadow just above the top edge. */
const HIDDEN = -52;

/**
 * Elements whose drags are not ours: the 3D view, maps, dialogs and sheets (they scroll or close
 * on their own), and form fields. `data-no-pull` opts any other element out.
 */
const BLOCKERS =
  'canvas, .maplibregl-map, dialog, [role="dialog"], [aria-modal="true"], input, textarea, select, [data-no-pull]';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(STANDALONE_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * Pull down at the top of the page to reload it, in the home-screen web app only: there iOS shows
 * no browser UI, so Safari's own pull-to-refresh is missing. In a browser tab it renders nothing.
 *
 * The listeners are passive: the page keeps its native bounce, and sideways swipes (photo strips)
 * are never blocked. The indicator follows the finger; letting go past the threshold reloads.
 */
export function PullToRefresh({ refreshingLabel }: { refreshingLabel: string }) {
  const standalone = useSyncExternalStore(
    subscribe,
    () => isStandaloneDisplay(window),
    () => false,
  );
  return standalone ? <PullIndicator refreshingLabel={refreshingLabel} /> : null;
}

function PullIndicator({ refreshingLabel }: { refreshingLabel: string }) {
  const discRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<SVGSVGElement>(null);
  const phaseRef = useRef<Phase>('idle');
  const [phase, setPhase] = useState<Phase>('idle');

  useEffect(() => {
    const disc = discRef.current;
    if (!disc) return;

    let start: { x: number; y: number } | null = null;
    let pulling = false;

    const changePhase = (next: Phase) => {
      if (phaseRef.current === next) return;
      phaseRef.current = next;
      setPhase(next);
    };

    // Written straight to the DOM: a React render per touchmove would be wasted work.
    const place = (offset: number, animate: boolean) => {
      disc.style.transition = animate ? 'transform 200ms ease-out, opacity 200ms ease-out' : 'none';
      disc.style.transform = `translate(-50%, ${HIDDEN + offset}px)`;
      disc.style.opacity = String(Math.min(1, offset / 32));
      const arrow = arrowRef.current;
      if (arrow) arrow.style.transform = `rotate(${Math.min(1, offset / PULL.threshold) * 180}deg)`;
    };

    const settle = () => {
      start = null;
      pulling = false;
      place(0, true);
      changePhase('idle');
    };

    const onStart = (event: TouchEvent) => {
      start = null;
      pulling = false;
      const touch = event.touches.length === 1 ? event.touches[0] : undefined;
      if (phaseRef.current === 'refreshing' || !touch) return;
      // Not at the top, or a menu or sheet has locked the page.
      if (window.scrollY > 0 || document.body.style.overflow === 'hidden') return;
      if (!pullAllowedFrom(event.target)) return;
      start = { x: touch.clientX, y: touch.clientY };
    };

    const onMove = (event: TouchEvent) => {
      if (!start) return;
      const touch = event.touches.length === 1 ? event.touches[0] : undefined;
      if (!touch) {
        settle();
        return;
      }
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;
      if (!pulling) {
        const intent = dragIntent(dx, dy);
        if (intent === 'undecided') return;
        if (intent === 'cancel') {
          start = null;
          return;
        }
        pulling = true;
      }
      const offset = pullOffset(dy);
      place(offset, false);
      changePhase(offset === 0 ? 'idle' : pullPhase(offset));
    };

    const onEnd = () => {
      if (!pulling) {
        start = null;
        return;
      }
      if (phaseRef.current !== 'ready' || navigator.onLine === false) {
        // Offline, a reload would leave a home-screen app on an error page with no way back.
        settle();
        return;
      }
      start = null;
      pulling = false;
      changePhase('refreshing');
      place(REST, true);
      // Let the spinner paint before the page goes away.
      window.setTimeout(() => window.location.reload(), 150);
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', settle, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', settle);
    };
  }, []);

  return (
    <>
      <div
        ref={discRef}
        aria-hidden
        className="pointer-events-none fixed top-0 left-1/2 z-50 flex size-10 items-center justify-center rounded-full border border-line bg-surface shadow-lg"
        style={{ transform: `translate(-50%, ${HIDDEN}px)`, opacity: 0 }}
      >
        {phase === 'refreshing' ? (
          <span className="size-5 animate-spin rounded-full border-2 border-brand border-t-transparent" />
        ) : (
          <svg
            ref={arrowRef}
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={phase === 'ready' ? 'text-primary' : 'text-brand'}
          >
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
        )}
      </div>
      <p role="status" className="sr-only">
        {phase === 'refreshing' ? refreshingLabel : ''}
      </p>
    </>
  );
}

/** Whether a drag starting on `target` may pull the page (see `BLOCKERS`). */
function pullAllowedFrom(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return true;
  if (target.closest(BLOCKERS)) return false;
  for (let el: Element | null = target; el && el !== document.body; el = el.parentElement) {
    const style = getComputedStyle(el);
    // An element that takes vertical drags itself (the plan you draw dividers on).
    if (!allowsVerticalPan(style.touchAction)) return false;
    // Inside a box scrolled away from its top: the drag scrolls that box back up.
    if (el.scrollTop > 0 && /auto|scroll/.test(style.overflowY)) return false;
  }
  return true;
}
