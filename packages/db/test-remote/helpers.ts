import { randomInt, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../src/database.types';

function required(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is not set. Copy packages/db/.env.example to packages/db/.env.`);
  return value;
}

export const env = {
  url: required('SUPABASE_URL'),
  publishableKey: required('SUPABASE_PUBLISHABLE_KEY'),
  secretKey: required('SUPABASE_SECRET_KEY'),
};

type Client = SupabaseClient<Database>;

const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;

/** A client with no user session (role anon). */
export function anonClient(): Client {
  return createClient<Database>(env.url, env.publishableKey, noSession);
}

/** service_role: bypasses RLS. Stands in for trusted server code and the dashboard. */
export const admin: Client = createClient<Database>(env.url, env.secretKey, noSession);

export interface TestUser {
  id: string;
  /** E.164, as returned by reveal_listing_contact. */
  phone: string;
  client: Client;
}

const created: string[] = [];

/**
 * Creates a user with a confirmed phone and a password, then signs in as them.
 * +976 0xxxxxxx: Mongolian numbers never start with 0, so these reach no one (and no SMS is sent:
 * the admin API confirms the phone directly).
 */
export async function createUser(label: string): Promise<TestUser> {
  const phone = `+9760${String(randomInt(0, 10_000_000)).padStart(7, '0')}`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
    user_metadata: { full_name: `Test ${label}` },
  });
  if (error) throw error;
  created.push(data.user.id);

  const client = createClient<Database>(env.url, env.publishableKey, noSession);
  const { error: signInError } = await client.auth.signInWithPassword({ phone, password });
  if (signInError) throw signInError;
  return { id: data.user.id, phone, client };
}

/**
 * A user with an email identity and no phone, standing in for Apple / Google sign-in users.
 * Needs the email provider enabled on the dev project (admin-created, so sign-ups can be off).
 */
export async function createEmailUser(label: string): Promise<TestUser> {
  const email = `test-${label}-${randomUUID()}@example.com`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Test ${label}` },
  });
  if (error) throw error;
  created.push(data.user.id);

  const client = createClient<Database>(env.url, env.publishableKey, noSession);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: data.user.id, phone: '', client };
}

/** Deletes every user created in this file. Profiles, listings and rows below them cascade. */
export async function deleteCreatedUsers(): Promise<void> {
  for (const id of created.splice(0)) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.warn(`could not delete test user ${id}: ${error.message}`);
  }
}

/** Removes objects under the given folders (first path segment) in a bucket. */
export async function removeFolders(bucket: string, folders: string[]): Promise<void> {
  for (const folder of folders) {
    const paths: string[] = [];
    const queue = [folder];
    while (queue.length > 0) {
      const dir = queue.pop()!;
      const { data, error } = await admin.storage.from(bucket).list(dir, { limit: 1000 });
      if (error) throw error;
      for (const entry of data) {
        // Folders have no id in list() results.
        if (entry.id === null) queue.push(`${dir}/${entry.name}`);
        else paths.push(`${dir}/${entry.name}`);
      }
    }
    if (paths.length > 0) {
      const { error } = await admin.storage.from(bucket).remove(paths);
      if (error) throw error;
    }
  }
}

/** A few bytes with a JPEG header. Storage checks the declared content type, not the bytes. */
export const TINY_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);

/** Zaisan area, Khan-Uul. */
export const ZAISAN = { lat: 47.8864, lng: 106.9057 };

/** The approximate public coordinate the database derives (centre of a 0.0025° cell). */
export function snapped(coord: number): number {
  return Math.round((Math.floor(coord / 0.0025) * 0.0025 + 0.00125) * 1e6) / 1e6;
}
