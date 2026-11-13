'use client';

import { embedMessage, type EmbedEvent } from '@bairmair/browse';
import type { Locale } from '@bairmair/i18n';
import { computeMetrics, type RoomModelV1 } from '@bairmair/room-model';
import { FloorPlan } from '@bairmair/viewer';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { PhotoDialog, type ScenePhoto } from '../viewer/PhotoDialog';
import { useSceneState } from '../viewer/use-scene-state';
import { useViewerText } from '../viewer/use-viewer-text';

const RoomViewer3D = dynamic(
  () => import('@bairmair/viewer/3d').then((module) => module.RoomViewer3D),
  { ssr: false },
);

interface ReactNativeWindow {
  ReactNativeWebView?: { postMessage(message: string): void };
}

/** Tells the mobile app's WebView how the page went. Does nothing in a normal browser. */
export function useEmbedSignal(event: EmbedEvent, listingId: string) {
  useEffect(() => {
    (window as ReactNativeWindow).ReactNativeWebView?.postMessage(embedMessage(event, listingId));
  }, [event, listingId]);
}

/** Sends a signal for pages that render no viewer (missing listing, no model). */
export function EmbedSignal({ event, listingId }: { event: EmbedEvent; listingId: string }) {
  useEmbedSignal(event, listingId);
  return null;
}

/**
 * A listing's 3D view filling the screen, for the mobile app's WebView: 3D or floor plan, a
 * strip of rooms with their areas underneath, and photos opening from their hotspots.
 */
export function ListingEmbed({
  listingId,
  locale,
  model,
  photos,
}: {
  listingId: string;
  locale: Locale;
  model: RoomModelV1;
  photos: ScenePhoto[];
}) {
  useEmbedSignal('ready', listingId);
  const { t, text } = useViewerText(locale);
  const metrics = useMemo(() => computeMetrics(model), [model]);
  const { rooms, selectedRoomId, toggleRoom, showPhoto, dialog } = useSceneState(
    model,
    photos,
    text,
  );
  const [view, setView] = useState<'3d' | 'plan'>('3d');

  const viewButton = (value: '3d' | 'plan', label: string) => (
    <button
      type="button"
      aria-pressed={view === value}
      onClick={() => setView(value)}
      className={`rounded-full px-4 py-1.5 text-sm ${
        view === value ? 'bg-surface font-medium shadow-sm' : 'text-fg-muted'
      }`}
    >
      {label}
    </button>
  );

  return (
    // Fixed to the viewport: no page scroll or rubber-banding fights the 3D gestures.
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-surface-2 select-none">
      <div className="relative min-h-0 flex-1">
        {/* The 3D view stays mounted on the plan tab, so the camera is where the user left it. */}
        <section
          aria-label={t('viewer.label')}
          className={`${view === '3d' ? '' : 'hidden'} h-full bg-gradient-to-b from-scene-from to-scene-to`}
        >
          <RoomViewer3D
            model={model}
            text={text}
            selectedRoomId={selectedRoomId}
            onSelectRoom={toggleRoom}
            onSelectPhoto={showPhoto}
          />
        </section>
        {view === 'plan' && (
          <section aria-label={t('viewer.viewPlan')} className="h-full bg-surface p-3 pt-16">
            <FloorPlan
              model={model}
              text={text}
              title={t('viewer.viewPlan')}
              selectedRoomId={selectedRoomId}
              onSelectRoom={toggleRoom}
              onSelectPhoto={showPhoto}
              className="h-full w-full [&>svg]:h-full [&>svg]:w-full"
            />
          </section>
        )}
        <div className="absolute top-3 left-3 inline-flex rounded-full bg-surface-3/90 p-1 shadow-sm">
          {viewButton('3d', t('viewer.view3d'))}
          {viewButton('plan', t('viewer.viewPlan'))}
        </div>
      </div>

      <section
        aria-label={t('viewer.rooms')}
        className="border-t border-line bg-surface pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="flex gap-2 overflow-x-auto px-3 pt-3 pb-2">
          {metrics.rooms.map(({ id, areaM2 }) => {
            const room = rooms.get(id);
            if (!room) return null;
            const selected = id === selectedRoomId;
            return (
              <li key={id} className="shrink-0">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleRoom(id)}
                  className={`rounded-xl px-3 py-1.5 text-left ${
                    selected ? 'bg-accent-soft' : 'bg-surface-2'
                  }`}
                >
                  <span className="block text-sm font-medium whitespace-nowrap">
                    {text.roomName(room)}
                  </span>
                  <span className="block text-xs text-fg-muted">{text.area(areaM2)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="flex justify-between gap-3 px-4 pb-3 text-sm">
          <span>
            <span className="font-medium">{t('viewer.totalArea')}</span>{' '}
            {text.area(metrics.totalAreaM2)}
          </span>
          <span className="text-fg-subtle">{t('viewer.approximateScanned')}</span>
        </p>
      </section>

      <PhotoDialog {...dialog} closeLabel={t('viewer.closePhoto')} />
    </div>
  );
}
