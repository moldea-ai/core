// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  resolveInstalledMoldeaCliCompatibility,
  resolveMoldeaCliCompatibility,
} from './compatibility.js';
import {
  createTestCompatibilityState,
  INSTALLED_PACKAGE_METADATA,
} from './compatibility.test-fixtures.js';

describe('CLI compatibility resolution', () => {
  test('returns one all-or-nothing valid result for explicit state', () => {
    const resolution = resolveMoldeaCliCompatibility(createTestCompatibilityState());

    expect(resolution.kind).toBe('valid');
    expect(Object.isFrozen(resolution)).toBe(true);
  });

  test('returns the shared invalid outcome without a partial result', () => {
    const state = createTestCompatibilityState();
    const resolution = resolveMoldeaCliCompatibility({
      ...state,
      packageMetadata: { ...state.packageMetadata, dependencies: null },
    });

    expect(resolution).toStrictEqual({ kind: 'invalid' });
    expect(resolution).not.toHaveProperty('result');
    expect(Object.isFrozen(resolution)).toBe(true);
  });

  test('derives installed compatibility without generated release metadata', () => {
    expect(
      resolveInstalledMoldeaCliCompatibility({ packageMetadata: INSTALLED_PACKAGE_METADATA }).kind,
    ).toBe('valid');
  });
});
