import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test-unit.ts'],
    // TypeScript program creation shares constrained CI workers with the monorepo.
    testTimeout: 20_000,
  },
});
