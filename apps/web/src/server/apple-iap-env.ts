import type { AppleIapDeps } from './apple-iap';
import { appAppleIdFromEnv, appleVerifier } from './apple-verifier';
import { log } from './payment-routes';
import { adminClient, supabaseAppleStore } from './supabase';

let verifier: AppleIapDeps['verifier'] | null = null;

/**
 * Apple In-App Purchase wired to this server: Apple's verifier (kept between requests, it caches
 * verified certificates) and the Supabase store (secret key). Production data verifies only with
 * `APPLE_APP_ID`; Sandbox always does.
 */
export function appleIapDeps(): AppleIapDeps {
  verifier ??= appleVerifier({ appAppleId: appAppleIdFromEnv() });
  return { verifier, store: supabaseAppleStore(adminClient()), log };
}
