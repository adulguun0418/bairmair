'use client';

import { createTranslator, type Locale } from '@bairmair/i18n';
import Image from 'next/image';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { ListingPhoto } from '@bairmair/browse';

/** Photos shown in the mosaic; the rest open from the last tile. */
const MOSAIC = 5;

/**
 * The listing's photos: a mosaic (cover large, four small) that opens a full-size viewer with
 * previous / next and arrow keys.
 */
export function ListingGallery({ photos, locale }: { photos: ListingPhoto[]; locale: Locale }) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const [open, setOpen] = useState<number | null>(null);

  if (photos.length === 0) {
    return (
      <p className="rounded-2xl bg-stone-100 p-8 text-center text-stone-500">
        {t('listingPage.noPhotos')}
      </p>
    );
  }

  const shown = photos.slice(0, MOSAIC);
  const hidden = photos.length - shown.length;
  const label = (index: number) =>
    t('listingPage.photo', { index: index + 1, total: photos.length });

  return (
    <>
      <div
        className={`grid gap-2 overflow-hidden rounded-2xl ${
          shown.length === 1 ? '' : 'sm:grid-cols-4 sm:grid-rows-2'
        }`}
      >
        {shown.map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setOpen(index)}
            aria-label={label(index)}
            className={`relative block overflow-hidden bg-stone-200 ${
              index === 0
                ? 'aspect-[4/3] sm:col-span-2 sm:row-span-2 sm:aspect-auto sm:min-h-[22rem]'
                : 'hidden aspect-[4/3] sm:block'
            }`}
          >
            <Image
              src={photo.src}
              alt=""
              fill
              unoptimized
              sizes={index === 0 ? '(min-width: 640px) 50vw, 100vw' : '25vw'}
              priority={index === 0}
              className="object-cover transition hover:opacity-90"
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
        className="mt-2 text-sm text-stone-600 hover:underline"
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
    </>
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

  const button = 'rounded-full bg-white/90 px-4 py-1.5 text-sm text-stone-900 hover:bg-white';
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
            unoptimized
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
