// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { verifyProductionBuild } from './verify-build.ts';

describe('verifyProductionBuild', () => {
  test('accepts the complete base-aware Astro production artifact', () => {
    expect(() => verifyProductionBuild()).not.toThrow();
  });
});
