'use client';

import type { ListingPhoto } from '@bairmair/browse';
import type { Locale } from '@bairmair/i18n';
import { computeMetrics, type RoomModelV1 } from '@bairmair/room-model';
import { FloorPlan } from '@bairmair/viewer';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CubeIcon, PlanIcon } from '@/components/icons';
import { PhotoDialog, type ScenePhoto } from '@/components/viewer/PhotoDialog';
import { useSceneState } from '@/components/viewer/use-scene-state';
import { useViewerText } from '@/components/viewer/use-viewer-text';
import { track } from '@/lib/analytics';
import { onOpenSpace, SPACE_ID, type SpaceView } from './space-signal';

// three.js is large and needs WebGL: loaded in the browser, only once the section is near.
const RoomViewer3D = dynamic(
  () => import('@bairmair/viewer/3d').then((module) => module.RoomViewer3D),
  { ssr: false, loading: () => <Spinner /> },
);

/** How far below the viewport the section starts loading the 3D model. */
const PRELOAD_MARGIN = '200px 0px';

/**
 * "Орон зай": the scanned apartment as a 3D model or a floor plan, sharing the selected room,
 * with a strip of rooms and their areas. Below the photos on the listing page, so three.js
 * loads only when the visitor scrolls near it or asks for it from the photo hero (`openSpace`).
 * `eager`: the section is the page's first media (a scanned listing without photos).
 */
export function ListingSpace({
  listingId,
  locale,
  photos,
  model,
  eager = false,
}: {
  listingId: string;
  locale: Locale;
  photos: ListingPhoto[];
  /** With the seller's room labels and photo rooms applied. */
  model: RoomModelV1;
  eager?: boolean;
}) {
  const { t, text } = useViewerText(locale);
  const [view, setView] = useState<SpaceView>('3d');
  const [near, setNear] = useState(eager);
  const ref = useRef<HTMLElement>(null);

  // Requests from the hero's buttons.
  useEffect(
    () =>
      onOpenSpace((requested) => {
        setView(requested);
        setNear(true);
        track('listing_media_tab', { listing_id: listingId, tab: requested, from: 'hero' });
      }),
    [listingId],
  );

  useEffect(() => {
    const element = ref.current;
    if (near || !element) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setNear(true);
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [near]);

  const tabs: { value: SpaceView; label: string; icon: ReactNode }[] = [
    { value: '3d', label: t('viewer.view3d'), icon: <CubeIcon /> },
    { value: 'plan', label: t('viewer.viewPlan'), icon: <PlanIcon /> },
  ];

  return (
    <section
      ref={ref}
      id={SPACE_ID}
      aria-labelledby="space-title"
      className="scroll-mt-24 space-y-3"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 id="space-title" className="text-xl font-semibold tracking-tight">
            {t('listingPage.space.title')}
          </h2>
          <p className="max-w-prose text-sm text-fg-muted">{t('listingPage.space.lead')}</p>
        </div>
        <div role="tablist" className="inline-flex rounded-full bg-surface p-1 ring-1 ring-line">
          {tabs.map(({ value, label, icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => {
                if (value !== view) {
                  track('listing_media_tab', { listing_id: listingId, tab: value, from: 'tabs' });
                }
                setView(value);
              }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition [&>svg]:size-[18px] ${
                view === value ? 'bg-primary text-on-primary shadow-sm' : 'text-fg-2 hover:text-fg'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </div>
      <Scene
        listingId={listingId}
        model={model}
        photos={photos}
        view={view}
        load3d={near}
        text={text}
        t={t}
      />
    </section>
  );
}

function Scene({
  listingId,
  model,
  photos,
  view,
  load3d,
  text,
  t,
}: {
  listingId: string;
  model: RoomModelV1;
  photos: ListingPhoto[];
  view: SpaceView;
  load3d: boolean;
  text: ReturnType<typeof useViewerText>['text'];
  t: ReturnType<typeof useViewerText>['t'];
}) {
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
      <div className="relative h-[min(56vh,26rem)] sm:h-[min(62vh,32rem)] sm:min-h-72">
        {view === '3d' ? (
          <div className="h-full bg-gradient-to-b from-scene-from to-scene-to">
            {load3d ? (
              <RoomViewer3D
                model={model}
                text={text}
                selectedRoomId={selectedRoomId}
                onSelectRoom={toggleRoom}
                onSelectPhoto={openHotspot}
                onInteract={onInteract}
                onPlainView={(on) => track('listing_3d_plain_view', { listing_id: listingId, on })}
                pageScroll
                introSpin
              />
            ) : (
              <Spinner />
            )}
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
      <div className="flex items-center gap-2 overflow-x-auto border-t border-line px-3 pt-3 pb-2">
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
      </div>
      {/* The total on its own line, so it never scrolls out of view with the rooms. */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 pb-3 text-sm">
        <span className="font-semibold">
          {t('viewer.totalArea')}: {text.area(metrics.totalAreaM2)}
        </span>
        <span className="text-xs text-fg-subtle">{t('viewer.approximateScanned')}</span>
        {(model.dividers?.length ?? 0) > 0 && (
          <span className="basis-full text-xs text-fg-subtle">{t('viewer.dividerNote')}</span>
        )}
      </div>
      <PhotoDialog {...dialog} closeLabel={t('viewer.closePhoto')} />
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <span className="size-10 animate-spin rounded-full border-2 border-[#1a2b60]/15 border-t-[#199ed6]" />
    </div>
  );
}
