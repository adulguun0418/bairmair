'use client';

import type { ListingPhoto } from '@bairmair/browse';
import { createTranslator, type Locale } from '@bairmair/i18n';
import Image from 'next/image';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type UIEvent,
} from 'react';
import { CameraIcon, CubeIcon, PlanIcon } from '@/components/icons';
import { Photo } from '@/components/Photo';
import { track } from '@/lib/analytics';
import { PhotoGallery, type GalleryRoom } from './PhotoGallery';
import { openSpace } from './space-signal';

/** The cover takes the left half of the wide-screen grid. */
const COVER = 'sm:col-span-2 sm:row-span-2';

/** Where each photo tile sits in the 4×2 grid (wide screens), by how many photos are shown. */
const TILES: Record<number, string[]> = {
  1: ['sm:col-span-4 sm:row-span-2'],
  2: [COVER, COVER],
  3: [COVER, 'sm:col-span-2', 'sm:col-span-2'],
  4: [COVER, 'sm:col-span-2', '', ''],
  5: [COVER, '', '', '', ''],
};
/** The same with the floor-plan panel in the last column. */
const TILES_WITH_PLAN: Record<number, string[]> = {
  1: ['sm:col-span-3 sm:row-span-2'],
  2: [COVER, 'sm:row-span-2'],
  3: [COVER, '', ''],
};

/**
 * The top of a listing page: its photos first (what the apartment looks like), with the
 * floor plan and a "3D" button over them for a scanned listing, which jump to the "Орон зай"
 * section further down (`openSpace`).
 *
 * - Phones: the photos as a swipeable strip with a counter, the plan as a small tile.
 * - Wide screens: a mosaic (cover large, up to four more), or with a scan the cover, two
 *   photos and a floor-plan panel showing the scanned area.
 *
 * Tapping a photo opens a full-size viewer with previous / next and arrow keys. "N зураг", the
 * "+N" tile and the phone counter open the gallery: every photo, grouped by room.
 */
export function ListingHero({
  listingId,
  locale,
  photos,
  plan,
}: {
  listingId: string;
  locale: Locale;
  /** At least one. */
  photos: ListingPhoto[];
  /**
   * For a scanned listing: the plan images (`full` is labelled), the scanned total area and the
   * rooms (names and areas formatted), for grouping photos.
   */
  plan: { full: string; thumb: string; area: string; rooms: GalleryRoom[] } | null;
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [open, setOpenIndex] = useState<number | null>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [current, setCurrent] = useState(0);
  const swiped = useRef(false);

  const openGallery = (from: 'button' | 'counter' | 'more') => {
    track('listing_gallery_opened', { listing_id: listingId, from });
    setGalleryOpen(true);
  };

  const shown = Math.min(photos.length, plan ? 3 : 5);
  const hidden = photos.length - shown;
  const tiles = (plan ? TILES_WITH_PLAN : TILES)[shown] ?? [];
  const label = (index: number) =>
    t('listingPage.photo', { index: index + 1, total: photos.length });

  const setOpen = (index: number | null) => {
    if (index !== null && open === null) {
      track('listing_photo_opened', { listing_id: listingId, from: 'gallery' });
    }
    setOpenIndex(index);
  };
  // Phones only: the strip scrolls sideways, one photo per screen width.
  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const strip = event.currentTarget;
    if (strip.clientWidth === 0) return;
    const index = Math.round(strip.scrollLeft / strip.clientWidth);
    setCurrent(index);
    if (index > 0 && !swiped.current) {
      swiped.current = true;
      track('listing_photos_swiped', { listing_id: listingId });
    }
  };

  // No display utility here: each button sets its own (one is hidden on phones).
  const pill =
    'items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg transition [&>svg]:size-[18px]';

  return (
    <section aria-label={t('listingPage.sections.photos')} className="relative">
      <div
        onScroll={onScroll}
        className="flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-3xl bg-surface-3 [scrollbar-width:none] sm:grid sm:aspect-auto sm:h-[min(62vh,34rem)] sm:min-h-72 sm:grid-cols-4 sm:grid-rows-2 sm:gap-2 sm:overflow-hidden sm:bg-transparent [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            onClick={() =>
              // The "+N" tile (wide screens only) opens the gallery; a phone slide its photo.
              index === shown - 1 && hidden > 0 && window.matchMedia('(min-width: 640px)').matches
                ? openGallery('more')
                : setOpen(index)
            }
            aria-label={label(index)}
            className={`group relative block h-full w-full shrink-0 snap-center overflow-hidden bg-surface-3 ${
              index < shown ? (tiles[index] ?? '') : 'sm:hidden'
            }`}
          >
            <Photo
              src={photo.src}
              alt=""
              sizes={
                index === 0
                  ? '(min-width: 1280px) 640px, (min-width: 640px) 50vw, 100vw'
                  : '(min-width: 1280px) 320px, (min-width: 640px) 25vw, 100vw'
              }
              priority={index === 0}
              className="group-hover:scale-[1.03]"
            />
            {index === shown - 1 && hidden > 0 && (
              <span className="absolute inset-0 hidden items-center justify-center bg-black/45 text-lg font-medium text-white sm:flex">
                +{hidden}
              </span>
            )}
          </button>
        ))}
        {plan && (
          <button
            type="button"
            onClick={() => openSpace('plan')}
            aria-label={t('listingPage.hero.viewPlan')}
            className="group relative hidden overflow-hidden bg-[#eef3fa] text-[#1a2b60] bg-blueprint sm:col-start-4 sm:row-span-2 sm:row-start-1 sm:block"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- an SVG from our API */}
            <img
              src={plan.full}
              alt=""
              decoding="async"
              className="absolute inset-0 h-full w-full object-contain p-4 pb-16 transition duration-300 group-hover:scale-[1.03]"
            />
            <span className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-xl bg-white/95 px-3 py-2 text-sm font-medium shadow-sm ring-1 ring-black/5">
              <span className="inline-flex items-center gap-1.5">
                <PlanIcon className="size-4" />
                {t('listingPage.hero.plan')}
              </span>
              <span className="tabular-nums">{plan.area}</span>
            </span>
          </button>
        )}
      </div>

      {photos.length > 1 && (
        <button
          type="button"
          onClick={() => openGallery('counter')}
          aria-label={t('listingPage.photoCount', { count: photos.length })}
          className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium tabular-nums text-white backdrop-blur sm:hidden"
        >
          <CameraIcon className="size-3.5" />
          {t('listingPage.hero.photoCounter', { index: current + 1, total: photos.length })}
        </button>
      )}

      <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
        {plan && (
          <button
            type="button"
            onClick={() => openSpace('3d')}
            // Brand navy in both themes: it sits on a photo, not on the page.
            className={`${pill} inline-flex bg-[#1a2b60] text-white ring-1 ring-white/25 hover:bg-[#22377a]`}
          >
            <CubeIcon />
            {t('listingPage.hero.view3d')}
          </button>
        )}
        <button
          type="button"
          onClick={() => openGallery('button')}
          className={`${pill} hidden bg-white/90 text-[#0e1733] backdrop-blur hover:bg-white sm:inline-flex`}
          // Phones have the counter for this.
        >
          <CameraIcon />
          {t('listingPage.photoCount', { count: photos.length })}
        </button>
      </div>

      {plan && (
        <button
          type="button"
          onClick={() => openSpace('plan')}
          aria-label={t('listingPage.hero.viewPlan')}
          className="absolute bottom-3 right-3 size-20 rounded-xl bg-white/95 p-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur sm:hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- an SVG from our API */}
          <img src={plan.thumb} alt="" decoding="async" className="h-full w-full object-contain" />
        </button>
      )}

      <PhotoGallery
        listingId={listingId}
        locale={locale}
        photos={photos}
        rooms={plan?.rooms ?? null}
        planSrc={plan?.full ?? null}
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onPhoto={setOpen}
      />
      {/* After the gallery: opened from it, the viewer shows on top. */}
      <PhotoViewer
        photos={photos}
        index={open}
        label={open === null ? '' : label(open)}
        text={{
          previous: t('listingPage.previousPhoto'),
          next: t('listingPage.nextPhoto'),
          close: t('listingPage.closePhoto'),
        }}
        onChange={setOpen}
      />
    </section>
  );
}

