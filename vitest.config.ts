import { createTestConfig } from './configs/vitest/test.config.js';

export default createTestConfig({
  include: ['configs/**/*.test-unit.ts'],
  suite: 'unit',
});
