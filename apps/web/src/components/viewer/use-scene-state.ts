'use client';

import { layoutHotspots, type RoomModelV1 } from '@bairmair/room-model';
import type { ViewerText } from '@bairmair/viewer';
import { useMemo, useState } from 'react';
import type { ScenePhoto } from './PhotoDialog';

/**
 * The selected room and the open photo, shared by the 3D view, the floor plan and the room
 * list: selecting a room anywhere highlights it everywhere, and opening a photo selects its room.
 */
export function useSceneState(model: RoomModelV1, photos: ScenePhoto[], text: ViewerText) {
  const rooms = useMemo(() => new Map(model.rooms.map((room) => [room.id, room])), [model]);
  // Number photos in the same order as the markers in both views.
  const photoNumbers = useMemo(
    () => new Map(layoutHotspots(model).map((placement, index) => [placement.photoId, index + 1])),
    [model],
  );

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [openPhotoId, setOpenPhotoId] = useState<string | null>(null);

  const toggleRoom = (roomId: string) =>
    setSelectedRoomId((current) => (current === roomId ? null : roomId));
  const showPhoto = (photoId: string) => {
    setOpenPhotoId(photoId);
    const photo = photos.find((candidate) => candidate.id === photoId);
    if (photo) setSelectedRoomId(photo.roomId);
  };

  const openPhoto = photos.find((photo) => photo.id === openPhotoId) ?? null;
  const openPhotoRoom = openPhoto ? rooms.get(openPhoto.roomId) : undefined;
  const caption =
    openPhoto && openPhotoRoom
      ? text.photo(photoNumbers.get(openPhoto.id) ?? 1, openPhotoRoom)
      : '';

  return {
    rooms,
    selectedRoomId,
    toggleRoom,
    showPhoto,
    /** Props for `PhotoDialog`, apart from the close label. */
    dialog: { photo: openPhoto, caption, onClose: () => setOpenPhotoId(null) },
  };
}
