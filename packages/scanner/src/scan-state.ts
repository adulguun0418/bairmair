/**
 * State of one scan session, driven by the user's taps and by expo-roomplan's events.
 *
 * One continuous capture covers the whole apartment: the seller walks through every room, then
 * taps "Finish". The converter splits the floor into rooms along the walls afterwards.
 * expo-roomplan's own "add room" is not used: in 1.3.2 it restarts the capture before the
 * finished room is delivered, and that room never arrives (seen on an iPhone, 2026-11-13).
 *
 * What the native view (expo-roomplan 1.3.2) does, and why the rules below exist:
 * - "Finish" stops the capture, processes the room, then exports it. `OK` arrives before the
 *   export is written, so `OK` is not a completion signal; `onExported` is.
 * - After an error nothing has been processed, so there is nothing to export: the seller
 *   starts again. This includes RoomPlan ending the capture itself (scene too large, device
 *   too hot, tracking lost): expo-roomplan drops the captured data when `didEndWith` carries an
 *   error, so a partial scan cannot be kept without patching its Swift.
 *
 * Pure: no React Native imports, so it is unit-tested without a device.
 */

export type ScanErrorKind =
  | 'not-supported'
  | 'camera'
  | 'too-large'
  | 'too-hot'
  | 'tracking'
  /** Another RoomPlan capture error, or one whose message names no case. */
  | 'stopped'
  | 'unknown'
  | 'save';

export interface ScanError {
  kind: ScanErrorKind;
  /** The native (English) message, shown as a detail for diagnosis. */
  message?: string;
}

export interface ScanState {
  phase: 'intro' | 'scanning' | 'building' | 'saving' | 'failed';
  error: ScanError | null;
}

export type NativeStatus = 'NotStarted' | 'Canceled' | 'Error' | 'OK';

export type ScanEvent =
  | { type: 'start' }
  | { type: 'finish' }
  | { type: 'status'; status: NativeStatus; message?: string }
  | { type: 'exported' }
  | { type: 'saveFailed'; message?: string };

export const initialScanState: ScanState = { phase: 'intro', error: null };

/**
 * Maps expo-roomplan's native error messages to something the app can explain.
 *
 * RoomPlan's own errors reach JS as `error.localizedDescription`. Its exact wording is not
 * documented (developers quote `RoomCaptureSession.CaptureError.exceedSceneSizeLimit`, "Room size
 * exceeded", "sizeLimit exceeded"), so the case names and common phrasings are matched loosely.
 * A bridged Swift error may only say "CaptureError error N" (undocumented numbering): `stopped`.
 * Unmatched messages stay `unknown`. Both are still shown as a detail.
 */
export function classifyScanError(message: string | undefined): ScanErrorKind {
  if (message === undefined) return 'unknown';
  if (/not supported/i.test(message)) return 'not-supported';
  if (/camera permission/i.test(message)) return 'camera';
  if (/scene ?size|size ?limit|size exceeded|too (large|big)/i.test(message)) return 'too-large';
  if (/too ?hot|thermal|overheat/i.test(message)) return 'too-hot';
  if (/tracking/i.test(message)) return 'tracking';
  if (/CaptureError/.test(message)) return 'stopped';
  return 'unknown';
}

export function scanReducer(state: ScanState, event: ScanEvent): ScanState {
  switch (event.type) {
    case 'start':
      return state.phase === 'intro' ? { ...state, phase: 'scanning' } : state;

    case 'finish':
      return state.phase === 'scanning' ? { ...state, phase: 'building' } : state;

    case 'status':
      if (event.status === 'Error') {
        // Once the files are exported, a late native error no longer matters.
        if (state.phase === 'saving') return state;
        return {
          phase: 'failed',
          error: { kind: classifyScanError(event.message), message: event.message },
        };
      }
      return state;

    case 'exported':
      return state.phase === 'building' ? { phase: 'saving', error: null } : state;

    case 'saveFailed':
      return { phase: 'failed', error: { kind: 'save', message: event.message } };
  }
}
