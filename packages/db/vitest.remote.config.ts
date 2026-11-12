import { existsSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Integration tests against the hosted dev project: RLS, column grants, triggers, RPCs and
// storage policies. They create throwaway users and delete everything they create.
// Needs packages/db/.env (see .env.example).
if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  test: {
    include: ['test-remote/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // One file at a time: the suites share the project and its rate limits.
    fileParallelism: false,
  },
});
