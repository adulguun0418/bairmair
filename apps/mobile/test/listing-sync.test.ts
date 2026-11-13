import { describe, expect, it } from 'vitest';
import {
  addPhotos,
  isUntouched,
  markCreated,
  markDeleted,
  markPhotoSaved,
  markPhotoUploaded,
  movePhoto,
  newListing,
  removePhoto,
  setLocation,
  updateForm,
  type LocalListing,
} from '../src/listings/model';
import { backoffMs } from '../src/listings/sync-engine';
import {
  classifyPostgrestError,
  classifyStorageResponse,
  SyncError,
} from '../src/listings/sync-errors';
import { isSynced, planSync } from '../src/listings/sync-plan';
import { OWNER, setup } from './sync-fakes';

const ID = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-11-13T10:00:00.000Z';
const ZAISAN = { lat: 47.8864, lng: 106.9057, accuracyM: 12, capturedAt: NOW };

const photo = (n: number) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`,
  file: `photo-${n}.jpg`,
  width: 2048,
  height: 1536,
});

function titled(): LocalListing {
  return updateForm(newListing(ID, OWNER, NOW), { title: 'Зайсан, 3 өрөө' }, NOW);
}

function created(): LocalListing {
  const listing = titled();
  return markCreated(listing, listing.rev);
}

describe('model', () => {
  it('starts untouched', () => {
    const listing = newListing(ID, OWNER, NOW);
    expect(isUntouched(listing)).toBe(true);
    expect(isUntouched(updateForm(listing, { title: 'x' }, NOW))).toBe(false);
    expect(updateForm(listing, { title: '' }, NOW)).toBe(listing); // no change, same object
  });

  it('counts listing and private changes separately', () => {
    const listing = created();
    const unit = updateForm(listing, { unitNumber: '45' }, NOW);
    expect([unit.rev, unit.privateRev]).toEqual([listing.rev, listing.privateRev + 1]);
    const price = updateForm(listing, { price: '1' }, NOW);
    expect([price.rev, price.privateRev]).toEqual([listing.rev + 1, listing.privateRev]);
    expect(setLocation(listing, ZAISAN, NOW).privateRev).toBe(listing.privateRev + 1);
  });

  it('caps photos at 40', () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ ...photo(1), id: `p${i}` }));
    expect(addPhotos(created(), many, NOW).photos).toHaveLength(40);
  });

  it('moves photos and clamps the target', () => {
    let listing = addPhotos(created(), [photo(1), photo(2), photo(3)], NOW);
    listing = movePhoto(listing, photo(3).id, 0, NOW);
    expect(listing.photos.map((p) => p.file)).toEqual([
      'photo-3.jpg',
      'photo-1.jpg',
      'photo-2.jpg',
    ]);
    listing = movePhoto(listing, photo(3).id, 99, NOW);
    expect(listing.photos.map((p) => p.file)).toEqual([
      'photo-1.jpg',
      'photo-2.jpg',
      'photo-3.jpg',
    ]);
  });

  it('remembers removed photos only once the listing may exist on the server', () => {
    const local = addPhotos(titled(), [photo(1)], NOW);
    expect(removePhoto(local, photo(1).id, NOW).removedPhotoIds).toEqual([]);
    const remote = addPhotos(created(), [photo(1)], NOW);
    expect(removePhoto(remote, photo(1).id, NOW).removedPhotoIds).toEqual([photo(1).id]);
  });
});

describe('planSync', () => {
  it('waits for a title before creating the row', () => {
    expect(planSync(newListing(ID, OWNER, NOW))).toEqual({ op: null, block: 'needsTitle' });
  });

  it('does not create a row with invalid fields', () => {
    const listing = updateForm(titled(), { price: 'abc' }, NOW);
    expect(planSync(listing)).toEqual({ op: null, block: 'invalidFields' });
  });

  it('creates the row first', () => {
    const listing = addPhotos(setLocation(titled(), ZAISAN, NOW), [photo(1)], NOW);
    expect(planSync(listing).op?.kind).toBe('createListing');
  });

  it('then updates fields, saves the location, removes, uploads, inserts and reorders', () => {
    let listing = created();
    listing = updateForm(listing, { price: '100', unitNumber: '45' }, NOW);
    listing = setLocation(listing, ZAISAN, NOW);
    listing = addPhotos(listing, [photo(1), photo(2)], NOW);
    listing = { ...listing, removedPhotoIds: ['gone'] };

    expect(planSync(listing).op).toMatchObject({ kind: 'updateListing', fields: { price: 100 } });
    listing = { ...listing, syncedRev: listing.rev };
    expect(planSync(listing).op).toEqual({
      kind: 'savePrivate',
      rev: listing.privateRev,
      lat: ZAISAN.lat,
      lng: ZAISAN.lng,
      unitNumber: '45',
    });
    listing = { ...listing, privateSyncedRev: listing.privateRev };
    expect(planSync(listing).op).toEqual({ kind: 'removePhoto', photoId: 'gone' });
    listing = { ...listing, removedPhotoIds: [] };
    expect(planSync(listing).op).toEqual({
      kind: 'uploadPhoto',
      photoId: photo(1).id,
      file: 'photo-1.jpg',
    });
    listing = markPhotoUploaded(listing, photo(1).id);
    expect(planSync(listing).op).toMatchObject({ kind: 'insertPhoto', sortOrder: 0 });
    listing = markPhotoSaved(listing, photo(1).id, 0);
    listing = markPhotoSaved(markPhotoUploaded(listing, photo(2).id), photo(2).id, 1);
    expect(isSynced(listing)).toBe(true);

    listing = movePhoto(listing, photo(2).id, 0, NOW);
    expect(planSync(listing).op).toEqual({
      kind: 'reorderPhoto',
      photoId: photo(2).id,
      sortOrder: 0,
    });
  });

  it('keeps the unit number until there is a location', () => {
    const listing = updateForm(created(), { unitNumber: '45' }, NOW);
    expect(planSync(listing)).toEqual({ op: null, block: null });
  });

  it('keeps uploading photos while a field is invalid, and reports the block', () => {
    let listing = addPhotos(created(), [photo(1)], NOW);
    listing = updateForm(listing, { rooms: '0' }, NOW);
    expect(planSync(listing).op?.kind).toBe('uploadPhoto');
    listing = markPhotoSaved(markPhotoUploaded(listing, photo(1).id), photo(1).id, 0);
    expect(planSync(listing)).toEqual({ op: null, block: 'invalidFields' });
  });

  it('deletes before anything else', () => {
    const listing = markDeleted(addPhotos(titled(), [photo(1)], NOW), NOW);
    expect(planSync(listing).op).toEqual({ kind: 'deleteListing' });
  });
});

describe('error classification', () => {
  it('sorts PostgREST errors', () => {
    expect(classifyPostgrestError({ code: '23514', message: 'check' }, 400).kind).toBe('permanent');
    expect(classifyPostgrestError({ code: '42501', message: 'rls' }, 403).kind).toBe('permanent');
    expect(
      classifyPostgrestError({ code: 'P0001', message: 'too_many_photos' }, 400),
    ).toMatchObject({ kind: 'permanent', key: 'tooManyPhotos' });
    expect(classifyPostgrestError({ code: 'PGRST301', message: 'jwt' }, 401).kind).toBe(
      'transient',
    );
    expect(classifyPostgrestError({ code: '', message: 'boom' }, 503).kind).toBe('transient');
    expect(
      classifyPostgrestError({ code: '', message: 'TypeError: Network request failed' }, 0),
    ).toMatchObject({ kind: 'transient', key: 'network' });
  });

  it('reads the status Storage hides in its body', () => {
    expect(classifyStorageResponse(200, '{}')).toBeNull();
    const rls = JSON.stringify({
      statusCode: '403',
      error: 'Unauthorized',
      message: 'new row violates row-level security policy',
    });
    expect(classifyStorageResponse(400, rls)?.kind).toBe('permanent');
    const expired = JSON.stringify({
      statusCode: '400',
      error: 'Unauthorized',
      message: '"exp" claim timestamp check failed',
    });
    expect(classifyStorageResponse(400, expired)?.kind).toBe('transient');
    expect(classifyStorageResponse(502, '<html>Bad gateway</html>')?.kind).toBe('transient');
  });

  it('backs off up to five minutes', () => {
    expect([1, 2, 3, 10].map(backoffMs)).toEqual([5_000, 10_000, 20_000, 300_000]);
  });
});

// Engine --------------------------------------------------------------------------------------

describe('SyncEngine', () => {
  it('sends a new listing with its location and photos', async () => {
    let listing = updateForm(titled(), { unitNumber: '45' }, NOW);
    listing = addPhotos(setLocation(listing, ZAISAN, NOW), [photo(1), photo(2)], NOW);
    const { store, remote, engine } = setup(listing);

    await engine.run();

    expect(remote.calls).toEqual([
      'createListing',
      'savePrivate',
      'uploadPhoto',
      'insertPhoto',
      'uploadPhoto',
      'insertPhoto',
    ]);
    expect(isSynced(store.get(ID)!)).toBe(true);
    expect(engine.status(ID)).toEqual({ state: 'idle' });
    expect([...remote.photos.values()]).toEqual([{ sortOrder: 0 }, { sortOrder: 1 }]);
  });

  it('waits with backoff after a network error, then resumes where it stopped', async () => {
    const { store, remote, engine, clock } = setup(addPhotos(created(), [photo(1)], NOW));
    remote.failures = [new TypeError('Network request failed')];

    await engine.run();
    expect(engine.status(ID)).toEqual({
      state: 'waiting',
      key: 'network',
      retryAt: clock.time + 5_000,
    });
    expect(clock.timers).toHaveLength(1);

    clock.time += 5_000;
    clock.timers.shift()!.callback();
    await engine.run();
    expect(remote.calls).toEqual(['uploadPhoto', 'uploadPhoto', 'insertPhoto']);
    expect(isSynced(store.get(ID)!)).toBe(true);
  });

  it('stops on a refused change until the listing is edited', async () => {
    const { store, remote, engine } = setup(updateForm(created(), { price: '5' }, NOW));
    remote.failures = [new SyncError('permanent', 'rejected')];

    await engine.run();
    expect(engine.status(ID)).toEqual({ state: 'failed', key: 'rejected' });
    await engine.run();
    expect(remote.calls).toEqual(['updateListing']);

    store.update(ID, (current) => updateForm(current, { price: '6' }, NOW));
    await engine.run();
    expect(remote.calls).toEqual(['updateListing', 'updateListing']);
    expect(engine.status(ID)).toEqual({ state: 'idle' });
  });

  it('marks the create as attempted before sending it', async () => {
    const { store, remote, engine } = setup(titled());
    remote.failures = [new TypeError('Network request failed')];
    await engine.run();
    expect(store.get(ID)!.remote).toEqual({ createAttempted: true, created: false });
  });

  it('pauses while signed out and skips other users’ listings', async () => {
    const { remote, engine } = setup(titled());
    remote.userId = null;
    await engine.run();
    expect(engine.status(ID)).toEqual({ state: 'signedOut' });

    remote.userId = '33333333-3333-4333-8333-333333333333';
    await engine.run();
    expect(remote.calls).toEqual([]);
  });

  it('drops a photo whose file is gone', async () => {
    const { store, files, engine } = setup(addPhotos(created(), [photo(1)], NOW));
    files.missing.add('photo-1.jpg');
    await engine.run();
    expect(store.get(ID)!.photos).toEqual([]);
  });

  it('deletes the listing on the server, then on the phone', async () => {
    const { store, remote, files, engine } = setup(markDeleted(created(), NOW));
    await engine.run();
    expect(remote.calls).toEqual(['deleteListing']);
    expect(store.get(ID)).toBeUndefined();
    expect(files.removedFolders).toEqual([ID]);
  });

  it('picks up edits made while an operation was in flight', async () => {
    const { store, remote, engine } = setup(created());
    store.update(ID, (current) => updateForm(current, { price: '1' }, NOW));
    const original = remote.updateListing.bind(remote);
    remote.updateListing = async (id, fields) => {
      await original(id, fields);
      // The seller types while the request is on its way.
      if (remote.calls.length === 1) {
        store.update(ID, (current) => updateForm(current, { price: '2' }, NOW));
      }
    };
    await engine.run();
    expect(remote.calls).toEqual(['updateListing', 'updateListing']);
    expect(remote.rows.get(ID)).toMatchObject({ price: 2 });
  });
});
