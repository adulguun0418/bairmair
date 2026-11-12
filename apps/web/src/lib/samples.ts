import { applyAnnotations, parseRoomModel, type RoomModelV1 } from '@bairmair/room-model';
import lShaped from '@bairmair/room-model/samples/l-shaped.json';
import scanLRoom from '@bairmair/room-model/samples/scan-l-room.json';
import studio from '@bairmair/room-model/samples/studio.json';
import twoRoom from '@bairmair/room-model/samples/two-room.json';

// Sample apartments until real listings exist: three hand-made ones and one real iPhone scan,
// converted from the raw RoomPlan export in packages/room-model/test/fixtures/roomplan/.

export const SAMPLE_NAMES = ['two-room', 'studio', 'l-shaped', 'scan-l-room'] as const;
export type SampleName = (typeof SAMPLE_NAMES)[number];

export function isSampleName(value: string): value is SampleName {
  return (SAMPLE_NAMES as readonly string[]).includes(value);
}

export interface SamplePhoto {
  id: string;
  roomId: string;
  src: string;
}

const MODELS: Record<SampleName, unknown> = {
  studio,
  'two-room': twoRoom,
  'l-shaped': lShaped,
  'scan-l-room': scanLRoom,
};

const photo = (id: string, roomId: string, image: string): SamplePhoto => ({
  id,
  roomId,
  src: `/samples/photos/${image}.svg`,
});

/** Placeholder photos, assigned to rooms the way a seller would in the photo step. */
const PHOTOS: Record<SampleName, SamplePhoto[]> = {
  'two-room': [
    photo('two-room-1', 'living', 'living'),
    photo('two-room-2', 'living', 'dining'),
    photo('two-room-3', 'bedroom', 'bedroom'),
    photo('two-room-4', 'kitchen', 'kitchen'),
    photo('two-room-5', 'hallway', 'hallway'),
    photo('two-room-6', 'bathroom', 'bathroom'),
  ],
  studio: [
    photo('studio-1', 'main', 'living'),
    photo('studio-2', 'main', 'kitchen'),
    photo('studio-3', 'bathroom', 'bathroom'),
  ],
  'l-shaped': [
    photo('l-shaped-1', 'living', 'living'),
    photo('l-shaped-2', 'living', 'dining'),
    photo('l-shaped-3', 'kitchen', 'kitchen'),
  ],
  'scan-l-room': [],
};

export interface Sample {
  name: SampleName;
  /** The model with photo hotspots applied, as a listing page would serve it. */
  model: RoomModelV1;
  photos: SamplePhoto[];
}

export function getSample(name: SampleName): Sample {
  const photos = PHOTOS[name];
  const model = applyAnnotations(parseRoomModel(MODELS[name]), {
    photos: photos.map(({ id, roomId }) => ({ id, roomId })),
  });
  return { name, model, photos };
}
