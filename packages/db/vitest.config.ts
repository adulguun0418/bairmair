import { defineConfig } from 'vitest/config';

// Unit tests only. Tests against the hosted dev project live in test-remote/ and run with
// `pnpm --filter @bairmair/db test:remote`.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
