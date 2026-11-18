import { describe, expect, it } from 'vitest';
import { editorProgress, editorSteps, type EditorStepId } from '../src/listings/editor-steps';
import {
  addPhotos,
  newListing,
  setLocation,
  updateForm,
  type LocalListing,
} from '../src/listings/model';

const ID = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-11-17T10:00:00.000Z';
const ZAISAN = { lat: 47.8864, lng: 106.9057, accuracyM: 12, capturedAt: NOW };

const states = (listing: LocalListing) =>
  Object.fromEntries(editorSteps(listing).map((step) => [step.id, step.state])) as Record<
    EditorStepId,
    string
  >;

function complete(): LocalListing {
  let listing = newListing(ID, 'owner', NOW);
  listing = updateForm(
    listing,
    { title: '2 өрөө байр', price: '250000000', rooms: '2', areaOfficial: '55', districtId: 1 },
    NOW,
  );
  listing = setLocation(listing, ZAISAN, NOW);
  return addPhotos(listing, [{ id: 'p1', file: 'p1.jpg', width: 2048, height: 1536 }], NOW);
}

describe('editorSteps', () => {
  it('starts with everything to do', () => {
    const steps = editorSteps(newListing(ID, 'owner', NOW));
    expect(steps.map((step) => step.id)).toEqual([
      'basics',
      'price',
      'property',
      'location',
      'photos',
      'scan',
      'publish',
    ]);
    expect(steps.every((step) => step.state === 'todo')).toBe(true);
    expect(steps.find((step) => step.id === 'scan')?.optional).toBe(true);
    expect(editorProgress(steps)).toEqual({ done: 0, total: 5 });
  });

  it('marks each step done once its requirements are met', () => {
    const listing = complete();
    expect(states(listing)).toMatchObject({
      basics: 'done',
      price: 'done',
      property: 'done',
      location: 'done',
      photos: 'done',
      scan: 'todo',
      publish: 'todo',
    });
    expect(editorProgress(editorSteps(listing))).toEqual({ done: 5, total: 5 });
  });

  it('needs both the district and the pin for the location step', () => {
    const listing = updateForm(newListing(ID, 'owner', NOW), { districtId: 1 }, NOW);
    expect(states(listing).location).toBe('todo');
    expect(states(setLocation(listing, ZAISAN, NOW)).location).toBe('done');
  });

  it('flags a step whose field has an invalid value', () => {
    const listing = updateForm(complete(), { buildingYear: '1700', deposit: 'abc' }, NOW);
    const result = states(listing);
    expect(result.property).toBe('error');
    expect(result.basics).toBe('done');
  });

  it('counts the scanned area for the property step', () => {
    const listing = updateForm(complete(), { areaOfficial: '' }, NOW);
    expect(states(listing).property).toBe('todo');
    const scanned: LocalListing = {
      ...listing,
      scan: {
        id: 'scan',
        createdAt: NOW,
        files: null,
        device: null,
        appVersion: null,
        location: null,
        row: 'created',
        uploaded: { json: true, usdz: true },
        processing: 'ready',
        totalAreaM2: 54.2,
        roomLabels: {},
        roomDividers: [],
        entranceDoorId: null,
        labelsRev: 0,
        labelsSyncedRev: 0,
      },
    };
    expect(states(scanned)).toMatchObject({ property: 'done', scan: 'done' });
    const failed = { ...scanned, scan: { ...scanned.scan!, processing: 'failed' as const } };
    expect(states(failed)).toMatchObject({ property: 'todo', scan: 'error' });
  });

  it('is published once the server has the listing live', () => {
    const listing = { ...complete(), status: 'published' as const };
    expect(states(listing).publish).toBe('todo');
    expect(states({ ...listing, serverStatus: 'published' }).publish).toBe('done');
  });
});
