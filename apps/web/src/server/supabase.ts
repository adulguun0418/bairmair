import { BUCKETS, CONTENT_TYPES, type TypedSupabaseClient } from '@bairmair/db';
import type { Database, Json } from '@bairmair/db';
import { createClient } from '@supabase/supabase-js';
import type { AccountStore } from './delete-account';
import type { ScanStore } from './process-scan';

/**
 * Server-only Supabase access. SUPABASE_SECRET_KEY bypasses RLS: import this module only from
 * route handlers and server code, never from a client component.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy apps/web/.env.example to .env.local.`);
  return value;
}

let admin: TypedSupabaseClient | null = null;

/** service_role client (secret key). Created on first use, so builds work without the env. */
export function adminClient(): TypedSupabaseClient {
  admin ??= createClient<Database>(
    required('NEXT_PUBLIC_SUPABASE_URL'),
    required('SUPABASE_SECRET_KEY'),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return admin;
}

/** The user id behind `Authorization: Bearer <access token>`, or null. Asks Auth, so a signed-out
 * or deleted user is rejected even while their token has not expired. */
export async function userIdFromRequest(request: Request): Promise<string | null> {
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '');
  if (!match) return null;
  const { data, error } = await adminClient().auth.getUser(match[1]);
  return error || !data.user ? null : data.user.id;
}

/** Objects per `list` page (Storage's maximum). */
const LIST_PAGE = 1000;

export function supabaseAccountStore(client: TypedSupabaseClient): AccountStore {
  async function listFiles(bucket: string, prefix: string): Promise<string[]> {
    const files: string[] = [];
    for (let offset = 0; ; offset += LIST_PAGE) {
      const { data, error } = await client.storage
        .from(bucket)
        .list(prefix, { limit: LIST_PAGE, offset });
      if (error) throw error;
      for (const entry of data) {
        const path = `${prefix}/${entry.name}`;
        // Folders (a scan's `{scanId}/`) come back without an id.
        if (entry.id === null) files.push(...(await listFiles(bucket, path)));
        else files.push(path);
      }
      if (data.length < LIST_PAGE) return files;
    }
  }

  return {
    async ownedListingIds(userId) {
      const { data, error } = await client.from('listings').select('id').eq('owner_id', userId);
      if (error) throw error;
      return data.map((row) => row.id);
    },

    listFiles,

    async removeFiles(bucket, paths) {
      if (paths.length === 0) return;
      const { error } = await client.storage.from(bucket).remove(paths);
      if (error) throw error;
    },

    async deleteUser(userId) {
      const { error } = await client.auth.admin.deleteUser(userId);
      // Already gone (a repeated request): the goal is reached.
      if (error && error.status !== 404) throw error;
    },
  };
}

export function supabaseScanStore(client: TypedSupabaseClient): ScanStore {
  const raw = client.storage.from(BUCKETS.scanRaw);
  const models = client.storage.from(BUCKETS.scanModels);

  return {
    async findScan(scanId) {
      const { data, error } = await client
        .from('room_scans')
        .select('id, listing_id, listings!inner(owner_id)')
        .eq('id', scanId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { id: data.id, listingId: data.listing_id, ownerId: data.listings.owner_id };
    },

    async rawExists(path) {
      // A missing object comes back as `data: false` *with* the not-found error set; other
      // failures throw.
      const { data } = await raw.exists(path);
      return data;
    },

    async readRaw(path) {
      const { data, error } = await raw.download(path);
      if (error) throw error;
      return data.text();
    },

    async writeModel(path, json) {
      // supabase-js sends a Blob's own type, so the type goes on the Blob.
      const body = new Blob([json], { type: CONTENT_TYPES.json });
      const { error } = await models.upload(path, body, {
        upsert: true,
        contentType: CONTENT_TYPES.json,
        // Reprocessing overwrites the file at the same public URL; keep CDN copies short-lived.
        cacheControl: '300',
      });
      if (error) throw error;
    },

    async markReady(scanId, fields) {
      const { error } = await client
        .from('room_scans')
        .update({
          status: 'ready',
          model_path: fields.modelPath,
          schema_version: fields.schemaVersion,
          converter_version: fields.converterVersion,
          metrics: fields.metrics as unknown as Json,
          processing_error: null,
        })
        .eq('id', scanId);
      if (error) throw error;
    },

    async markFailed(scanId, reason) {
      const { error } = await client
        .from('room_scans')
        .update({ status: 'failed', processing_error: reason })
        .eq('id', scanId);
      if (error) throw error;
    },
  };
}
