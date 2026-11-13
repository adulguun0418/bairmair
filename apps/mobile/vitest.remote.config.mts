import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// The listing sync (engine + Supabase remote) against the hosted dev project. Creates throwaway
// users and deletes everything it creates. Reads the keys from packages/db/.env.
const envFile = '../../packages/db/.env';
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  test: {
    include: ['test-remote/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
