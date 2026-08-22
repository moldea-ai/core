import { createTestConfig } from '../../../configs/vitest/test.config.js';

export default createTestConfig({
  include: ['scripts/**/*.test-integration.ts', 'src/**/*.test-integration.ts'],
  suite: 'integration',
});
