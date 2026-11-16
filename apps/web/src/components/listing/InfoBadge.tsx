'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useDismiss } from '@/components/header/use-dismiss';
import { InfoIcon } from '@/components/icons';
import { track } from '@/lib/analytics';
import { openSpace } from './space-signal';

/**
 * A badge ("3D загвартай", "Байран дээр нь скан хийсэн") that explains itself: a tap opens a
 * short note below it. A hover title only works with a mouse; most visitors arrive on phones.
 */
export function InfoBadge({
  badge,
  className,
  label,
  info,
  spaceLink,
  children,
}: {
  /** For analytics. */
  badge: '3d' | 'verified';
  /** The badge's colours. */
  className: string;
  /** Screen-reader name of the ⓘ ("Тайлбар"). */
  label: string;
  info: string;
  /** Optional button under the note that scrolls to "Орон зай". */
  spaceLink?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, ref);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          if (!open) track('badge_info_opened', { badge });
          setOpen((value) => !value);
        }}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium ${className}`}
      >
        {children}
        <InfoIcon className="size-3.5 opacity-70" />
        <span className="sr-only">{label}</span>
      </button>
      {open && (
        <span
          role="note"
          className="absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] space-y-2 rounded-2xl bg-surface p-4 text-sm leading-relaxed text-fg-2 shadow-xl ring-1 ring-line"
        >
          <span className="block">{info}</span>
          {spaceLink && (
            <button
              type="button"
              onClick={() => {
                close();
                openSpace('3d');
              }}
              className="font-semibold text-accent hover:underline"
            >
              {spaceLink} →
            </button>
          )}
        </span>
      )}
    </span>
  );
}
