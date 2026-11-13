'use client';

import { LISTING_LIMITS } from '@bairmair/db';
import { createTranslator, type Locale } from '@bairmair/i18n';
import { useMemo, useRef, useState } from 'react';
import { addPhoto, removePhoto, savePhotoOrder, type MyPhoto } from '@/lib/my-listings';
import { preparePhoto } from '@/lib/resize-photo';

const MAX_PHOTOS = LISTING_LIMITS.photos.max;

/**
 * The listing's photos: add (resized in the browser, metadata dropped), make cover, move,
 * remove. Every change is saved at once. Needs a saved listing (the storage policies check that
 * the listing is the user's).
 */
export function PhotoSection({
  listingId,
  photos,
  onChange,
  locale,
}: {
  /** Null while the listing has not been saved yet. */
  listingId: string | null;
  photos: readonly MyPhoto[];
  onChange: (photos: MyPhoto[]) => void;
  locale: Locale;
}) {
  const t = useMemo(() => createTranslator(locale), [locale]);
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failed, setFailed] = useState(0);
  const [busy, setBusy] = useState(false);

  if (!listingId) {
    return <p className="text-sm text-fg-muted">{t('listingForm.photosNeedSave')}</p>;
  }

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const chosen = Array.from(files).slice(0, MAX_PHOTOS - photos.length);
    const added: MyPhoto[] = [];
    let errors = 0;
    setFailed(0);
    setProgress({ done: 0, total: chosen.length });
    for (const [index, file] of chosen.entries()) {
      try {
        const prepared = await preparePhoto(file);
        added.push(await addPhoto(listingId, prepared, photos.length + added.length));
        onChange([...photos, ...added]);
      } catch {
        errors += 1;
      }
      setProgress({ done: index + 1, total: chosen.length });
    }
    setProgress(null);
    setFailed(errors);
    if (input.current) input.current.value = '';
  };

  const reorder = async (from: number, to: number) => {
    const next = [...photos];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    setBusy(true);
    onChange(next.map((photo, index) => ({ ...photo, sortOrder: index })));
    try {
      await savePhotoOrder(next);
    } catch {
      onChange([...photos]);
      setFailed(1);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (photo: MyPhoto) => {
    if (!window.confirm(`${t('listingForm.photoActions.remove')}?`)) return;
    setBusy(true);
    try {
      await removePhoto(listingId, photo.id);
      onChange(photos.filter((other) => other.id !== photo.id));
    } catch {
      setFailed(1);
    } finally {
      setBusy(false);
    }
  };

  const small =
    'rounded-full bg-surface/90 px-2 py-0.5 text-xs shadow-sm hover:bg-surface disabled:opacity-50';

  return (
    <div className="space-y-3">
      <p className="text-sm text-fg-muted">
        {t('listingForm.photosHint', { count: photos.length, max: MAX_PHOTOS })}
      </p>
      {photos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((photo, index) => (
            <li key={photo.id} className="relative overflow-hidden rounded-xl bg-surface-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt=""
                className="aspect-[4/3] w-full object-cover"
                loading="lazy"
              />
              <div className="absolute inset-x-1 bottom-1 flex flex-wrap gap-1">
                {index > 0 && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void reorder(index, 0)}
                      className={small}
                    >
                      {t('listingForm.photoActions.makeCover')}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void reorder(index, index - 1)}
                      className={small}
                      aria-label={t('listingForm.photoActions.moveEarlier')}
                    >
                      ←
                    </button>
                  </>
                )}
                {index < photos.length - 1 && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void reorder(index, index + 1)}
                    className={small}
                    aria-label={t('listingForm.photoActions.moveLater')}
                  >
                    →
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(photo)}
                  className={`${small} text-danger`}
                >
                  {t('listingForm.photoActions.remove')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => void add(event.target.files)}
      />
      <button
        type="button"
        disabled={progress !== null || photos.length >= MAX_PHOTOS}
        onClick={() => input.current?.click()}
        className="rounded-full border border-line-2 px-4 py-2 font-medium hover:bg-surface-2 disabled:opacity-50"
      >
        {progress ? t('listingForm.uploadingPhotos', progress) : t('listingForm.addPhotos')}
      </button>
      {failed > 0 && (
        <p role="alert" className="text-sm text-danger">
          {t('listingForm.photosFailed', { count: failed })}
        </p>
      )}
    </div>
  );
}
