import { describe, expect, it } from 'vitest';
import {
  addPhotos,
  assignPhotoRoom,
  attachScan,
  betterFix,
  markCreated,
  markPhotoSaved,
  markPhotoUploaded,
  markPrivateSynced,
  newListing,
  normalizeListing,
  removeScan,
  revertStatus,
  setLocation,
  setRoomLabel,
  setStatus,
  touch,
  updateForm,
  type LocalListing,
  type NewScan,
} from '../src/listings/model';
import { parseRoomLabels, scanFromRow } from '../src/listings/server-listings';
import { classifyPostgrestError, SyncError } from '../src/listings/sync-errors';
import {
  isSynced,
  missingForLive,
  missingToPublish,
  planSync,
  scanProgress,
} from '../src/listings/sync-plan';
import { OWNER, setup } from './sync-fakes';

const ID = '11111111-1111-4111-8111-111111111111';
const NOW = '2026-11-13T10:00:00.000Z';
const ZAISAN = { lat: 47.8864, lng: 106.9057, accuracyM: 12, capturedAt: NOW };
const SCAN_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SCAN_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const PHOTO = '00000000-0000-4000-8000-000000000001';

function newScan(id: string): NewScan {
  return {
    id,
    createdAt: NOW,
    files: { json: `scan-${id}.json`, usdz: `scan-${id}.usdz` },
    device: { modelId: 'iPhone16,2', osVersion: '26.1' },
    appVersion: '0.1.0',
    location: ZAISAN,
  };
}

/** A draft on the server with its location and one saved photo. */
function synced(form: Parameters<typeof updateForm>[1] = {}): LocalListing {
  let listing = updateForm(newListing(ID, OWNER, NOW), { title: 'Зайсан, 3 өрөө', ...form }, NOW);
  listing = setLocation(listing, ZAISAN, NOW);
  listing = addPhotos(listing, [{ id: PHOTO, file: 'p.jpg', width: 2048, height: 1536 }], NOW);
  listing = markCreated(listing, listing.rev);
  listing = markPrivateSynced(listing, listing.privateRev);
  return markPhotoSaved(markPhotoUploaded(listing, PHOTO), PHOTO, 0);
}

const COMPLETE = { price: '300000000', rooms: '3', areaOfficial: '80', districtId: 5 };

/** Runs the plan as if every operation succeeded with the fake server's defaults. */
async function runAll(listing: LocalListing) {
  const env = setup(listing);
  await env.engine.run();
  return env;
}

describe('model: scans', () => {
  it('reads 5b listing files without the new fields', () => {
    const { scan, removedScanIds, serverStatus, statusRev, statusSyncedRev, ...rest } = synced();
    const old = {
      ...rest,
      photos: rest.photos.map(({ roomId, savedRoom, ...photo }) => photo),
    } as unknown as LocalListing;
    const listing = normalizeListing(old);
    expect(listing).toMatchObject({
      scan: null,
      removedScanIds: [],
      serverStatus: 'draft',
      statusRev: 0,
      statusSyncedRev: 0,
    });
    expect(listing.photos[0]).toMatchObject({ roomId: null, savedRoom: null });
  });

  it('a rescan clears photo rooms and retires the old scan once it may be on the server', () => {
    let listing = attachScan(synced(), newScan(SCAN_A), NOW);
    listing = assignPhotoRoom(listing, PHOTO, 'room-1', NOW);
    expect(listing.photos[0]!.roomId).toBe('room-1');

    // Never sent: replacing it leaves nothing to clean up.
    const replaced = attachScan(listing, newScan(SCAN_B), NOW);
    expect(replaced.removedScanIds).toEqual([]);
    expect(replaced.photos[0]!.roomId).toBeNull();

    const sent = { ...listing, scan: { ...listing.scan!, row: 'attempted' as const } };
    expect(attachScan(sent, newScan(SCAN_B), NOW).removedScanIds).toEqual([SCAN_A]);
    expect(removeScan(sent, NOW)).toMatchObject({ scan: null, removedScanIds: [SCAN_A] });
  });

  it('keeps room names as typed and drops empty ones', () => {
    let listing = attachScan(synced(), newScan(SCAN_A), NOW);
    listing = setRoomLabel(listing, 'r1', { label: 'bedroom' }, NOW);
    listing = setRoomLabel(listing, 'r1', { name: 'Хүүхдийн ' }, NOW);
    expect(listing.scan!.roomLabels).toEqual({ r1: { label: 'bedroom', name: 'Хүүхдийн ' } });
    expect(listing.scan!.labelsRev).toBe(2);
    listing = setRoomLabel(listing, 'r1', { name: '' }, NOW);
    expect(listing.scan!.roomLabels).toEqual({ r1: { label: 'bedroom' } });
    expect(setRoomLabel(listing, 'r1', { label: 'bedroom' }, NOW)).toBe(listing);
  });

  it('puts photos in rooms only when there is a scan', () => {
    expect(assignPhotoRoom(synced(), PHOTO, 'r1', NOW).photos[0]!.roomId).toBeNull();
  });

  it('keeps the most accurate GPS fix', () => {
    const rough = { ...ZAISAN, accuracyM: 60 };
    const fine = { ...ZAISAN, accuracyM: 8 };
    expect(betterFix(null, rough)).toBe(rough);
    expect(betterFix(rough, fine)).toBe(fine);
    expect(betterFix(fine, rough)).toBe(fine);
    expect(betterFix(fine, { ...ZAISAN, accuracyM: null })).toBe(fine);
  });

  it('counts status changes and reverts to the server status', () => {
    const published = setStatus(synced(), 'published', NOW);
    expect([published.status, published.statusRev]).toEqual(['published', 1]);
    expect(setStatus(published, 'published', NOW)).toBe(published);
    expect(revertStatus(published, NOW).status).toBe('draft');
  });
});

