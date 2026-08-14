import { createTestConfig } from './configs/vitest/test.config.js';

export default createTestConfig({
  include: ['configs/**/*.test-integration.ts', 'scripts/**/*.test-integration.ts'],
  suite: 'integration',
});
