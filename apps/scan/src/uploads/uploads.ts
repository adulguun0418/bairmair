import {
  deleteScan,
  getScan,
  listScans,
  readScanSidecar,
  writeScanSidecar,
  type SavedScan,
} from '@bairmair/scanner/native';
import Constants from 'expo-constants';
import { randomUUID } from 'expo-crypto';
import { File, UploadType } from 'expo-file-system';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { env } from '@/lib/env';
import { supabase } from '@/lib/supabase';
import { UploadEngine, type UploadRecordStore } from './engine';
import { createUploadRemote, type UploadFile } from './remote';
import { newUploadRecord, parseUploadRecord, retryNow, type UploadRecord } from './upload-model';

// The app's uploads: records next to each scan on the phone, one engine, started at launch.

const RECORD_FILE = 'upload.json';

const uploadFile: UploadFile = async (url, fileUri, headers) => {
  // A background URL session: an upload in progress continues for a while if the app is
  // switched away. If the app is killed, the engine uploads the file again on next launch.
  const result = await new File(fileUri).upload(url, {
    httpMethod: 'POST',
    uploadType: UploadType.BINARY_CONTENT,
    headers,
  });
  return { status: result.status, body: result.body };
};

const readRecord = (localId: string) => parseUploadRecord(readScanSidecar(localId, RECORD_FILE));

const store: UploadRecordStore = {
  list: () =>
    listScans()
      .map((scan) => readRecord(scan.meta.id))
      .filter((record): record is UploadRecord => record !== null),
  get: readRecord,
  save: (record) => writeScanSidecar(record.localId, RECORD_FILE, JSON.stringify(record)),
  files: (localId) => {
    const scan = getScan(localId);
    return scan?.usdz ? { json: scan.rawJson.uri, usdz: scan.usdz.uri } : null;
  },
};

const engine = new UploadEngine(
  store,
  createUploadRemote(supabase, {
    supabaseUrl: env.supabaseUrl,
    publishableKey: env.supabasePublishableKey,
    apiUrl: env.apiUrl,
    uploadFile,
  }),
);

// Screens re-read the phone's scans whenever something changed (an upload step, a new or
// deleted scan).
let version = 0;
const listeners = new Set<() => void>();
function changed(): void {
  version++;
  for (const listener of listeners) listener();
}
engine.subscribe(changed);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Starts uploading: now, whenever the app comes back to the foreground, and on sign-in. */
export function startUploads(): () => void {
  engine.kick();
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') engine.kick();
  });
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') engine.kick();
  });
  return () => {
    appState.remove();
    data.subscription.unsubscribe();
  };
}

/** A scan on the phone and, once the user asked for its link, its upload record. */
export interface LocalScan {
  scan: SavedScan;
  record: UploadRecord | null;
}

let cache: { version: number; scans: LocalScan[] } | null = null;

function snapshot(): LocalScan[] {
  if (cache?.version !== version) {
    cache = {
      version,
      scans: listScans().map((scan) => ({ scan, record: readRecord(scan.meta.id) })),
    };
  }
  return cache.scans;
}

/** Every scan on the phone with its upload record, newest first; re-renders on changes. */
export function useLocalScans(): LocalScan[] {
  return useSyncExternalStore(subscribe, snapshot);
}

/** The user asked for a link: record the upload and start it. */
export function createUpload(localId: string, ownerId: string, title: string | null): void {
  const scan = getScan(localId);
  if (!scan) throw new Error(`no scan ${localId}`);
  store.save(
    newUploadRecord({
      localId,
      remoteId: randomUUID(),
      ownerId,
      title,
      now: new Date(),
      device: {
        modelId: scan.meta.device?.modelId ?? null,
        osVersion: scan.meta.device?.osVersion ?? null,
        appVersion: Constants.expoConfig?.version ?? null,
      },
    }),
  );
  changed();
  engine.kick();
}

/** "Try again" on a stopped or waiting upload. */
export function retryUpload(localId: string): void {
  const record = readRecord(localId);
  if (!record) return;
  store.save(retryNow(record));
  changed();
  engine.kick();
}

/** Removes a scan from the phone (its files and its upload record). */
export function deleteLocalScan(localId: string): void {
  deleteScan(localId);
  changed();
}

/** Removes the phone's copy of a server scan, if this phone made it. */
export function deleteLocalCopyOf(remoteId: string): void {
  for (const { scan, record } of snapshot()) {
    if (record?.remoteId === remoteId) deleteScan(scan.meta.id);
  }
  changed();
}

/** After account deletion: this user's scans leave the phone too. */
export function forgetScansOf(userId: string): void {
  for (const { scan, record } of snapshot()) {
    if (record?.ownerId === userId) deleteScan(scan.meta.id);
  }
  changed();
}

/** Re-reads the phone's scans (after the scanner saved a new one). */
export function refreshLocalScans(): void {
  changed();
}
