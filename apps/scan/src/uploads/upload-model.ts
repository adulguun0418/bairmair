/**
 * How a scan on the phone becomes a scan on the server with a link: one record per scan, kept
 * next to the scan's files (`upload.json`), advanced one step at a time by the upload engine.
 *
 *   row → json → usdz → process → done
 *
 * Every step can be repeated safely: a repeated row insert is a duplicate (success), uploads
 * overwrite, processing again gives the same result. Pure: no React Native imports, so it is
 * unit-tested without a device.
 */

export const UPLOAD_STEPS = ['row', 'json', 'usdz', 'process', 'done'] as const;
export type UploadStep = (typeof UPLOAD_STEPS)[number];

export interface UploadRecord {
  version: 1;
  /** The scanner's folder id on the phone (`scan-20261120-…`). */
  localId: string;
  /** The `user_scans` id (a UUID made on the phone, so retries hit the same row). */
  remoteId: string;
  /** Only this user's session uploads it. */
  ownerId: string;
  title: string | null;
  /** ISO 8601, when the user asked for the link. */
  createdAt: string;
  step: UploadStep;
  /**
   * Stopped until the user acts: `limit` (the server refused a scan over the free limit),
   * `failed` (the server could not read the export). "Try again" clears it.
   */
  blocked: 'limit' | 'failed' | null;
  /** Temporary failures in a row, for the backoff. */
  failures: number;
  /** Times processing sent the record back (row or files missing) since it last succeeded;
   * after `MAX_REWINDS` it stops as failed rather than going round for ever. */
  rewinds: number;
  /** Epoch ms before which the engine leaves it alone (backoff), or null. */
  retryAt: number | null;
  /** The last error message, for diagnosis. */
  lastError: string | null;
  /** Device facts sent with the row. */
  device: { modelId: string | null; osVersion: string | null; appVersion: string | null };
}

/** What a step's attempt came to. */
export type UploadOutcome =
  | { kind: 'ok' }
  /** The row insert was refused: the user already keeps as many scans as allowed. */
  | { kind: 'limit' }
  /** Processing found no row (deleted elsewhere, or the insert never landed): insert again. */
  | { kind: 'rowMissing' }
  /** Processing found the files missing: upload them again. */
  | { kind: 'filesMissing' }
  /** The server cannot convert the export (HTTP 422). */
  | { kind: 'unreadable'; message: string }
  /** Network, server or session trouble: try the same step later. */
  | { kind: 'transient'; message: string }
  /** No session (signed out meanwhile): leave the record as it is. */
  | { kind: 'signedOut' };

export function newUploadRecord(input: {
  localId: string;
  remoteId: string;
  ownerId: string;
  title: string | null;
  now: Date;
  device: UploadRecord['device'];
}): UploadRecord {
  const title = input.title?.trim().slice(0, 80) || null;
  return {
    version: 1,
    localId: input.localId,
    remoteId: input.remoteId,
    ownerId: input.ownerId,
    title,
    createdAt: input.now.toISOString(),
    step: 'row',
    blocked: null,
    failures: 0,
    rewinds: 0,
    retryAt: null,
    lastError: null,
    device: input.device,
  };
}

/** Rounds of "row missing" / "files missing" before a record stops as failed. */
export const MAX_REWINDS = 3;

const BACKOFF_FIRST_MS = 5_000;
const BACKOFF_MAX_MS = 5 * 60_000;

/** Wait after `failures` temporary failures in a row: 5 s, 10 s, 20 s … at most 5 minutes. */
export function backoffMs(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(BACKOFF_FIRST_MS * 2 ** (failures - 1), BACKOFF_MAX_MS);
}

function nextStep(step: UploadStep): UploadStep {
  return UPLOAD_STEPS[Math.min(UPLOAD_STEPS.indexOf(step) + 1, UPLOAD_STEPS.length - 1)]!;
}

