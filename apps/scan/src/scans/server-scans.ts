import { BUCKETS, userScanModelPath, userScanRawPaths, type Tables } from '@bairmair/db';
import type { RoomModelV1 } from '@bairmair/room-model';
import { supabase } from '@/lib/supabase';
import { loadScanModel } from './scan-model';

/** The signed-in user's scans on the server (`user_scans`, readable only by their owner). */

export type ServerScan = Pick<
  Tables<'user_scans'>,
  | 'id'
  | 'owner_id'
  | 'title'
  | 'share_slug'
  | 'link_enabled'
  | 'status'
  | 'metrics'
  | 'created_at'
  | 'listing_id'
  | 'room_labels'
  | 'room_dividers'
  | 'entrance_door_id'
>;

const COLUMNS =
  'id, owner_id, title, share_slug, link_enabled, status, metrics, created_at, listing_id, room_labels, room_dividers, entrance_door_id';

/** The scan's total area from the server's metrics, or null before processing. */
export function scanArea(scan: Pick<ServerScan, 'metrics'>): number | null {
  const total = (scan.metrics as { totalAreaM2?: unknown } | null)?.totalAreaM2;
  return typeof total === 'number' ? total : null;
}

export async function fetchMyScans(userId: string): Promise<ServerScan[]> {
  const { data, error } = await supabase
    .from('user_scans')
    .select(COLUMNS)
    .eq('owner_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchScan(id: string): Promise<ServerScan | null> {
  const { data, error } = await supabase
    .from('user_scans')
    .select(COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** The processed model with the owner's annotations, or null (see `loadScanModel`). */
export function fetchScanModel(scan: ServerScan): Promise<RoomModelV1 | null> {
  return loadScanModel(supabase, scan);
}

export async function renameScan(id: string, title: string): Promise<void> {
  const value = title.trim().slice(0, 80) || null;
  const { error } = await supabase.from('user_scans').update({ title: value }).eq('id', id);
  if (error) throw error;
}

export async function setLinkEnabled(id: string, enabled: boolean): Promise<void> {
  const { error } = await supabase
    .from('user_scans')
    .update({ link_enabled: enabled })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Deletes a scan for good: its files first (nothing records them once the row is gone), then
 * the row, which frees a free-scan slot and ends its link. Repeating after a failure is safe.
 */
export async function deleteServerScan(scan: Pick<ServerScan, 'id' | 'owner_id'>): Promise<void> {
  const raw = userScanRawPaths(scan.owner_id, scan.id);
  const rawResult = await supabase.storage.from(BUCKETS.userScanRaw).remove([raw.json, raw.usdz]);
  if (rawResult.error) throw rawResult.error;
  const modelResult = await supabase.storage
    .from(BUCKETS.userScanModels)
    .remove([userScanModelPath(scan.owner_id, scan.id)]);
  if (modelResult.error) throw modelResult.error;
  const { error } = await supabase.from('user_scans').delete().eq('id', scan.id);
  if (error) throw error;
}