describe('planSync: scans', () => {
  it('sends the row, labels, photo rooms, files, then asks the server to process', () => {
    let listing = attachScan(synced(), newScan(SCAN_A), NOW);
    listing = setRoomLabel(listing, 'r1', { label: 'kitchen' }, NOW);
    listing = assignPhotoRoom(listing, PHOTO, 'r1', NOW);
    expect(scanProgress(listing)).toBe('uploading');

    expect(planSync(listing).op).toMatchObject({ kind: 'createScan' });
    listing = { ...listing, scan: { ...listing.scan!, row: 'created' } };
    expect(planSync(listing).op).toEqual({
      kind: 'saveRoomLabels',
      scanId: SCAN_A,
      rev: 1,
      labels: { r1: { label: 'kitchen' } },
    });
    listing = { ...listing, scan: { ...listing.scan!, labelsSyncedRev: 1 } };
    expect(planSync(listing).op).toEqual({
      kind: 'assignPhotoRoom',
      photoId: PHOTO,
      room: { scanId: SCAN_A, roomId: 'r1' },
    });
    listing = {
      ...listing,
      photos: [{ ...listing.photos[0]!, savedRoom: { scanId: SCAN_A, roomId: 'r1' } }],
    };
    expect(planSync(listing).op).toMatchObject({ kind: 'uploadScanFile', file: 'json' });
    listing = { ...listing, scan: { ...listing.scan!, uploaded: { json: true, usdz: false } } };
    expect(planSync(listing).op).toMatchObject({ kind: 'uploadScanFile', file: 'usdz' });
    listing = { ...listing, scan: { ...listing.scan!, uploaded: { json: true, usdz: true } } };
    expect(scanProgress(listing)).toBe('processing');
    expect(planSync(listing).op).toEqual({
      kind: 'processScan',
      scanId: SCAN_A,
      hasLocalFiles: true,
    });
    listing = { ...listing, scan: { ...listing.scan!, processing: 'ready', totalAreaM2: 12.5 } };
    expect(isSynced(listing)).toBe(true);
  });

  it('removes a replaced scan only after its replacement is processed', () => {
    let listing = attachScan(synced(), newScan(SCAN_B), NOW);
    listing = {
      ...listing,
      removedScanIds: [SCAN_A],
      scan: { ...listing.scan!, row: 'created', uploaded: { json: true, usdz: true } },
    };
    expect(planSync(listing).op?.kind).toBe('processScan');
    listing = { ...listing, scan: { ...listing.scan!, processing: 'failed' } };
    expect(planSync(listing).op).toEqual({ kind: 'removeScan', scanId: SCAN_A });
  });

  it('clears a photo room left from a removed scan', () => {
    let listing = synced();
    listing = {
      ...listing,
      photos: [{ ...listing.photos[0]!, savedRoom: { scanId: SCAN_A, roomId: 'r1' } }],
    };
    expect(planSync(listing).op).toEqual({ kind: 'assignPhotoRoom', photoId: PHOTO, room: null });
  });
});

