'use client';

import type { ReactNode } from 'react';
import { track, type AnalyticsEvents } from '@/lib/analytics';

/**
 * Sends an analytics event when a link inside is clicked, so server-rendered links can be
 * tracked without becoming client components themselves.
 */
export function TrackClick<E extends keyof AnalyticsEvents>({
  event,
  properties,
  className,
  children,
}: {
  event: E;
  properties: AnalyticsEvents[E];
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={className}
      onClickCapture={(click) => {
        if ((click.target as Element).closest('a')) track(event, properties);
      }}
    >
      {children}
    </div>
  );
}
