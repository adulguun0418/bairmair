'use client';

import { useEffect, type RefObject } from 'react';

/** Closes a menu on Escape or on a press outside `ref`. */
export function useDismiss(
  open: boolean,
  close: () => void,
  ref: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close, ref]);
}