describe('planSync: status', () => {
  it('publishes once fields, location and photos are on the server', () => {
    let listing = updateForm(synced(), COMPLETE, NOW);
    listing = setStatus(listing, 'published', NOW);
    expect(planSync(listing).op?.kind).toBe('updateListing');
    listing = { ...listing, syncedRev: listing.rev };
    expect(planSync(listing).op).toEqual({ kind: 'setStatus', rev: 1, status: 'published' });
  });

  it('publishes before sending the scan when the official area is given', () => {
    let listing = updateForm(synced(COMPLETE), {}, NOW);
    listing = { ...listing, syncedRev: listing.rev };
    listing = setStatus(attachScan(listing, newScan(SCAN_A), NOW), 'published', NOW);
    expect(planSync(listing).op?.kind).toBe('setStatus');
  });

  it('waits for the scan to be processed when the area comes from it', () => {
    let listing = synced({ ...COMPLETE, areaOfficial: '' });
    listing = { ...listing, syncedRev: listing.rev };
    listing = setStatus(attachScan(listing, newScan(SCAN_A), NOW), 'published', NOW);
    expect(missingToPublish(listing)).toEqual([]);
    expect(missingForLive(listing)).toEqual(['area']);
    expect(planSync(listing).op?.kind).toBe('createScan');

    listing = {
      ...listing,
      scan: {
        ...listing.scan!,
        row: 'created',
        uploaded: { json: true, usdz: true },
        processing: 'ready',
        totalAreaM2: 64.2,
      },
    };
    expect(planSync(listing).op?.kind).toBe('setStatus');
  });

  it('holds back edits that would leave a live listing incomplete, but keeps sending photos', () => {
    let listing = synced(COMPLETE);
    listing = {
      ...listing,
      syncedRev: listing.rev,
      status: 'published',
      serverStatus: 'published',
    };
    listing = updateForm(listing, { price: '' }, NOW);
    listing = addPhotos(listing, [{ id: 'p2', file: 'p2.jpg', width: 1, height: 1 }], NOW);
    expect(planSync(listing).op?.kind).toBe('uploadPhoto');
    listing = markPhotoSaved(markPhotoUploaded(listing, 'p2'), 'p2', 1);
    expect(planSync(listing)).toEqual({ op: null, block: 'incompleteForLive' });
  });

  it('archives before saving fields that are only allowed off-line', () => {
    let listing = synced(COMPLETE);
    listing = {
      ...listing,
      syncedRev: listing.rev,
      status: 'published',
      serverStatus: 'published',
    };
    listing = setStatus(updateForm(listing, { price: '' }, NOW), 'archived', NOW);
    expect(planSync(listing).op).toEqual({ kind: 'setStatus', rev: 1, status: 'archived' });
    listing = { ...listing, statusSyncedRev: 1, serverStatus: 'archived' };
    expect(planSync(listing).op?.kind).toBe('updateListing');
  });
});

