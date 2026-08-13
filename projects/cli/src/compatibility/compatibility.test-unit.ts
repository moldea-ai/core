// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { MOLDEA_CLI_RELEASE_METADATA } from '../release-metadata/index.js';

import {
  resolveInstalledMoldeaCliCompatibility,
  resolveMoldeaCliCompatibility,
} from './compatibility.js';
import {
  createTestCompatibilityState,
  INSTALLED_PACKAGE_METADATA,
} from './compatibility.test-fixtures.js';

describe('CLI compatibility resolution', () => {
  test('returns one all-or-nothing valid result for the explicit current state', () => {
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

  test('converts malformed generated relationships to invalid state without throwing', () => {
    const state = createTestCompatibilityState();
    const malformedState = {
      ...state,
      releaseMetadata: {
        ...state.releaseMetadata,
        matrix: {
          ...state.releaseMetadata.matrix,
          adapters: {
            ...state.releaseMetadata.matrix.adapters,
            custom: null as unknown as (typeof state.releaseMetadata.matrix.adapters)['custom'],
          },
        },
      },
    };

    expect(resolveMoldeaCliCompatibility(malformedState)).toStrictEqual({ kind: 'invalid' });
  });

  test('checks the installed snapshot against the distinct generated Core inventory', () => {
    const resolution = resolveInstalledMoldeaCliCompatibility({
      packageMetadata: INSTALLED_PACKAGE_METADATA,
      releaseMetadata: MOLDEA_CLI_RELEASE_METADATA,
    });

    expect(resolution.kind).toBe('valid');
  });

  test('rejects a generated Core inventory that is a strict matrix superset', () => {
    expect(
      resolveInstalledMoldeaCliCompatibility({
        packageMetadata: INSTALLED_PACKAGE_METADATA,
        releaseMetadata: {
          ...MOLDEA_CLI_RELEASE_METADATA,
          coreRecognizedAdapterIds: [
            ...MOLDEA_CLI_RELEASE_METADATA.coreRecognizedAdapterIds,
            'unexpected',
          ],
        },
      }),
    ).toStrictEqual({ kind: 'invalid' });
  });
});
