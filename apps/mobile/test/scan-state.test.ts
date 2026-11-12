import { describe, expect, it } from 'vitest';
import {
  canAdvance,
  canExportCaptured,
  classifyScanError,
  initialScanState,
  scanReducer,
  type ScanEvent,
  type ScanState,
} from '../src/scanner/scan-state';

const run = (...events: ScanEvent[]): ScanState => events.reduce(scanReducer, initialScanState);
const ok: ScanEvent = { type: 'status', status: 'OK' };
const error = (message?: string): ScanEvent => ({ type: 'status', status: 'Error', message });

describe('scanReducer', () => {
  it('scans several rooms, then exports and saves', () => {
    let state = run({ type: 'start' }, { type: 'nextRoom' });
    expect(state).toMatchObject({ phase: 'scanning', roomPending: true, roomsDone: 0 });

    state = scanReducer(state, ok);
    expect(state).toMatchObject({ roomPending: false, roomsDone: 1 });

    state = run({ type: 'start' }, { type: 'nextRoom' }, ok, { type: 'nextRoom' }, ok, {
      type: 'finish',
    });
    expect(state).toMatchObject({ phase: 'building', roomsDone: 2 });

    // OK arrives before the export is written: not a completion signal.
    state = scanReducer(state, ok);
    expect(state.phase).toBe('building');

    state = scanReducer(state, { type: 'exported' });
    expect(state.phase).toBe('saving');
  });

  it('waits for the pending room before the next room or finish', () => {
    const pending = run({ type: 'start' }, { type: 'nextRoom' });
    expect(canAdvance(pending)).toBe(false);
    expect(scanReducer(pending, { type: 'finish' })).toBe(pending);
    expect(scanReducer(pending, { type: 'nextRoom' })).toBe(pending);
    expect(canAdvance(scanReducer(pending, ok))).toBe(true);
  });

  it('ignores controls outside their phase', () => {
    expect(scanReducer(initialScanState, { type: 'finish' })).toBe(initialScanState);
    expect(scanReducer(initialScanState, { type: 'exported' })).toBe(initialScanState);
    const scanning = run({ type: 'start' });
    expect(scanReducer(scanning, { type: 'start' })).toBe(scanning);
  });

  it('fails on a native error and keeps the processed rooms exportable', () => {
    const failed = run(
      { type: 'start' },
      { type: 'nextRoom' },
      ok,
      { type: 'finish' },
      error('Boom'),
    );
    expect(failed).toMatchObject({
      phase: 'failed',
      roomsDone: 1,
      error: { kind: 'unknown', message: 'Boom' },
    });
    expect(canExportCaptured(failed)).toBe(true);
    expect(scanReducer(failed, { type: 'exportCaptured' })).toMatchObject({
      phase: 'building',
      error: null,
    });
  });

  it('does not offer an export when no room was processed', () => {
    const failed = run({ type: 'start' }, error('RoomPlan is not supported on this device.'));
    expect(failed.error?.kind).toBe('not-supported');
    expect(canExportCaptured(failed)).toBe(false);
    expect(scanReducer(failed, { type: 'exportCaptured' })).toBe(failed);
  });

  it('ignores a late native error once the files are being saved', () => {
    const saving = run({ type: 'start' }, { type: 'finish' }, { type: 'exported' });
    expect(scanReducer(saving, error('late'))).toBe(saving);
  });

  it('reports a failed save without offering a re-export', () => {
    const failed = run(
      { type: 'start' },
      { type: 'nextRoom' },
      ok,
      { type: 'finish' },
      { type: 'exported' },
      { type: 'saveFailed', message: 'disk full' },
    );
    expect(failed).toMatchObject({
      phase: 'failed',
      error: { kind: 'save', message: 'disk full' },
    });
    expect(canExportCaptured(failed)).toBe(false);
  });
});

describe('classifyScanError', () => {
  it("recognizes expo-roomplan's native messages", () => {
    expect(classifyScanError('RoomPlan is not supported on this device.')).toBe('not-supported');
    expect(classifyScanError('Camera permission was not granted.')).toBe('camera');
    expect(classifyScanError('Camera permission is denied or restricted.')).toBe('camera');
    expect(classifyScanError('Export failed: something')).toBe('unknown');
    expect(classifyScanError(undefined)).toBe('unknown');
  });
});
