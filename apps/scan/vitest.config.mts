import { defineConfig } from 'vitest/config';

// Unit tests for the pure modules (no React Native). Integration tests against the dev project
// live in test-remote/ and run with vitest.remote.config.mts.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
