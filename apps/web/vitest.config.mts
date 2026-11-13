import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests only. Tests against the hosted dev project live in test-remote/ and run with
// `pnpm --filter @bairmair/web test:remote`.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['test/**/*.test.ts'],
  },
});
