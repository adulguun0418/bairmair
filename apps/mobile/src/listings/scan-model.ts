import { BUCKETS, publicObjectUrl, scanModelPaths } from '@bairmair/db';
import {
  applyAnnotations,
  computeMetrics,
  safeParseRoomModel,
  type ModelMetrics,
  type RoomModelV1,
} from '@bairmair/room-model';
import { useEffect, useSyncExternalStore } from 'react';
import { env } from '@/lib/env';
import { analyzeExport } from '@/scanner/analyze';
import { readListingText } from './files';
import type { LocalListing, LocalScan } from './model';

// The RoomModel of a listing's scan, for the review screens. Converted on the phone from the
// raw file when it is here (exactly what the server will produce), otherwise read from the
// public `model.json` the server wrote (a listing downloaded from another phone).

export type ScanModelState =
  | { status: 'loading' }
  /** Not converted yet and no raw file on this phone. */
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; model: RoomModelV1; metrics: ModelMetrics; incompleteRoomIds: string[] };

const LOADING: ScanModelState = { status: 'loading' };
const UNAVAILABLE: ScanModelState = { status: 'unavailable' };
const ERROR: ScanModelState = { status: 'error' };

/** Same rule as the converter's `incomplete-room` warning. */
const MIN_ROOM_WALLS = 3;

function ready(model: RoomModelV1): ScanModelState {
  return {
    status: 'ready',
    model,
    metrics: computeMetrics(model),
    incompleteRoomIds: model.rooms
      .filter(
        (room) => model.walls.filter((wall) => wall.roomId === room.id).length < MIN_ROOM_WALLS,
      )
      .map((room) => room.id),
  };
}

const states = new Map<string, ScanModelState>();
const loading = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The cached state; converts a local raw file on first use (cached, so the result is stable). */
function peek(listingId: string, scan: LocalScan): ScanModelState {
  const cached = states.get(scan.id);
  if (cached) return cached;
  if (scan.files) {
    const text = readListingText(listingId, scan.files.json);
    const analysis = text === null ? null : analyzeExport(text);
    const state = analysis?.ok ? ready(analysis.model) : ERROR;
    states.set(scan.id, state);
    return state;
  }
  return scan.processing === 'ready' ? LOADING : UNAVAILABLE;
}

async function fetchModel(listingId: string, scanId: string): Promise<void> {
  if (loading.has(scanId)) return;
  loading.add(scanId);
  try {
    const url = publicObjectUrl(
      env.supabaseUrl,
      BUCKETS.scanModels,
      scanModelPaths(listingId, scanId).model,
    );
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const parsed = safeParseRoomModel(await response.json());
    states.set(scanId, parsed.success ? ready(parsed.data) : ERROR);
  } catch (error) {
    console.warn(`Could not load the model of scan ${scanId}`, error);
    states.set(scanId, ERROR);
  } finally {
    loading.delete(scanId);
    emit();
  }
}

/** Forgets a failed load, so the next render tries again. */
export function retryScanModel(scanId: string): void {
  if (states.get(scanId) === ERROR) {
    states.delete(scanId);
    emit();
  }
}

/** The listing's scan model with the seller's room labels applied; null without a scan. */
export function useScanModel(listing: LocalListing): ScanModelState | null {
  const scan = listing.scan;
  const state = useSyncExternalStore(subscribe, () => (scan ? peek(listing.id, scan) : null));
  const needsFetch = state?.status === 'loading';
  const listingId = listing.id;
  const scanId = scan?.id;
  useEffect(() => {
    if (needsFetch && scanId) void fetchModel(listingId, scanId);
  }, [needsFetch, listingId, scanId]);

  if (!scan || state?.status !== 'ready') return state;
  return { ...state, model: applyAnnotations(state.model, { roomLabels: scan.roomLabels }) };
}
