'use client';

import type { Locale } from '@bairmair/i18n';
import { computeMetrics, type RoomModelV1 } from '@bairmair/room-model';
import { FloorPlan } from '@bairmair/viewer';
import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { PhotoDialog, type ScenePhoto } from './viewer/PhotoDialog';
import { useSceneState } from './viewer/use-scene-state';
import { useViewerText } from './viewer/use-viewer-text';

export type { ScenePhoto } from './viewer/PhotoDialog';

// three.js is large and needs WebGL: load the 3D view in the browser only, after the page.
const RoomViewer3D = dynamic(
  () => import('@bairmair/viewer/3d').then((module) => module.RoomViewer3D),
  { ssr: false },
);

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
  const { t, text } = useViewerText(locale);
  const metrics = useMemo(() => computeMetrics(model), [model]);
  const { rooms, selectedRoomId, toggleRoom, showPhoto, dialog } = useSceneState(
    model,
    photos,
    text,
  );
  const [view, setView] = useState<'3d' | 'plan'>('3d');

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

      <PhotoDialog {...dialog} closeLabel={t('viewer.closePhoto')} />
    </div>
  );
}
