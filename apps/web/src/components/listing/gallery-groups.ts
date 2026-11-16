import type { ListingPhoto } from '@bairmair/browse';

// The gallery's grouping of photos by room; pure, so it is unit-tested.

/** A room of the scan, as the gallery needs it (names and areas formatted on the server). */
export interface GalleryRoom {
  id: string;
  name: string;
  area: string;
}

export interface PhotoGroup {
  key: string;
  title: string | null;
  area: string | null;
  roomId: string | null;
  photos: { photo: ListingPhoto; index: number }[];
}

/** Rooms with photos in the scan's order, then the photos in no room (all of them without one). */
export function groupPhotos(
  photos: readonly ListingPhoto[],
  rooms: readonly GalleryRoom[] | null,
  otherTitle: string,
): PhotoGroup[] {
  const indexed = photos.map((photo, index) => ({ photo, index }));
  const known = new Set(rooms?.map((room) => room.id));
  const groups: PhotoGroup[] = (rooms ?? []).flatMap((room, position) => {
    const inRoom = indexed.filter(({ photo }) => photo.roomId === room.id);
    return inRoom.length === 0
      ? []
      : [
          {
            key: `room-${position}`,
            title: room.name,
            area: room.area,
            roomId: room.id,
            photos: inRoom,
          },
        ];
  });
  const rest = indexed.filter(({ photo }) => !photo.roomId || !known.has(photo.roomId));
  if (rest.length > 0) {
    groups.push({
      key: 'other',
      title: groups.length > 0 ? otherTitle : null,
      area: null,
      roomId: null,
      photos: rest,
    });
  }
  return groups;
}
