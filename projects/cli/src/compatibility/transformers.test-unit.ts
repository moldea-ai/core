// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  createTestActivePackageAdaptersState,
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
  test('reports the exact current release with its active package-backed adapter', () => {
    const state = createTestCompatibilityState();
    const result = createMoldeaCliCompatibilityResult(state);
    const customAdapter = result.adapters.find(({ id }) => id === 'custom');
    const openAiAdapter = result.adapters.find(({ id }) => id === 'openai');

    expect(result).toMatchObject({
      matrixVersion: 1,
      minimumGitVersion: '2.30.0',
      outputSchemaVersion: 1,
      packages: [
        { name: '@moldea.ai/adapter-anthropic', version: '2.0.1' },
        { name: '@moldea.ai/adapter-google-genai', version: '1.0.2' },
        { name: '@moldea.ai/adapter-openai', version: '2.0.3' },
        { name: '@moldea.ai/core', version: '2.0.0' },
        { name: '@moldea.ai/repository', version: '1.0.1' },
        { name: '@moldea.ai/repository-fs', version: '1.0.1' },
      ],
      repositoryFormatVersions: [1],
      supportedNodeRange: '^22.11.0 || ^24.11.0',
    });
    expect(customAdapter).toMatchObject({
      active: true,
      bundledVersion: '2.0.0',
      id: 'custom',
      matrix: {
        compatibleCoreRange: '^2.0.0',
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
      active: true,
      bundledVersion: '2.0.3',
      id: 'openai',
      matrix: {
        implementationStatus: 'available',
        targets: [{ id: 'typescript-responses-api-7' }],
      },
    });
    expect(customAdapter?.matrix).not.toBe(state.releaseMetadata.matrix.adapters['custom']);
    expectDeeplyFrozen(result);
  });

  test('reports active package-backed adapters with their bundled versions and matrix claims', () => {
    const result = createMoldeaCliCompatibilityResult(createTestActivePackageAdaptersState());

    expect(result.adapters.find(({ id }) => id === 'anthropic')).toMatchObject({
      active: true,
      bundledVersion: '2.0.1',
      matrix: {
        implementation: { versionRange: '^2.0.0' },
        implementationStatus: 'available',
        targets: [
          {
            id: 'typescript-messages-api-0-117',
            lastVerifiedAt: '2026-08-17',
            providerLimits: [
              {
                id: 'client-tool-name',
                kind: 'pattern',
                subject: 'tool-name',
                value: '^[A-Za-z0-9_-]{1,64}$',
              },
            ],
          },
        ],
      },
    });

    expect(result.adapters.find(({ id }) => id === 'openai')).toMatchObject({
      active: true,
      bundledVersion: '2.0.3',
      matrix: {
        implementation: { versionRange: '^2.0.0' },
        implementationStatus: 'available',
        targets: [{ id: 'typescript-responses-api-7', lastVerifiedAt: '2026-08-17' }],
      },
    });
    expectDeeplyFrozen(result);
  });
});
