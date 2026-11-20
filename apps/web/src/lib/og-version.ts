/**
 * A short code for the Open Graph image's URL (`?v=…`) that changes whenever the picture
 * would. Facebook caches link-preview images by URL, so with a fixed URL a re-scraped link
 * kept its old picture; a new code makes it fetch the new one.
 *
 * Bump `OG_DESIGN_VERSION` when the image's design changes.
 */
export const OG_DESIGN_VERSION = 3;

/** What the image shows. */
export interface OgImageContent {
  type: string;
  price: number | null;
  currency: string;
  rooms: number | null;
  area_official_m2: number | null;
  area_scanned_m2: number | null;
  district_id: number | null;
  complex_name: string | null;
  coverPhotoId: string | null;
  /** The scan's rooms, total area and front door (the plan inset), or null without a scan. */
  scan: { rooms: number; totalAreaM2: number; entranceDoorId: string | null } | null;
}

export function ogImageVersion(content: OgImageContent): string {
  return fnv1a(JSON.stringify([OG_DESIGN_VERSION, content])).toString(36);
}

/** 32-bit FNV-1a: a stable, dependency-free string hash (not for security). */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A short code that changes with `content`, for the `?v=` of other preview images. */
export function contentVersion(content: unknown): string {
  return fnv1a(JSON.stringify(content)).toString(36);
}
