// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  createTestActiveOpenAiState,
  createTestCompatibilityState,
} from './compatibility.test-fixtures.js';
import { createMoldeaCliCompatibilityResult } from './transformers.js';

/** Asserts recursive immutability for one JSON-compatible result graph. */
const expectDeeplyFrozen = (root: object): void => {
  const pendingValues: object[] = [root];
  const visitedValues = new Set<object>();

  while (pendingValues.length > 0) {
    const currentValue = pendingValues.pop();

    if (currentValue === undefined || visitedValues.has(currentValue)) {
      continue;
    }

    visitedValues.add(currentValue);
    expect(Object.isFrozen(currentValue)).toBe(true);
    for (const nestedValue of Object.values(currentValue as Readonly<Record<string, unknown>>)) {
      if (typeof nestedValue === 'object' && nestedValue !== null) {
        pendingValues.push(nestedValue);
      }
    }
  }
};

describe('createMoldeaCliCompatibilityResult', () => {
  test('reports the exact current release without inferring package-backed adapter support', () => {
    const state = createTestCompatibilityState();
    const result = createMoldeaCliCompatibilityResult(state);
    const customAdapter = result.adapters.find(({ id }) => id === 'custom');
    const openAiAdapter = result.adapters.find(({ id }) => id === 'openai');

    expect(result).toMatchObject({
      matrixVersion: 1,
      minimumGitVersion: '2.30.0',
      outputSchemaVersion: 1,
      packages: [
        { name: '@moldea.ai/core', version: '1.0.0' },
        { name: '@moldea.ai/repository', version: '1.0.0' },
        { name: '@moldea.ai/repository-fs', version: '1.0.0' },
      ],
      repositoryFormatVersions: [1],
      supportedNodeRange: '^22.11.0 || ^24.11.0',
    });
    expect(customAdapter).toMatchObject({
      active: true,
      bundledVersion: '1.0.0',
      id: 'custom',
      matrix: {
        compatibleCoreRange: '^1.0.0',
        implementationStatus: 'available',
        runtimeGuidance: { expectation: 'required' },
        supportedRepositoryFormatVersions: [1],
        targets: [
          {
            id: 'custom',
            patterns: [{ id: 'explicit-repository-relationships', support: 'full' }],
          },
        ],
      },
    });
    expect(openAiAdapter).toMatchObject({
      active: false,
      bundledVersion: null,
      id: 'openai',
      matrix: { implementationStatus: 'planned' },
    });
    expect(customAdapter?.matrix).not.toBe(state.releaseMetadata.matrix.adapters['custom']);
    expectDeeplyFrozen(result);
  });

  test('reports an active package-backed adapter with its bundled version and matrix claim', () => {
    const result = createMoldeaCliCompatibilityResult(createTestActiveOpenAiState());

    expect(result.adapters.find(({ id }) => id === 'openai')).toMatchObject({
      active: true,
      bundledVersion: '1.0.0',
      matrix: {
        implementation: { versionRange: '^1.0.0' },
        implementationStatus: 'available',
        targets: [{ id: 'typescript', lastVerifiedAt: '2026-08-13' }],
      },
    });
    expectDeeplyFrozen(result);
  });
});
