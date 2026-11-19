/**
 * The project's own URL and secret key, for calling our RPCs from an Edge Function.
 * No Deno APIs here, so Vitest can run it.
 */

/**
 * From the function's environment: `SUPABASE_URL` and the default key in `SUPABASE_SECRET_KEYS`
 * (JSON `{ "default": "sb_secret_..." }`, set by Supabase), else the legacy
 * `SUPABASE_SERVICE_ROLE_KEY`. Null when either is missing.
 */
export function serviceCredentials(
  env: (name: string) => string | undefined,
): { url: string; key: string } | null {
  const url = env('SUPABASE_URL');
  if (!url) return null;
  let key: string | undefined;
  try {
    const keys = JSON.parse(env('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, unknown>;
    if (typeof keys.default === 'string' && keys.default !== '') key = keys.default;
  } catch {
    // Malformed: fall back to the legacy key.
  }
  key ??= env('SUPABASE_SERVICE_ROLE_KEY') || undefined;
  return key ? { url, key } : null;
}

/** Calls `public.<name>` through PostgREST with the secret key; throws on an error status. */
export function rpcCaller(
  credentials: { url: string; key: string },
  fetchImpl: typeof fetch = fetch,
): (name: string, args: unknown, signal: AbortSignal) => Promise<Response> {
  const base = `${credentials.url.replace(/\/+$/, '')}/rest/v1/rpc`;
  return async (name, args, signal) => {
    const response = await fetchImpl(`${base}/${name}`, {
      method: 'POST',
      headers: { apikey: credentials.key, 'content-type': 'application/json' },
      body: JSON.stringify(args),
      signal,
    });
    if (!response.ok) throw new Error(`${name} ${response.status}`);
    return response;
  };
}
