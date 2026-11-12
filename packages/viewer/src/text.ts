import type { FloorPlanText, Room } from '@bairmair/room-model';

/**
 * Every string the viewers show. The viewers have no translations of their own: the app passes
 * these in, already localized, so the same components serve every language.
 */
export interface ViewerText extends FloorPlanText {
  /** Accessible name of a photo marker, for example "Photo 2: Kitchen". */
  photo(index: number, room: Room): string;
  resetView: string;
  /** Short usage hint shown over the 3D view. */
  hint: string;
  /** Shown instead of the 3D view when the device cannot run WebGL. */
  webglUnavailable: string;
}
