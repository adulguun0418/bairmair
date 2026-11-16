import type { ListingPhoto } from '@bairmair/browse';
import { describe, expect, it } from 'vitest';
import { groupPhotos, type GalleryRoom } from '@/components/listing/gallery-groups';

const photo = (id: string, roomId: string | null = null) =>
  ({ id, src: `https://example.test/${id}.jpg`, roomId }) as ListingPhoto;

const rooms: GalleryRoom[] = [
  { id: 'living', name: 'Зочны өрөө', area: '25.1 м²' },
  { id: 'kitchen', name: 'Гал тогоо', area: '4.4 м²' },
  { id: 'bath', name: 'Угаалгын өрөө', area: '5.2 м²' },
];

const summary = (groups: ReturnType<typeof groupPhotos>) =>
  groups.map((group) => [group.title, group.photos.map(({ index }) => index)]);

describe('groupPhotos', () => {
  it('groups by room in the scan order, skips empty rooms, then the rest', () => {
    const photos = [photo('a'), photo('b', 'kitchen'), photo('c', 'living'), photo('d', 'kitchen')];
    expect(summary(groupPhotos(photos, rooms, 'Бусад'))).toEqual([
      ['Зочны өрөө', [2]],
      ['Гал тогоо', [1, 3]],
      ['Бусад', [0]],
    ]);
  });

  it('puts photos of rooms no longer in the scan with the rest', () => {
    const photos = [photo('a', 'old-room'), photo('b', 'living')];
    expect(summary(groupPhotos(photos, rooms, 'Бусад'))).toEqual([
      ['Зочны өрөө', [1]],
      ['Бусад', [0]],
    ]);
  });

  it('is one untitled group without rooms or without room photos', () => {
    const photos = [photo('a'), photo('b')];
    expect(summary(groupPhotos(photos, null, 'Бусад'))).toEqual([[null, [0, 1]]]);
    expect(summary(groupPhotos(photos, rooms, 'Бусад'))).toEqual([[null, [0, 1]]]);
  });
});
