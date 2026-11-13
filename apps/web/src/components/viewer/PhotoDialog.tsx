'use client';

import Image from 'next/image';
import { useEffect, useRef, type MouseEvent } from 'react';

export interface ScenePhoto {
  id: string;
  roomId: string;
  src: string;
}

/** A photo opened from a hotspot in the 3D view or the floor plan. */
export function PhotoDialog({
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
      className="m-auto w-[min(92vw,56rem)] overflow-hidden rounded-2xl bg-surface p-0 backdrop:bg-black/60"
    >
      {photo && (
        <figure>
          <Image
            src={photo.src}
            alt={caption}
            width={1200}
            height={800}
            unoptimized
            className="h-auto max-h-[75dvh] w-full object-contain"
          />
          <figcaption className="flex items-center justify-between gap-4 p-4">
            <span>{caption}</span>
            <button
              type="button"
              onClick={() => ref.current?.close()}
              className="rounded-full bg-primary px-4 py-1.5 text-sm text-on-primary"
            >
              {closeLabel}
            </button>
          </figcaption>
        </figure>
      )}
    </dialog>
  );
}
