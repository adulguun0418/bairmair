import {
  BUCKETS,
  CONTENT_TYPES,
  scanModelPaths,
  scanRawPaths,
  userScanModelPath,
  userScanRawPaths,
  type BucketName,
  type TypedSupabaseClient,
} from '@bairmair/db';
import type { Database, Json, PaymentCheckout } from '@bairmair/db';
import { createClient } from '@supabase/supabase-js';
import type { AppleSubscriptionStore } from './apple-iap';
import type { AccountStore } from './delete-account';
import type { PaymentRecord, PaymentStore } from './payments';
import type { ScanStore } from './process-scan';
import type { AddListingPackagePeriod } from './listing-package';
import type { AddListingPromotionPeriod } from './listing-promotion';
import type { AddScanProPeriod } from './scan-pro';
import type { SharedScanSource } from './shared-scan';

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

type PaymentRow = Database['public']['Tables']['payments']['Row'];

const PAYMENT_COLUMNS =
  'id, user_id, product, subject_id, amount, description, status, qpay_invoice_id, checkout, paid_at, fulfilled_at, checked_at, created_at';

function paymentRecord(
  row: Omit<
    PaymentRow,
    'currency' | 'qpay_payment_id' | 'paid_amount' | 'closed_at' | 'updated_at'
  >,
): PaymentRecord {
  return {
    id: row.id,
    userId: row.user_id,
    product: row.product,
    subjectId: row.subject_id,
    amount: Number(row.amount),
    description: row.description,
    status: row.status,
    qpayInvoiceId: row.qpay_invoice_id,
    checkout: row.checkout as unknown as PaymentCheckout,
    paidAt: row.paid_at,
    fulfilledAt: row.fulfilled_at,
    checkedAt: row.checked_at,
    createdAt: row.created_at,
  };
}

export function supabasePaymentStore(client: TypedSupabaseClient): PaymentStore {
  const table = () => client.from('payments');

  return {
    async find(id) {
      const { data, error } = await table().select(PAYMENT_COLUMNS).eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? paymentRecord(data) : null;
    },

    async findOpen(userId, product, subjectId, since) {
      let query = table()
        .select(PAYMENT_COLUMNS)
        .eq('user_id', userId)
        .eq('product', product)
        .eq('status', 'pending')
        .gt('created_at', since.toISOString());
      query = subjectId ? query.eq('subject_id', subjectId) : query.is('subject_id', null);
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? paymentRecord(data) : null;
    },

    async countSince(userId, since) {
      const { count, error } = await table()
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gt('created_at', since.toISOString());
      if (error) throw error;
      return count ?? 0;
    },

    async insert(payment) {
      const { data, error } = await table()
        .insert({
          id: payment.id,
          user_id: payment.userId,
          product: payment.product,
          subject_id: payment.subjectId,
          amount: payment.amount,
          description: payment.description,
          qpay_invoice_id: payment.qpayInvoiceId,
          checkout: payment.checkout as unknown as Json,
        })
        .select(PAYMENT_COLUMNS)
        .single();
      if (error) throw error;
      return paymentRecord(data);
    },

    async markChecked(id, at) {
      const { error } = await table().update({ checked_at: at.toISOString() }).eq('id', id);
      if (error) throw error;
    },

    async markPaid(id, fields) {
      const { data, error } = await table()
        .update({
          status: 'paid',
          paid_amount: fields.paidAmount,
          qpay_payment_id: fields.qpayPaymentId,
          paid_at: fields.paidAt.toISOString(),
        })
        .eq('id', id)
        .eq('status', 'pending')
        .select('id');
      if (error) throw error;
      return data.length > 0;
    },

    async markClosed(id, status, at) {
      const { data, error } = await table()
        .update({ status, closed_at: at.toISOString() })
        .eq('id', id)
        .eq('status', 'pending')
        .select('id');
      if (error) throw error;
      return data.length > 0;
    },

    async markFulfilled(id, at) {
      const { error } = await table()
        .update({ fulfilled_at: at.toISOString() })
        .eq('id', id)
        .is('fulfilled_at', null);
      if (error) throw error;
    },
  };
}

/** Adds a paid bairmair scan Pro period (`add_scan_pro_period`, service role only). */
export function supabaseAddScanProPeriod(client: TypedSupabaseClient): AddScanProPeriod {
  return async ({ userId, paymentId, product, days }) => {
    const { error } = await client.rpc('add_scan_pro_period', {
      p_user_id: userId,
      p_payment_id: paymentId,
      p_product_id: product,
      p_days: days,
    });
    if (error) throw error;
  };
}

/** Adds a paid listing package period (`add_listing_package_period`, service role only). */
export function supabaseAddListingPackagePeriod(
  client: TypedSupabaseClient,
): AddListingPackagePeriod {
  return async ({ userId, paymentId, product, days }) => {
    const { error } = await client.rpc('add_listing_package_period', {
      p_user_id: userId,
      p_payment_id: paymentId,
      p_product_id: product,
      p_days: days,
    });
    if (error) throw error;
  };
}

