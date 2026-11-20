import { defineConfig } from 'vitest/config';

// Unit tests for the pure modules only (redirect parsing); the rest needs a device.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
