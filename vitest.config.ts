import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node', include: ['tests/**/*.test.ts'], testTimeout: 30000, hookTimeout: 60000,
    // Embedded PostgreSQL needs a predictable memory budget on developer laptops.
    maxWorkers: 1, fileParallelism: false,
  },
});