export function supabaseAddListingPromotionPeriod(
  client: TypedSupabaseClient,
): AddListingPromotionPeriod {
  return async ({ userId, listingId, paymentId, product, tier, days }) => {
    const { error } = await client.rpc('add_listing_promotion_period', {
      p_user_id: userId,
      p_listing_id: listingId,
      p_payment_id: paymentId,
      p_product_id: product,
      p_tier: tier,
      p_days: days,
    });
    if (error) throw error;
  };
}

/** Whether the listing is published and the user's (a Gold/Silver purchase's subject). */
export function supabaseIsPublishedListingOf(
  client: TypedSupabaseClient,
): (userId: string, listingId: string) => Promise<boolean> {
  return async (userId, listingId) => {
    const { data, error } = await client
      .from('listings')
      .select('id')
      .eq('id', listingId)
      .eq('owner_id', userId)
      .eq('status', 'published')
      .maybeSingle();
    if (error) throw error;
    return data !== null;
  };
}

/** Raw-file and model-file access shared by both scan stores. */
function scanFiles(
  client: TypedSupabaseClient,
  rawBucket: BucketName,
  modelBucket: BucketName,
): Pick<ScanStore, 'rawExists' | 'readRaw' | 'writeModel'> {
  const raw = client.storage.from(rawBucket);
  const models = client.storage.from(modelBucket);
  return {
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
        // Reprocessing overwrites the file at the same URL; keep CDN copies short-lived.
        cacheControl: '300',
      });
      if (error) throw error;
    },
  };
}

/** A listing's scan (`room_scans`): files under the listing id, model in public `scan-models`. */
export function supabaseScanStore(client: TypedSupabaseClient): ScanStore {
  return {
    async findScan(scanId) {
      const { data, error } = await client
        .from('room_scans')
        .select('id, listing_id, listings!inner(owner_id)')
        .eq('id', scanId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        ownerId: data.listings.owner_id,
        raw: scanRawPaths(data.listing_id, data.id),
        modelPath: scanModelPaths(data.listing_id, data.id).model,
      };
    },

    ...scanFiles(client, BUCKETS.scanRaw, BUCKETS.scanModels),

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

/** A bairmair scan (`user_scans`): files under the owner's id, model in private `user-scan-models`. */
export function supabaseUserScanStore(client: TypedSupabaseClient): ScanStore {
  return {
    async findScan(scanId) {
      const { data, error } = await client
        .from('user_scans')
        .select('id, owner_id')
        .eq('id', scanId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        id: data.id,
        ownerId: data.owner_id,
        raw: userScanRawPaths(data.owner_id, data.id),
        modelPath: userScanModelPath(data.owner_id, data.id),
      };
    },

    ...scanFiles(client, BUCKETS.userScanRaw, BUCKETS.userScanModels),

    async markReady(scanId, fields) {
      const { error } = await client
        .from('user_scans')
        .update({
          status: 'ready',
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
        .from('user_scans')
        .update({ status: 'failed', processing_error: reason })
        .eq('id', scanId);
      if (error) throw error;
    },
  };
}

/** Reads shared bairmair scans by slug (secret key: the table is owner-only under RLS). */
export function supabaseSharedScanSource(client: TypedSupabaseClient): SharedScanSource {
  return {
    async findBySlug(slug) {
      const { data, error } = await client
        .from('user_scans')
        .select('id, owner_id, title, created_at, room_labels, room_dividers, entrance_door_id')
        .eq('share_slug', slug)
        .eq('link_enabled', true)
        .eq('status', 'ready')
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async readModel(path) {
      const { data, error } = await client.storage.from(BUCKETS.userScanModels).download(path);
      if (error) {
        // Missing is a normal state (deleted meanwhile); anything else is worth knowing.
        if (!/not.?found/i.test(error.message) && (error as { status?: number }).status !== 404) {
          throw error;
        }
        return null;
      }
      return JSON.parse(await data.text()) as unknown;
    },
  };
}

/** Applies verified App Store data (`apply_apple_subscription`, service role only). */
export function supabaseAppleStore(client: TypedSupabaseClient): AppleSubscriptionStore {
  return {
    async apply(update) {
      const tx = update.transaction;
      // Every parameter may be SQL null (see the migration); the generated types say otherwise.
      const args = {
        p_user_id: update.userId,
        p_original_transaction_id: update.originalTransactionId,
        p_environment: update.environment,
        p_transaction_id: tx?.transactionId ?? null,
        p_product_id: tx?.productId ?? null,
        p_starts_at: tx?.startsAt.toISOString() ?? null,
        p_expires_at: tx?.expiresAt.toISOString() ?? null,
        p_status: tx?.status ?? null,
        p_signed_at: tx?.signedAt.toISOString() ?? null,
        p_auto_renew: update.renewal?.autoRenew ?? null,
        p_renewal_signed_at: update.renewal?.signedAt.toISOString() ?? null,
      } as Database['public']['Functions']['apply_apple_subscription']['Args'];
      const { data, error } = await client.rpc('apply_apple_subscription', args);
      if (error) throw error;
      if (
        data !== 'applied' &&
        data !== 'stale' &&
        data !== 'other_account' &&
        data !== 'unknown_user'
      ) {
        throw new Error(`apply_apple_subscription returned ${String(data)}`);
      }
      return data;
    },
  };
}
