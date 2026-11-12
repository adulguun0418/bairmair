import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

export type {
  CompositeTypes,
  Database,
  Enums,
  Json,
  Tables,
  TablesInsert,
  TablesUpdate,
} from './database.types';
export { Constants } from './database.types';

/** A supabase-js client typed against our schema. Apps create it with `createClient<Database>`. */
export type TypedSupabaseClient = SupabaseClient<Database>;

export * from './errors';
export * from './storage';
