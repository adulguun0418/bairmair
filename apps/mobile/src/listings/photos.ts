import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { listingDir } from './files';
import type { LocalPhoto } from './model';

/** Long edge of a listing photo. Sharp on a phone and a laptop, about 300–700 KB as JPEG. */
export const PHOTO_MAX_EDGE = 2048;
const JPEG_QUALITY = 0.8;

export type PickResult = { status: 'picked'; uris: string[] } | { status: 'cancelled' | 'denied' };

/** The system photo picker (no photo library permission needed on iOS 14+). */
export async function pickFromLibrary(limit: number): Promise<PickResult> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: limit,
    orderedSelection: true,
    quality: 1,
    exif: false,
  });
  if (result.canceled) return { status: 'cancelled' };
  return { status: 'picked', uris: result.assets.map((asset) => asset.uri) };
}

export async function takePhoto(): Promise<PickResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { status: 'denied' };
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled) return { status: 'cancelled' };
  return { status: 'picked', uris: result.assets.map((asset) => asset.uri) };
}

/**
 * Resizes a picked photo to at most 2048 px on its long edge and saves it as JPEG in the
 * listing's folder. The image is downsampled while decoding (no full-size bitmap in memory),
 * and re-encoding drops all metadata, including the GPS position iPhone photos carry: the
 * exact address must not leak through a photo.
 */
export async function preparePhoto(
  listingId: string,
  sourceUri: string,
): Promise<Pick<LocalPhoto, 'id' | 'file' | 'width' | 'height'>> {
  const context = ImageManipulator.manipulate(sourceUri, {
    maxWidth: PHOTO_MAX_EDGE,
    maxHeight: PHOTO_MAX_EDGE,
  });
  try {
    const image = await context.renderAsync();
    try {
      const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
      const id = randomUUID();
      const file = `${id}.jpg`;
      const dir = listingDir(listingId);
      dir.create({ intermediates: true, idempotent: true });
      await new File(saved.uri).move(new File(dir, file));
      return { id, file, width: saved.width, height: saved.height };
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}
