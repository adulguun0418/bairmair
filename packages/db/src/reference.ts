/**
 * Cities and districts, mirrored from `supabase/migrations/*_reference_data.sql`. Ids are stable,
 * so apps use these constants (and work offline) instead of querying the tables. A remote test
 * checks that they match the database.
 */

export interface City {
  id: number;
  slug: string;
  nameMn: string;
  nameEn: string;
}

export interface District {
  id: number;
  cityId: number;
  slug: string;
  nameMn: string;
  nameEn: string;
}

export const ULAANBAATAR_ID = 1;

export const CITIES: readonly City[] = [
  { id: ULAANBAATAR_ID, slug: 'ulaanbaatar', nameMn: 'Улаанбаатар', nameEn: 'Ulaanbaatar' },
];

/** In `sort_order`: the central districts first. */
export const DISTRICTS: readonly District[] = [
  { id: 1, cityId: 1, slug: 'sukhbaatar', nameMn: 'Сүхбаатар', nameEn: 'Sukhbaatar' },
  { id: 2, cityId: 1, slug: 'chingeltei', nameMn: 'Чингэлтэй', nameEn: 'Chingeltei' },
  { id: 3, cityId: 1, slug: 'bayangol', nameMn: 'Баянгол', nameEn: 'Bayangol' },
  { id: 4, cityId: 1, slug: 'bayanzurkh', nameMn: 'Баянзүрх', nameEn: 'Bayanzurkh' },
  { id: 5, cityId: 1, slug: 'khan-uul', nameMn: 'Хан-Уул', nameEn: 'Khan-Uul' },
  {
    id: 6,
    cityId: 1,
    slug: 'songinokhairkhan',
    nameMn: 'Сонгинохайрхан',
    nameEn: 'Songinokhairkhan',
  },
  { id: 7, cityId: 1, slug: 'nalaikh', nameMn: 'Налайх', nameEn: 'Nalaikh' },
  { id: 8, cityId: 1, slug: 'baganuur', nameMn: 'Багануур', nameEn: 'Baganuur' },
  { id: 9, cityId: 1, slug: 'bagakhangai', nameMn: 'Багахангай', nameEn: 'Bagakhangai' },
];

export function districtById(id: number | null | undefined): District | undefined {
  return id == null ? undefined : DISTRICTS.find((district) => district.id === id);
}
