'use client';

/** Same as the app: 2048 px on the long edge, JPEG quality 0.8. */
const MAX_EDGE = 2048;
const QUALITY = 0.8;

export interface PreparedPhoto {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Prepares a photo for upload in the browser: turned upright from its EXIF orientation,
 * scaled down to 2048 px, re-encoded as JPEG. Re-encoding through a canvas drops all metadata,
 * including GPS, like the app does. Throws for files the browser cannot decode (e.g. HEIC
 * outside Safari).
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d canvas');
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    );
    if (!blob) throw new Error('could not encode JPEG');
    return { blob, width, height };
  } finally {
    bitmap.close();
  }
}
