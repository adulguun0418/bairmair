'use client';

import { createTranslator, type Locale } from '@bairmair/i18n';
import Image from 'next/image';
import { Photo } from '@/components/Photo';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { ListingPhoto } from '@bairmair/browse';

/** Photos shown in the mosaic; the rest open from the last tile. */
const MOSAIC = 5;

/**
 * Where each tile sits in the 4×2 grid (wide screens), by how many photos are shown: the cover
 * always takes the left half; the others share the right half.
 */
const COVER = 'sm:col-span-2 sm:row-span-2';
const TILES: Record<number, string[]> = {
  1: ['sm:col-span-4 sm:row-span-2'],
  2: [COVER, COVER],
  3: [COVER, 'sm:col-span-2', 'sm:col-span-2'],
  4: [COVER, 'sm:col-span-2', '', ''],
  5: [COVER, '', '', '', ''],
};

/**
 * The listing's photos: a mosaic filling its container (cover large, up to four small; the
 * cover alone on phones) that opens a full-size viewer with previous / next and arrow keys.
 */
export function ListingGallery({ photos, locale }: { photos: ListingPhoto[]; locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [open, setOpen] = useState<number | null>(null);

  if (photos.length === 0) {
    return (
      <p className="flex h-full items-center justify-center bg-surface-2 p-8 text-center text-fg-subtle">
        {t('listingPage.noPhotos')}
      </p>
    );
  }

  const shown = photos.slice(0, MOSAIC);
  const hidden = photos.length - shown.length;
  const tiles = TILES[shown.length] ?? TILES[MOSAIC]!;
  const label = (index: number) =>
    t('listingPage.photo', { index: index + 1, total: photos.length });

  return (
    <div className="relative h-full">
      <div className="grid h-full grid-cols-1 gap-2 sm:grid-cols-4 sm:grid-rows-2">
        {shown.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setOpen(index)}
            aria-label={label(index)}
            className={`group relative block overflow-hidden bg-surface-3 ${
              index === 0 ? '' : 'hidden sm:block'
            } ${tiles[index] ?? ''}`}
          >
            <Photo
              src={photo.src}
              alt=""
              sizes={
                index === 0 || shown.length <= 2
                  ? '(min-width: 1280px) 640px, (min-width: 640px) 50vw, 100vw'
                  : '(min-width: 1280px) 320px, 25vw'
              }
              priority={index === 0}
              className="group-hover:scale-[1.03]"
            />
            {index === shown.length - 1 && hidden > 0 && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-lg font-medium text-white">
                +{hidden}
              </span>
            )}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setOpen(0)}
        className="absolute bottom-3 right-3 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-[#0e1733] shadow-lg backdrop-blur transition hover:bg-white"
      >
        {t('listingPage.photoCount', { count: photos.length })}
      </button>
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
    </div>
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
