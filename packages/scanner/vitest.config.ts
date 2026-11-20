import { defineConfig } from 'vitest/config';

// Unit tests for the pure entry only; `src/native` needs a device.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
