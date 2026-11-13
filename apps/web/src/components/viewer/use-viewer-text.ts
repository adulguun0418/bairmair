'use client';

import { createTranslator, formatArea, roomDisplayName, type Locale } from '@bairmair/i18n';
import type { ViewerText } from '@bairmair/viewer';
import { useMemo } from 'react';

/** The translator and the viewer's localized labels, for the 3D view and the floor plan. */
export function useViewerText(locale: Locale) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const text = useMemo<ViewerText>(
    () => ({
      roomName: (room) => roomDisplayName(t, room),
      area: (squareMeters) => formatArea(squareMeters, locale),
      photo: (index, room) => t('viewer.photoInRoom', { index, room: roomDisplayName(t, room) }),
      resetView: t('viewer.resetView'),
      hint: t('viewer.hint'),
      webglUnavailable: t('viewer.webglUnavailable'),
    }),
    [t, locale],
  );
  return { t, text };
}
