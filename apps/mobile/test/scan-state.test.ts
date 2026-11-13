import { describe, expect, it } from 'vitest';
import {
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
  it('scans, then exports and saves', () => {
    let state = run({ type: 'start' });
    expect(state.phase).toBe('scanning');

    state = scanReducer(state, { type: 'finish' });
    expect(state.phase).toBe('building');

    // OK arrives before the export is written: not a completion signal.
    state = scanReducer(state, ok);
    expect(state.phase).toBe('building');

    state = scanReducer(state, { type: 'exported' });
    expect(state.phase).toBe('saving');
  });

  it('ignores controls outside their phase', () => {
    expect(scanReducer(initialScanState, { type: 'finish' })).toBe(initialScanState);
    expect(scanReducer(initialScanState, { type: 'exported' })).toBe(initialScanState);
    const scanning = run({ type: 'start' });
    expect(scanReducer(scanning, { type: 'start' })).toBe(scanning);
    expect(scanReducer(scanning, ok)).toBe(scanning);
    const building = run({ type: 'start' }, { type: 'finish' });
    expect(scanReducer(building, { type: 'finish' })).toBe(building);
  });

  it('fails on a native error', () => {
    expect(run({ type: 'start' }, { type: 'finish' }, error('Boom'))).toEqual({
      phase: 'failed',
      error: { kind: 'unknown', message: 'Boom' },
    });
    expect(
      run({ type: 'start' }, error('RoomPlan is not supported on this device.')).error?.kind,
    ).toBe('not-supported');
  });

  it('ignores a late native error once the files are being saved', () => {
    const saving = run({ type: 'start' }, { type: 'finish' }, { type: 'exported' });
    expect(scanReducer(saving, error('late'))).toBe(saving);
  });

  it('reports a failed save', () => {
    const failed = run(
      { type: 'start' },
      { type: 'finish' },
      { type: 'exported' },
      { type: 'saveFailed', message: 'disk full' },
    );
    expect(failed).toEqual({ phase: 'failed', error: { kind: 'save', message: 'disk full' } });
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