/** The record after one attempt at its current step. */
export function advance(record: UploadRecord, outcome: UploadOutcome, now: number): UploadRecord {
  const settled = { ...record, failures: 0, retryAt: null, lastError: null };
  switch (outcome.kind) {
    case 'ok': {
      const step = nextStep(record.step);
      return { ...settled, step, rewinds: step === 'done' ? 0 : record.rewinds };
    }
    case 'limit':
      return { ...settled, blocked: 'limit' };
    case 'rowMissing':
    case 'filesMissing': {
      const rewinds = record.rewinds + 1;
      const lastError = outcome.kind === 'rowMissing' ? 'row missing' : 'files missing';
      if (rewinds >= MAX_REWINDS) return { ...settled, rewinds, blocked: 'failed', lastError };
      return {
        ...settled,
        rewinds,
        step: outcome.kind === 'rowMissing' ? 'row' : 'json',
        lastError,
      };
    }
    case 'unreadable':
      return { ...settled, blocked: 'failed', lastError: outcome.message.slice(0, 500) };
    case 'transient': {
      const failures = record.failures + 1;
      return {
        ...record,
        failures,
        retryAt: now + backoffMs(failures),
        lastError: outcome.message.slice(0, 500),
      };
    }
    case 'signedOut':
      return record;
  }
}

/** Whether the engine should work on the record now (for this user). */
export function isDue(record: UploadRecord, userId: string, now: number): boolean {
  return (
    record.ownerId === userId &&
    record.step !== 'done' &&
    record.blocked === null &&
    (record.retryAt === null || record.retryAt <= now)
  );
}

/** "Try again": the user's tap clears a block and the backoff. A scan the server could not read
 * starts from processing again (the same export gives the same answer, but the converter may
 * have been fixed since). */
export function retryNow(record: UploadRecord): UploadRecord {
  return { ...record, blocked: null, failures: 0, rewinds: 0, retryAt: null };
}

/** The UI's word for where a record is. */
export type UploadStatus = 'uploading' | 'processing' | 'waiting' | 'failed' | 'limit' | 'done';

export function uploadStatus(record: UploadRecord): UploadStatus {
  if (record.step === 'done') return 'done';
  if (record.blocked) return record.blocked;
  if (record.failures > 0) return 'waiting';
  return record.step === 'process' ? 'processing' : 'uploading';
}

/** Reads a stored record; null for anything that is not one (an older or broken file). */
export function parseUploadRecord(text: string | null): UploadRecord | null {
  if (!text) return null;
  try {
    const value = JSON.parse(text) as Partial<UploadRecord>;
    if (
      value.version !== 1 ||
      typeof value.localId !== 'string' ||
      typeof value.remoteId !== 'string' ||
      typeof value.ownerId !== 'string' ||
      !UPLOAD_STEPS.includes(value.step as UploadStep)
    ) {
      return null;
    }
    return {
      version: 1,
      localId: value.localId,
      remoteId: value.remoteId,
      ownerId: value.ownerId,
      title: typeof value.title === 'string' ? value.title : null,
      createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
      step: value.step as UploadStep,
      blocked: value.blocked === 'limit' || value.blocked === 'failed' ? value.blocked : null,
      failures: typeof value.failures === 'number' ? value.failures : 0,
      rewinds: typeof value.rewinds === 'number' ? value.rewinds : 0,
      retryAt: typeof value.retryAt === 'number' ? value.retryAt : null,
      lastError: typeof value.lastError === 'string' ? value.lastError : null,
      device: {
        modelId: value.device?.modelId ?? null,
        osVersion: value.device?.osVersion ?? null,
        appVersion: value.device?.appVersion ?? null,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Scans that count toward the free limit before the server knows them: drafts on the phone and
 * records whose row is not inserted yet (and not refused). Added to the server's count.
 */
export function pendingLocalCount(
  drafts: number,
  records: readonly UploadRecord[],
  userId: string,
): number {
  return (
    drafts +
    records.filter((r) => r.ownerId === userId && r.step === 'row' && r.blocked !== 'limit').length
  );
}
