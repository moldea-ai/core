// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { createTestConfig } from './test.config.js';

describe('createTestConfig', () => {
  it('creates a strict Node.js unit-test configuration by default', () => {
    const config = createTestConfig({ suite: 'unit' });

    expect(config.test).toEqual({
      clearMocks: true,
      environment: 'node',
      globals: false,
      include: ['src/**/*.test-unit.ts'],
      passWithNoTests: false,
      restoreMocks: true,
      sequence: {
        shuffle: false,
      },
      unstubEnvs: true,
      unstubGlobals: true,
    });
  });

  it('uses the requested suite and copies caller-owned include patterns', () => {
    const include = ['test/**/*.integration.ts'];
    const config = createTestConfig({ include, suite: 'integration' });

    expect(config.test?.include).toEqual(include);
    expect(config.test?.include).not.toBe(include);
    expect(config.test?.hookTimeout).toBe(120_000);
    expect(config.test?.testTimeout).toBe(120_000);
  });

  it('creates the default end-to-end test include pattern', () => {
    const config = createTestConfig({ suite: 'e2e' });

    expect(config.test?.include).toEqual(['src/**/*.test-e2e.ts']);
  });
});
