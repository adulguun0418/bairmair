import { describe, expect, it } from 'vitest';
import { analyzeExport } from '../src/scanner/analyze';
import { formatScanTime, isScanId, newScanId } from '../src/scanner/scan-meta';

describe('scan ids', () => {
  it('builds a sortable, file-name-safe id', () => {
    const id = newScanId(new Date(2026, 10, 12, 14, 3, 7), () => 0.5);
    expect(id).toBe('scan-20261112-140307-ssss');
    expect(isScanId(id)).toBe(true);
    expect(isScanId(newScanId())).toBe(true);
  });

  it('rejects anything that could escape the scans folder', () => {
    expect(isScanId('../secrets')).toBe(false);
    expect(isScanId('scan-20261112-140307-ssss/..')).toBe(false);
    expect(isScanId(undefined)).toBe(false);
  });

  it('formats the time the same way in every locale', () => {
    expect(formatScanTime(new Date(2026, 0, 5, 9, 4).toISOString())).toBe('2026-01-05 09:04');
    expect(formatScanTime('not a date')).toBe('');
  });
});

/** Column-major 4x4 translation. */
const at = (x: number, y: number, z: number) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

describe('analyzeExport', () => {
  it('converts a RoomPlan export and counts its contents', () => {
    const raw = {
      floors: [{ identifier: 'floor-1', transform: at(0, 0, 0), dimensions: [4, 0, 3] }],
      walls: [{ identifier: 'wall-1', transform: at(0, 1.3, -1.5), dimensions: [4, 2.6, 0] }],
    };
    const analysis = analyzeExport(JSON.stringify(raw));
    if (!analysis.ok) throw new Error(analysis.error);
    expect(analysis.metrics.totalAreaM2).toBe(12);
    expect(analysis.metrics.counts).toMatchObject({ rooms: 1, walls: 1 });
    expect(analysis.warningCount).toBe(0);
  });

  it('reports instead of throwing when the file is not a usable export', () => {
    expect(analyzeExport('{ truncated').ok).toBe(false);
    const notRoomPlan = analyzeExport(JSON.stringify({ hello: 'world' }));
    expect(notRoomPlan.ok).toBe(false);
    if (!notRoomPlan.ok) expect(notRoomPlan.error).toMatch(/Not a RoomPlan export/);
  });
});
