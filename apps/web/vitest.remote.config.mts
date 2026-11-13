import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Route handlers against the hosted dev project. They create throwaway users and delete
// everything they create. Needs apps/web/.env.local (see .env.example).
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['test-remote/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