function PhotoViewer({
  photos,
  index,
  label,
  text,
  onChange,
}: {
  photos: ListingPhoto[];
  index: number | null;
  label: string;
  text: { previous: string; next: string; close: string };
  onChange: (index: number | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const photo = index === null ? null : photos[index];

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (photo && !dialog.open) dialog.showModal();
    if (!photo && dialog.open) dialog.close();
  }, [photo]);

  const step = (delta: number) => {
    if (index === null) return;
    onChange((index + delta + photos.length) % photos.length);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'ArrowLeft') step(-1);
    if (event.key === 'ArrowRight') step(1);
  };
  // A click on the backdrop lands on the dialog element itself.
  const onClick = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) event.currentTarget.close();
  };

  const button = 'rounded-full bg-surface/90 px-4 py-1.5 text-sm text-fg hover:bg-surface';
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onClose={() => onChange(null)}
      onKeyDown={onKeyDown}
      onClick={onClick}
      className="m-auto max-h-[94vh] w-[min(96vw,80rem)] overflow-hidden bg-transparent p-0 backdrop:bg-black/85"
    >
      {photo && (
        <figure className="flex max-h-[94vh] flex-col items-center gap-3">
          <Image
            src={photo.src}
            alt={label}
            width={photo.width ?? 2048}
            height={photo.height ?? 1536}
            sizes="96vw"
            className="max-h-[82vh] w-auto rounded-lg object-contain"
          />
          <figcaption className="flex w-full items-center justify-between gap-3 text-white">
            <span className="text-sm">{label}</span>
            <span className="flex gap-2">
              {photos.length > 1 && (
                <>
                  <button type="button" onClick={() => step(-1)} className={button}>
                    {text.previous}
                  </button>
                  <button type="button" onClick={() => step(1)} className={button}>
                    {text.next}
                  </button>
                </>
              )}
              <button type="button" onClick={() => ref.current?.close()} className={button}>
                {text.close}
              </button>
            </span>
          </figcaption>
        </figure>
      )}
    </dialog>
  );
}
