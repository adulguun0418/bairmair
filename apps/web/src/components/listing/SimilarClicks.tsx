'use client';

import type { ReactNode } from 'react';
import { track } from '@/lib/analytics';

/**
 * Tracks which similar listing a visitor opens (and its position), around the server-rendered
 * cards. Each card carries `data-listing-id`.
 */
export function SimilarClicks({ listingId, children }: { listingId: string; children: ReactNode }) {
  return (
    <div
      onClickCapture={(click) => {
        const target = click.target as Element;
        if (!target.closest('a')) return;
        const card = target.closest<HTMLElement>('[data-listing-id]');
        const targetId = card?.dataset.listingId;
        if (!card || !targetId) return;
        const cards = [...click.currentTarget.querySelectorAll('[data-listing-id]')];
        track('similar_listing_clicked', {
          listing_id: listingId,
          target_id: targetId,
          position: cards.indexOf(card) + 1,
        });
      }}
    >
      {children}
    </div>
  );
}
