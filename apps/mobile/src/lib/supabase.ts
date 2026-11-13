import 'react-native-url-polyfill/auto';
import type { Database, TypedSupabaseClient } from '@bairmair/db';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { env } from './env';

/**
 * The app's one Supabase client, set up as in Supabase's React Native guide: the session is
 * kept in AsyncStorage, and token refresh runs only while the app is in the foreground.
 */
export const supabase: TypedSupabaseClient = createClient<Database>(
  env.supabaseUrl,
  env.supabasePublishableKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

// Registered once, at module load.
AppState.addEventListener('change', (state) => {
  if (state === 'active') void supabase.auth.startAutoRefresh();
  else void supabase.auth.stopAutoRefresh();
});
