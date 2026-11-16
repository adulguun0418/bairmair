'use client';

import type { ListingPhoto } from '@bairmair/browse';
import type { Locale } from '@bairmair/i18n';
import { computeMetrics, type RoomModelV1 } from '@bairmair/room-model';
import { FloorPlan } from '@bairmair/viewer';
import dynamic from 'next/dynamic';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { CameraIcon, CubeIcon, PlanIcon } from '@/components/icons';
import { PhotoDialog, type ScenePhoto } from '@/components/viewer/PhotoDialog';
import { useSceneState } from '@/components/viewer/use-scene-state';
import { useViewerText } from '@/components/viewer/use-viewer-text';
import { track } from '@/lib/analytics';
import { ListingGallery } from './ListingGallery';

// three.js is large and needs WebGL: loaded in the browser, after the page itself.
const RoomViewer3D = dynamic(
  () => import('@bairmair/viewer/3d').then((module) => module.RoomViewer3D),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center">
        <span className="size-10 animate-spin rounded-full border-2 border-[#1a2b60]/15 border-t-[#199ed6]" />
      </div>
    ),
  },
);

type Tab = 'photos' | '3d' | 'plan';

/**
 * The listing's media in one full-width frame with tabs: the 3D model, the floor plan and the
 * photos. A scanned listing opens on its 3D model (the platform's point); without a scan only
 * the photos show. 3D and plan share the selected room, and the strip of rooms under them
 * (with areas) selects rooms too. Photos placed in a room open from the 3D markers.
 */
export function ListingMedia({
  listingId,
  locale,
  photos,
  model,
}: {
  listingId: string;
  locale: Locale;
  photos: ListingPhoto[];
  /** With the seller's room labels and photo rooms applied; null without a scan. */
  model: RoomModelV1 | null;
}) {
  const { t } = useViewerText(locale);
  const [tab, setTab] = useState<Tab>(model ? '3d' : 'photos');
  const tabs: { value: Tab; label: string; icon: ReactNode }[] = [
    ...(model
      ? [
          { value: '3d' as const, label: t('viewer.view3d'), icon: <CubeIcon /> },
          { value: 'plan' as const, label: t('viewer.viewPlan'), icon: <PlanIcon /> },
        ]
      : []),
    {
      value: 'photos',
      label:
        photos.length > 0
          ? `${t('listingPage.sections.photos')} · ${photos.length}`
          : t('listingPage.sections.photos'),
      icon: <CameraIcon />,
    },
  ];

  return (
    <section aria-label={t('listingPage.sections.photos')} className="space-y-3">
      {model && (
        <div role="tablist" className="inline-flex rounded-full bg-surface p-1 ring-1 ring-line">
          {tabs.map(({ value, label, icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => {
                if (value !== tab)
                  track('listing_media_tab', { listing_id: listingId, tab: value });
                setTab(value);
              }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition [&>svg]:size-[18px] ${
                tab === value ? 'bg-primary text-on-primary shadow-sm' : 'text-fg-2 hover:text-fg'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      )}

      <div>
        {tab === 'photos' || !model ? (
          <div className="h-[min(50vh,24rem)] overflow-hidden rounded-3xl sm:h-[min(62vh,34rem)] sm:min-h-72">
            <ListingGallery
              photos={photos}
              locale={locale}
              onOpen={() =>
                track('listing_photo_opened', { listing_id: listingId, from: 'gallery' })
              }
            />
          </div>
        ) : (
          <Scene listingId={listingId} locale={locale} model={model} photos={photos} view={tab} />
        )}
      </div>
    </section>
  );
}

function Scene({
  listingId,
  locale,
  model,
  photos,
  view,
}: {
  listingId: string;
  locale: Locale;
  model: RoomModelV1;
  photos: ListingPhoto[];
  view: '3d' | 'plan';
}) {
  const { t, text } = useViewerText(locale);
  const scenePhotos = useMemo<ScenePhoto[]>(
    () =>
      photos.flatMap((photo) =>
        photo.roomId ? [{ id: photo.id, roomId: photo.roomId, src: photo.src }] : [],
      ),
    [photos],
  );
  const metrics = useMemo(() => computeMetrics(model), [model]);
  const { rooms, selectedRoomId, toggleRoom, showPhoto, dialog } = useSceneState(
    model,
    scenePhotos,
    text,
  );
  const openHotspot = (photoId: string) => {
    track('listing_photo_opened', { listing_id: listingId, from: 'hotspot' });
    showPhoto(photoId);
  };
  const interacted = useRef(false);
  const onInteract = () => {
    if (interacted.current) return;
    interacted.current = true;
    track('listing_3d_interacted', { listing_id: listingId });
  };

  return (
    <div className="overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
      <div className="relative h-[min(50vh,24rem)] sm:h-[min(62vh,34rem)] sm:min-h-72">
        {view === '3d' ? (
          <div className="h-full bg-gradient-to-b from-scene-from to-scene-to">
            <RoomViewer3D
              model={model}
              text={text}
              selectedRoomId={selectedRoomId}
              onSelectRoom={toggleRoom}
              onSelectPhoto={openHotspot}
              onInteract={onInteract}
              pageScroll
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center bg-white p-4">
            <FloorPlan
              model={model}
              text={text}
              title={t('viewer.viewPlan')}
              selectedRoomId={selectedRoomId}
              onSelectRoom={toggleRoom}
              onSelectPhoto={openHotspot}
              className="h-full w-full"
            />
          </div>
        )}
      </div>

      {/* The rooms with their areas; one tap selects a room in both views. */}
      <div className="flex items-center gap-2 overflow-x-auto border-t border-line px-3 py-3">
        {metrics.rooms.map(({ id, areaM2 }) => {
          const room = rooms.get(id);
          if (!room) return null;
          const selected = id === selectedRoomId;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              onClick={() => toggleRoom(id)}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-left text-sm ring-1 transition ${
                selected
                  ? 'bg-accent-subtle text-on-accent-soft ring-accent/50'
                  : 'bg-surface ring-line hover:ring-line-2'
              }`}
            >
              <span className="block font-medium">{text.roomName(room)}</span>
              <span className="block text-xs text-fg-muted">{text.area(areaM2)}</span>
            </button>
          );
        })}
        <span className="ml-auto shrink-0 pl-3 text-right">
          <span className="block text-sm font-semibold">
            {t('viewer.totalArea')}: {text.area(metrics.totalAreaM2)}
          </span>
          <span className="block text-xs text-fg-subtle">{t('viewer.approximateScanned')}</span>
          {(model?.dividers?.length ?? 0) > 0 && (
            <span className="block text-xs text-fg-subtle">{t('viewer.dividerNote')}</span>
          )}
        </span>
      </div>
      <PhotoDialog {...dialog} closeLabel={t('viewer.closePhoto')} />
    </div>
  );
}
