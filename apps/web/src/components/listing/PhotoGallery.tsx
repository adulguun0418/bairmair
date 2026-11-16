'use client';

import type { ListingPhoto } from '@bairmair/browse';
import { createTranslator, type Locale } from '@bairmair/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CloseIcon } from '@/components/icons';
import { Photo } from '@/components/Photo';
import { track } from '@/lib/analytics';
import { groupPhotos, type GalleryRoom } from './gallery-groups';

export type { GalleryRoom } from './gallery-groups';

/**
 * Every photo of a listing on one screen, grouped by the room the seller put it in (rooms in the
 * scan's order, then "other photos"). For a scanned listing the labelled floor plan sits beside
 * the photos (wide screens) and its rooms jump to their photos; phones get a row of room chips.
 * A photo opens the full-size viewer (`onPhoto`, with its index in `photos`).
 */
export function PhotoGallery({
  listingId,
  locale,
  photos,
  rooms,
  planSrc,
  open,
  onClose,
  onPhoto,
}: {
  listingId: string;
  locale: Locale;
  photos: ListingPhoto[];
  /** The scan's rooms; null without a scan. */
  rooms: GalleryRoom[] | null;
  /** The labelled plan SVG (`/api/plan/listings/[id]`); null without a scan. */
  planSrc: string | null;
  open: boolean;
  onClose: () => void;
  onPhoto: (index: number) => void;
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const ref = useRef<HTMLDialogElement>(null);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const groups = useMemo(
    () => groupPhotos(photos, rooms, t('listingPage.gallery.otherPhotos')),
    [photos, rooms, t],
  );
  const byRoom = groups.some((group) => group.roomId !== null);
  const roomsWithPhotos = new Set(groups.flatMap((group) => (group.roomId ? [group.roomId] : [])));

  const jump = (roomId: string, via: 'plan' | 'chip') => {
    const group = groups.find((candidate) => candidate.roomId === roomId);
    if (!group) return;
    setCurrent(roomId);
    track('gallery_room_selected', { listing_id: listingId, via });
    document.getElementById(sectionId(group.key))?.scrollIntoView({ block: 'start' });
  };

  return (
    <dialog
      ref={ref}
      aria-label={t('listingPage.photoCount', { count: photos.length })}
      onClose={onClose}
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-y-auto bg-page p-0 text-fg backdrop:bg-black/60"
    >
      <header className="sticky top-0 z-10 border-b border-line bg-page/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <h2 className="text-lg font-semibold">
            {t('listingPage.photoCount', { count: photos.length })}
          </h2>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label={t('listingPage.closePhoto')}
            className="flex size-10 items-center justify-center rounded-full ring-1 ring-line transition hover:bg-surface-2"
          >
            <CloseIcon className="size-5" />
          </button>
        </div>
        {byRoom && (
          // Phones and tablets: the rooms as chips (the plan is beside the photos on wide screens).
          <div className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-3 lg:hidden">
            {groups.map((group) =>
              group.roomId ? (
                <button
                  key={group.key}
                  type="button"
                  onClick={() => jump(group.roomId!, 'chip')}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm ring-1 transition ${
                    current === group.roomId
                      ? 'bg-accent-subtle text-on-accent-soft ring-accent/50'
                      : 'bg-surface ring-line'
                  }`}
                >
                  {group.title} · {group.photos.length}
                </button>
              ) : null,
            )}
          </div>
        )}
      </header>

      <div
        className={`mx-auto max-w-6xl gap-8 px-4 py-6 ${
          byRoom && planSrc ? 'lg:grid lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]' : ''
        }`}
      >
        {byRoom && planSrc && open && (
          <aside className="hidden self-start lg:sticky lg:top-24 lg:block">
            <PlanNavigation
              src={planSrc}
              clickable={roomsWithPhotos}
              selected={current}
              onSelect={(roomId) => jump(roomId, 'plan')}
            />
            <p className="mt-2 text-sm text-fg-muted">{t('listingPage.gallery.planHint')}</p>
          </aside>
        )}

        <div className="space-y-8">
          {groups.map((group) => (
            <section key={group.key} id={sectionId(group.key)} className="scroll-mt-32 space-y-3">
              {group.title && (
                <h3 className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold">
                  {group.title}
                  <span className="text-sm font-normal text-fg-muted">
                    {[group.area, t('listingPage.photoCount', { count: group.photos.length })]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </h3>
              )}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {group.photos.map(({ photo, index }) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => onPhoto(index)}
                    aria-label={t('listingPage.photo', { index: index + 1, total: photos.length })}
                    className="group relative aspect-[4/3] overflow-hidden rounded-xl bg-surface-3"
                  >
                    <Photo
                      src={photo.src}
                      alt=""
                      sizes="(min-width: 1024px) 300px, (min-width: 640px) 33vw, 50vw"
                      className="group-hover:scale-[1.03]"
                    />
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </dialog>
  );
}

function sectionId(key: string): string {
  return `gallery-${key}`;
}

/**
 * The labelled floor plan (our own SVG, fetched once) with its rooms as buttons: rooms that
 * have photos are tinted and clickable, the selected one stronger. The SVG marks each room
 * polygon with `data-room-id`.
 */
function PlanNavigation({
  src,
  clickable,
  selected,
  onSelect,
}: {
  src: string;
  clickable: Set<string>;
  selected: string | null;
  onSelect: (roomId: string) => void;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(src, { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : null))
      .then((text) => {
        if (text?.trimStart().startsWith('<svg')) setSvg(text);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [src]);

  const css = [...clickable]
    .map(
      (id) =>
        `.gallery-plan [data-room-id="${CSS.escape(id)}"]{cursor:pointer;fill:${
          id === selected ? '#9bd5f0' : '#e3f3fb'
        }}`,
    )
    .join('');

  if (!svg) return <div className="aspect-square animate-pulse rounded-2xl bg-surface-3" />;
  return (
    <div className="rounded-2xl bg-[#eef3fa] p-3 text-[#1a2b60] bg-blueprint">
      <style>{css}</style>
      <div
        className="gallery-plan [&>svg]:h-auto [&>svg]:w-full"
        onClick={(event) => {
          const room = (event.target as Element).closest('[data-room-id]');
          const id = room?.getAttribute('data-room-id');
          if (id && clickable.has(id)) onSelect(id);
        }}
        // Our own SVG from /api/plan (no scripts; served with a `default-src 'none'` policy).
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