describe('SyncEngine: scans and publishing', () => {
  it('sends a scan end to end and publishes on the scanned area', async () => {
    let listing = synced({ ...COMPLETE, areaOfficial: '' });
    listing = { ...listing, syncedRev: listing.rev };
    listing = attachScan(listing, newScan(SCAN_A), NOW);
    listing = assignPhotoRoom(listing, PHOTO, 'r1', NOW);
    listing = setStatus(listing, 'published', NOW);

    const { store, remote, engine } = await runAll(listing);

    expect(remote.calls).toEqual([
      'createScan',
      'assignPhotoRoom',
      'uploadScanFile:json',
      'uploadScanFile:usdz',
      'processScan',
      'setStatus:published',
    ]);
    const after = store.get(ID)!;
    expect(after.scan).toMatchObject({ processing: 'ready', totalAreaM2: 12.5 });
    expect(after.serverStatus).toBe('published');
    expect(isSynced(after)).toBe(true);
    expect(engine.status(ID)).toEqual({ state: 'idle' });
  });

  it('marks a scan the server cannot convert as failed, and removes the replaced one', async () => {
    let listing = attachScan(synced(), newScan(SCAN_B), NOW);
    listing = { ...listing, removedScanIds: [SCAN_A] };
    const { store, remote, engine } = setup(listing);
    remote.processResults = [{ kind: 'failed' }];
    await engine.run();
    expect(store.get(ID)!.scan?.processing).toBe('failed');
    expect(remote.calls.slice(-2)).toEqual(['processScan', 'removeScan']);
    expect(store.get(ID)!.removedScanIds).toEqual([]);
  });

  it('uploads the files again when the server lacks them, after a backoff', async () => {
    const { store, remote, engine, clock } = setup(attachScan(synced(), newScan(SCAN_A), NOW));
    remote.processResults = [{ kind: 'filesMissing' }];
    await engine.run();
    expect(engine.status(ID)).toMatchObject({ state: 'waiting', key: 'server' });
    expect(store.get(ID)!.scan?.uploaded).toEqual({ json: false, usdz: false });

    clock.time += 5_000;
    await engine.run();
    expect(remote.calls.slice(-3)).toEqual([
      'uploadScanFile:json',
      'uploadScanFile:usdz',
      'processScan',
    ]);
    expect(store.get(ID)!.scan?.processing).toBe('ready');
  });

  it('gives up on a scan from another phone whose files never arrived', async () => {
    const scan = scanFromRow({
      id: SCAN_A,
      status: 'uploaded',
      metrics: null,
      room_labels: {},
      created_at: NOW,
      device_model: null,
      ios_version: null,
      app_version: null,
      scan_lat: null,
      scan_lng: null,
      scan_accuracy_m: null,
    });
    const { store, remote, engine } = setup({ ...synced(), scan });
    remote.processResults = [{ kind: 'filesMissing' }];
    await engine.run();
    expect(store.get(ID)!.scan?.processing).toBe('failed');
    expect(engine.status(ID)).toEqual({ state: 'idle' });
  });

  it('creates the scan row again when it was deleted elsewhere', async () => {
    let listing = attachScan(synced(), newScan(SCAN_A), NOW);
    listing = setRoomLabel(listing, 'r1', { label: 'kitchen' }, NOW);
    listing = { ...listing, scan: { ...listing.scan!, row: 'created' } };
    const { store, remote, engine } = setup(listing);
    remote.failures = [new SyncError('permanent', 'scanMissing')];
    await engine.run();
    expect(remote.calls.slice(0, 3)).toEqual(['saveRoomLabels', 'createScan', 'saveRoomLabels']);
    expect(store.get(ID)!.scan).toMatchObject({ row: 'created', processing: 'ready' });
  });

  it('shows a refused publish until the seller tries again', async () => {
    let listing = synced(COMPLETE);
    listing = setStatus({ ...listing, syncedRev: listing.rev }, 'published', NOW);
    const { store, remote, engine } = setup(listing);
    remote.failures = [new SyncError('permanent', 'needsVerifiedPhone')];

    await engine.run();
    expect(engine.status(ID)).toEqual({ state: 'failed', key: 'needsVerifiedPhone' });
    expect(store.get(ID)!.serverStatus).toBe('draft');

    store.update(ID, (current) => touch(current, NOW));
    await engine.run();
    expect(remote.calls).toEqual(['setStatus:published', 'setStatus:published']);
    expect(store.get(ID)!.serverStatus).toBe('published');
  });
});

describe('server data', () => {
  it('maps publishing refusals to their own messages', () => {
    const phone = { code: 'P0001', message: 'publish_requires_verified_phone' };
    expect(classifyPostgrestError(phone, 400)).toMatchObject({
      kind: 'permanent',
      key: 'needsVerifiedPhone',
    });
    expect(
      classifyPostgrestError({ code: 'P0001', message: 'publish_requires_photo' }, 400).key,
    ).toBe('needsPhoto');
    const check = {
      code: '23514',
      message:
        'new row for relation "listings" violates check constraint "listings_complete_when_live"',
    };
    expect(classifyPostgrestError(check, 400).key).toBe('incomplete');
  });

  it('keeps only well-formed room labels from the server', () => {
    expect(
      parseRoomLabels({
        a: { label: 'kitchen', name: 'Том гал тогоо' },
        b: { label: 'garage', name: '  ' },
        c: 'nope',
        d: { name: 7 },
      }),
    ).toEqual({ a: { label: 'kitchen', name: 'Том гал тогоо' }, b: {}, d: {} });
    expect(parseRoomLabels(null)).toEqual({});
  });

  it('turns a scan row into a scan this phone can follow', () => {
    const scan = scanFromRow({
      id: SCAN_A,
      status: 'ready',
      metrics: { totalAreaM2: 64.2 },
      room_labels: { r1: { label: 'bedroom' } },
      created_at: NOW,
      device_model: 'iPhone16,2',
      ios_version: '26.1',
      app_version: '0.1.0',
      scan_lat: ZAISAN.lat,
      scan_lng: ZAISAN.lng,
      scan_accuracy_m: 9,
    });
    expect(scan).toMatchObject({
      files: null,
      row: 'created',
      processing: 'ready',
      totalAreaM2: 64.2,
      roomLabels: { r1: { label: 'bedroom' } },
      location: { lat: ZAISAN.lat, lng: ZAISAN.lng, accuracyM: 9 },
    });
  });
});
