'use client';

import { createTranslator, formatArea, roomDisplayName, type Locale } from '@bairmair/i18n';
import { computeMetrics, layoutHotspots, type RoomModelV1 } from '@bairmair/room-model';
import { FloorPlan, type ViewerText } from '@bairmair/viewer';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';

// three.js is large and needs WebGL: load the 3D view in the browser only, after the page.
const RoomViewer3D = dynamic(
  () => import('@bairmair/viewer/3d').then((module) => module.RoomViewer3D),
  { ssr: false },
);

export interface ScenePhoto {
  id: string;
  roomId: string;
  src: string;
}

interface ListingSceneProps {
  locale: Locale;
  /** The model with photo hotspots already applied. */
  model: RoomModelV1;
  photos: ScenePhoto[];
}

/**
 * The 3D view, floor plan and room list of one listing, kept in sync: selecting a room in any
 * of them highlights it in the others, and photo markers open the photo.
 */
export function ListingScene({ locale, model, photos }: ListingSceneProps) {
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

  const metrics = useMemo(() => computeMetrics(model), [model]);
  const rooms = useMemo(() => new Map(model.rooms.map((room) => [room.id, room])), [model]);
  // Number photos in the same order as the markers in both views.
  const photoNumbers = useMemo(
    () => new Map(layoutHotspots(model).map((placement, index) => [placement.photoId, index + 1])),
    [model],
  );

  const [view, setView] = useState<'3d' | 'plan'>('3d');
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);

  const toggleRoom = (roomId: string) =>
    setSelectedRoomId((current) => (current === roomId ? null : roomId));
  const showPhoto = (photoId: string) => {
    setOpenPhotoId(photoId);
    const photo = photos.find((candidate) => candidate.id === photoId);
    if (photo) setSelectedRoomId(photo.roomId);
  };

  const openPhoto = photos.find((photo) => photo.id === openPhotoId) ?? null;
  const openPhotoRoom = openPhoto ? rooms.get(openPhoto.roomId) : undefined;
  const caption =
    openPhoto && openPhotoRoom
      ? text.photo(photoNumbers.get(openPhoto.id) ?? 1, openPhotoRoom)
      : '';

  const plan = (
    <FloorPlan
      model={model}
      text={text}
      title={t('viewer.viewPlan')}
      selectedRoomId={selectedRoomId}
      onSelectRoom={toggleRoom}
      onSelectPhoto={showPhoto}
      className="aspect-[4/3] w-full"
    />
  );

  const viewButton = (value: '3d' | 'plan', label: string) => (
    <button
      type="button"
      aria-pressed={view === value}
      onClick={() => setView(value)}
      className={`rounded-full px-4 py-1.5 text-sm ${
        view === value ? 'bg-white font-medium shadow-sm' : 'text-stone-600'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div>
        <div className="mb-3 inline-flex rounded-full bg-stone-200 p-1 lg:hidden">
          {viewButton('3d', t('viewer.view3d'))}
          {viewButton('plan', t('viewer.viewPlan'))}
        </div>
        <section
          aria-label={t('viewer.label')}
          className={`${view === 'plan' ? 'hidden lg:block' : ''} relative h-[min(72vh,40rem)] overflow-hidden rounded-2xl bg-gradient-to-b from-stone-100 to-stone-300`}
        >
          <RoomViewer3D
            model={model}
            text={text}
            selectedRoomId={selectedRoomId}
            onSelectRoom={toggleRoom}
            onSelectPhoto={showPhoto}
          />
        </section>
        <section
          aria-label={t('viewer.viewPlan')}
          className={`${view === '3d' ? 'hidden' : ''} rounded-2xl bg-white p-3 shadow-sm lg:hidden`}
        >
          {plan}
        </section>
      </div>

      <aside className="space-y-4">
        <section
          aria-label={t('viewer.viewPlan')}
          className="hidden rounded-2xl bg-white p-3 shadow-sm lg:block"
        >
          {plan}
        </section>
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-stone-500">{t('viewer.rooms')}</h2>
          <ul className="mt-2 divide-y divide-stone-100">
            {metrics.rooms.map(({ id, areaM2 }) => {
              const room = rooms.get(id);
              if (!room) return null;
              const selected = id === selectedRoomId;
              return (
                <li key={id}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => toggleRoom(id)}
                    className={`flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-2 text-left ${
                      selected ? 'bg-amber-100' : 'hover:bg-stone-50'
                    }`}
                  >
                    <span>{text.roomName(room)}</span>
                    <span className="shrink-0 text-sm text-stone-600">{text.area(areaM2)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-stone-200 px-2 pt-3">
            <span className="font-medium">{t('viewer.totalArea')}</span>
            <span className="font-medium">{text.area(metrics.totalAreaM2)}</span>
          </div>
          <p className="mt-1 px-2 text-xs text-stone-500">{t('viewer.approximateScanned')}</p>
        </section>
      </aside>

      <PhotoDialog
        photo={openPhoto}
        caption={caption}
        closeLabel={t('viewer.closePhoto')}
        onClose={() => setOpenPhotoId(null)}
      />
    </div>
  );
}

function PhotoDialog({
  photo,
  caption,
  closeLabel,
  onClose,
}: {
  photo: ScenePhoto | null;
  caption: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (photo && !dialog.open) dialog.showModal();
    if (!photo && dialog.open) dialog.close();
  }, [photo]);

  // A click on the backdrop lands on the dialog element itself.
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  };

  return (
    <dialog
      ref={ref}
      aria-label={caption}
      onClose={onClose}
      onClick={onClick}
      className="m-auto w-[min(92vw,56rem)] overflow-hidden rounded-2xl bg-white p-0 backdrop:bg-black/60"
    >
      {photo && (
        <figure>
          <Image
            src={photo.src}
            alt={caption}
            width={1200}
            height={800}
            unoptimized
            className="h-auto w-full"
          />
          <figcaption className="flex items-center justify-between gap-4 p-4">
            <span>{caption}</span>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="rounded-full bg-stone-900 px-4 py-1.5 text-sm text-white"
            >
              {closeLabel}
            </button>
          </figcaption>
        </figure>
      )}
    </dialog>
  );
}
