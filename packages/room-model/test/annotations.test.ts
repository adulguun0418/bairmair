import { describe, expect, it } from 'vitest';
import { applyAnnotations, parseRoomModel } from '../src/index';
import { minimalModel } from './helpers';

describe('applyAnnotations', () => {
  it('returns an equal model when there is nothing to apply', () => {
    expect(applyAnnotations(minimalModel(), {})).toEqual(minimalModel());
  });

  it('does not modify the model it is given', () => {
    const model = minimalModel();
    applyAnnotations(model, {
      roomLabels: { 'room-1': { label: 'kitchen', name: 'Гал тогоо' } },
      photos: [{ id: 'photo-1', roomId: 'room-1' }],
    });
    expect(model).toEqual(minimalModel());
  });

  it('overrides a room label', () => {
    const result = applyAnnotations(minimalModel(), {
      roomLabels: { 'room-1': { label: 'livingRoom' } },
    });
    expect(result.rooms[0]!.label).toBe('livingRoom');
    expect(result.rooms[0]!.name).toBeUndefined();
  });

  it('sets a custom name and keeps the label', () => {
    const result = applyAnnotations(minimalModel(), {
      roomLabels: { 'room-1': { name: '  Хүүхдийн өрөө  ' } },
    });
    expect(result.rooms[0]!.label).toBe('bedroom');
    expect(result.rooms[0]!.name).toBe('Хүүхдийн өрөө');
  });

  it('removes a name with null or an empty string', () => {
    const named = applyAnnotations(minimalModel(), {
      roomLabels: { 'room-1': { name: 'Study' } },
    });
    for (const name of [null, '', '   ']) {
      const result = applyAnnotations(named, { roomLabels: { 'room-1': { name } } });
      expect(result.rooms[0]).not.toHaveProperty('name');
    }
  });

  it('ignores overrides for rooms that are not in the model', () => {
    const result = applyAnnotations(minimalModel(), {
      roomLabels: { 'room-from-an-older-scan': { label: 'kitchen' } },
    });
    expect(result).toEqual(minimalModel());
  });

  it('builds hotspots from photo assignments', () => {
    const result = applyAnnotations(minimalModel(), {
      photos: [
        { id: 'photo-1', roomId: 'room-1' },
        { id: 'photo-2', roomId: 'room-1' },
      ],
    });
    expect(result.hotspots).toEqual([
      { photoId: 'photo-1', roomId: 'room-1' },
      { photoId: 'photo-2', roomId: 'room-1' },
    ]);
  });

  it('skips photos without a room, in an unknown room, or listed twice', () => {
    const result = applyAnnotations(minimalModel(), {
      photos: [
        { id: 'photo-1', roomId: null },
        { id: 'photo-2', roomId: 'room-from-an-older-scan' },
        { id: 'photo-3', roomId: 'room-1' },
        { id: 'photo-3', roomId: 'room-1' },
      ],
    });
    expect(result.hotspots).toEqual([{ photoId: 'photo-3', roomId: 'room-1' }]);
  });

  it('replaces existing hotspots when photos are given, and keeps them otherwise', () => {
    const withHotspot = applyAnnotations(minimalModel(), {
      photos: [{ id: 'photo-1', roomId: 'room-1' }],
    });
    expect(applyAnnotations(withHotspot, {}).hotspots).toHaveLength(1);
    expect(applyAnnotations(withHotspot, { photos: [] }).hotspots).toEqual([]);
  });

  it('always produces a valid model', () => {
    const result = applyAnnotations(minimalModel(), {
      roomLabels: { 'room-1': { label: 'toilet', name: 'WC' } },
      photos: [
        { id: 'photo-1', roomId: 'room-1' },
        { id: 'photo-2', roomId: 'gone' },
      ],
    });
    expect(parseRoomModel(result)).toEqual(result);
  });
});
