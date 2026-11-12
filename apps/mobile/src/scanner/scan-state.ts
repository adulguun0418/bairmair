/**
 * State of one scan session, driven by the user's taps and by expo-roomplan's events.
 *
 * What the native view (expo-roomplan 1.3.2) does, and why the rules below exist:
 * - "Next room" stops the current capture and immediately starts the next one. The finished
 *   room is processed in the background and reported with an `OK` status.
 * - "Finish" stops the capture, processes the last room, then exports every room. `OK` arrives
 *   before the export is written, so `OK` is not a completion signal; `onExported` is.
 * - If "Finish" is tapped while the previous room is still processing, that room's result can
 *   trigger the export before the last room is added. So both buttons wait for the pending room.
 * - After an error, the rooms already processed are still held natively and can be exported.
 *   Exporting with no processed room would wait forever, so that is only offered with rooms.
 *
 * Pure: no React Native imports, so it is unit-tested without a device.
 */

export type ScanErrorKind = 'not-supported' | 'camera' | 'unknown' | 'save';

export interface ScanError {
  kind: ScanErrorKind;
  /** The native (English) message, shown as a detail for diagnosis. */
  message?: string;
}

export interface ScanState {
  phase: 'intro' | 'scanning' | 'building' | 'saving' | 'failed';
  /** Rooms RoomPlan has finished processing. */
  roomsDone: number;
  /** A room was closed with "Next room" and is still being processed. */
  roomPending: boolean;
  error: ScanError | null;
}

export type NativeStatus = 'NotStarted' | 'Canceled' | 'Error' | 'OK';

export type ScanEvent =
  | { type: 'start' }
  | { type: 'nextRoom' }
  | { type: 'finish' }
  | { type: 'status'; status: NativeStatus; message?: string }
  | { type: 'exported' }
  | { type: 'exportCaptured' }
  | { type: 'saveFailed'; message?: string };

export const initialScanState: ScanState = {
  phase: 'intro',
  roomsDone: 0,
  roomPending: false,
  error: null,
};

/** Maps expo-roomplan's native error messages to something the app can explain. */
export function classifyScanError(message: string | undefined): ScanErrorKind {
  if (message === undefined) return 'unknown';
  if (/not supported/i.test(message)) return 'not-supported';
  if (/camera permission/i.test(message)) return 'camera';
  return 'unknown';
}

export const canAdvance = (state: ScanState): boolean =>
  state.phase === 'scanning' && !state.roomPending;

export const canExportCaptured = (state: ScanState): boolean =>
  state.phase === 'failed' && state.error?.kind !== 'save' && state.roomsDone > 0;

export function scanReducer(state: ScanState, event: ScanEvent): ScanState {
  switch (event.type) {
    case 'start':
      return state.phase === 'intro' ? { ...state, phase: 'scanning' } : state;

    case 'nextRoom':
      return canAdvance(state) ? { ...state, roomPending: true } : state;

    case 'finish':
      return canAdvance(state) ? { ...state, phase: 'building' } : state;

    case 'status':
      if (event.status === 'OK') {
        return state.roomPending
          ? { ...state, roomsDone: state.roomsDone + 1, roomPending: false }
          : state;
      }
      if (event.status === 'Error') {
        // Once the files are exported, a late native error no longer matters.
        if (state.phase === 'saving') return state;
        return {
          ...state,
          phase: 'failed',
          roomPending: false,
          error: { kind: classifyScanError(event.message), message: event.message },
        };
      }
      return state;

    case 'exported':
      return state.phase === 'building' ? { ...state, phase: 'saving', error: null } : state;

    case 'exportCaptured':
      return canExportCaptured(state) ? { ...state, phase: 'building', error: null } : state;

    case 'saveFailed':
      return { ...state, phase: 'failed', error: { kind: 'save', message: event.message } };
  }
}
