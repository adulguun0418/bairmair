import {
  BUCKETS,
  CONTENT_TYPES,
  dbErrorKey,
  processUserScanPath,
  userScanRawPaths,
  type TypedSupabaseClient,
} from '@bairmair/db';
import type { UploadOutcome, UploadRecord } from './upload-model';

/**
 * The upload steps against Supabase and the web server. Every answer becomes an `UploadOutcome`;
 * nothing here throws. Network functions are injected, so it is unit-tested with fakes.
 */

/** Sends a file from the phone as the raw request body. Resolves for any HTTP status. */
export type UploadFile = (
  url: string,
  fileUri: string,
  headers: Record<string, string>,
) => Promise<{ status: number; body: string }>;

export interface UploadRemote {
  /** The signed-in user's id, or null (signed out). Throws on a network failure. */
  currentUserId(): Promise<string | null>;
  run(record: UploadRecord, files: { json: string; usdz: string }): Promise<UploadOutcome>;
}

interface Options {
  supabaseUrl: string;
  publishableKey: string;
  /** The web app, which hosts `POST /api/user-scans/{id}/process`. */
  apiUrl: string;
  uploadFile: UploadFile;
  fetch?: typeof fetch;
}

const UNIQUE_VIOLATION = '23505';

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A storage HTTP answer: 2xx ok; everything else is retried later (a refused upload usually
 * means an expired session or a row not visible yet; the backoff keeps it cheap). */
function storageOutcome(status: number, body: string): UploadOutcome {
  if (status >= 200 && status < 300) return { kind: 'ok' };
  return { kind: 'transient', message: `storage ${status}: ${body.slice(0, 200)}` };
}

export function createUploadRemote(client: TypedSupabaseClient, options: Options): UploadRemote {
  const storageBase = `${options.supabaseUrl.replace(/\/+$/, '')}/storage/v1/object`;
  const apiBase = options.apiUrl.replace(/\/+$/, '');
  const fetcher = options.fetch ?? fetch;

  async function accessToken(): Promise<string | null> {
    const { data, error } = await client.auth.getSession();
    if (data.session) return data.session.access_token;
    // getSession refreshes an expired token; offline that fails, which is not signed out.
    if (error) throw error;
    return null;
  }

  async function insertRow(record: UploadRecord): Promise<UploadOutcome> {
    const { error } = await client.from('user_scans').insert({
      id: record.remoteId,
      title: record.title,
      device_model: record.device.modelId?.slice(0, 40) ?? null,
      ios_version: record.device.osVersion?.slice(0, 20) ?? null,
      app_version: record.device.appVersion?.slice(0, 20) ?? null,
    });
    if (!error || error.code === UNIQUE_VIOLATION) return { kind: 'ok' };
    if (dbErrorKey(error) === 'scan_limit_reached') return { kind: 'limit' };
    return { kind: 'transient', message: `${error.code ?? ''} ${error.message}`.trim() };
  }

  async function upload(record: UploadRecord, fileUri: string, which: 'json' | 'usdz') {
    const token = await accessToken();
    if (!token) return { kind: 'signedOut' } as const;
    const path = userScanRawPaths(record.ownerId, record.remoteId)[which];
    const response = await options.uploadFile(
      `${storageBase}/${BUCKETS.userScanRaw}/${path}`,
      fileUri,
      {
        Authorization: `Bearer ${token}`,
        apikey: options.publishableKey,
        'Content-Type': which === 'json' ? CONTENT_TYPES.json : CONTENT_TYPES.usdz,
        // The same scan always has the same files, so a repeated upload just overwrites.
        'x-upsert': 'true',
      },
    );
    return storageOutcome(response.status, response.body);
  }

  async function processScan(record: UploadRecord): Promise<UploadOutcome> {
    const token = await accessToken();
    if (!token) return { kind: 'signedOut' };
    const response = await fetcher(`${apiBase}${processUserScanPath(record.remoteId)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    switch (response.status) {
      case 200:
        return { kind: 'ok' };
      case 404:
        return { kind: 'rowMissing' };
      case 409:
        return { kind: 'filesMissing' };
      case 422:
        return { kind: 'unreadable', message: 'scan_conversion_failed' };
      default:
        return { kind: 'transient', message: `process ${response.status}` };
    }
  }

  return {
    async currentUserId() {
      const { data, error } = await client.auth.getSession();
      if (data.session) return data.session.user.id;
      if (error) throw error;
      return null;
    },

    async run(record, files) {
      try {
        switch (record.step) {
          case 'row': {
            if (!(await accessToken())) return { kind: 'signedOut' };
            return await insertRow(record);
          }
          case 'json':
            return await upload(record, files.json, 'json');
          case 'usdz':
            return await upload(record, files.usdz, 'usdz');
          case 'process':
            return await processScan(record);
          case 'done':
            return { kind: 'ok' };
        }
      } catch (error) {
        // fetch() rejects when there is no connection; anything unexpected is retried later.
        return { kind: 'transient', message: message(error) };
      }
    },
  };
}
