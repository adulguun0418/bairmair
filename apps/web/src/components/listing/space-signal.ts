/**
 * The photo hero and the "Орон зай" section are separate client components on a server page.
 * The hero's 3D and plan buttons reach the section through this small signal: the section
 * switches to the requested view (and starts loading 3D), and the page scrolls to it.
 */

export type SpaceView = '3d' | 'plan';

/** Anchor of the space section (`#space`). */
export const SPACE_ID = 'space';

const listeners = new Set<(view: SpaceView) => void>();

/** Shows `view` in the space section and scrolls to it. */
export function openSpace(view: SpaceView): void {
  for (const listener of listeners) listener(view);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document
    .getElementById(SPACE_ID)
    ?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
}

/** Subscribes the space section; returns the unsubscribe function. */
export function onOpenSpace(listener: (view: SpaceView) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
