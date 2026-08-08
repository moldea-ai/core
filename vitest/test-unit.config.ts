import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      OPENAI_API_KEY: 'unit-test-placeholder',
    },
    include: ['**/*.test-unit.ts'],
  },
});
