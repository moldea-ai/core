import { createTestConfig } from '../../../configs/vitest/test.config.js';

export default createTestConfig({
  include: ['src/**/*.test-unit.ts'],
  suite: 'unit',
});
