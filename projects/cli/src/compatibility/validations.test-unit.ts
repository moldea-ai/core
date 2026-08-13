// @vitest-environment node
import { describe, expect, test } from 'vitest';

import type { IMoldeaCliRuntimeAdapterEntry } from '../release-metadata/index.js';

import type { IMoldeaCliCompatibilityStateInput } from './types.js';
import { isMoldeaCliCompatibilityStateValid } from './validations.js';
import {
  AVAILABLE_OPENAI_MATRIX_ENTRY,
  createTestActiveOpenAiState,
  createTestCompatibilityState,
  createTestRuntimeAdapter,
} from './compatibility.test-fixtures.js';

describe('isMoldeaCliCompatibilityStateValid', () => {
  test('accepts the exact generated, installed, and runtime composition', () => {
    expect(isMoldeaCliCompatibilityStateValid(createTestCompatibilityState())).toBe(true);
    expect(isMoldeaCliCompatibilityStateValid(createTestActiveOpenAiState())).toBe(true);
  });

  test.each([
    [
      'installed CLI version',
      (state: IMoldeaCliCompatibilityStateInput): IMoldeaCliCompatibilityStateInput => ({
        ...state,
        packageMetadata: { ...state.packageMetadata, version: '0.0.2' },
      }),
    ],
    [
      'installed Node.js range',
      (state: IMoldeaCliCompatibilityStateInput): IMoldeaCliCompatibilityStateInput => ({
        ...state,
        packageMetadata: { ...state.packageMetadata, supportedNodeRange: '^24.11.0' },
      }),
    ],
    [
      'generated minimum Git version',
      (state: IMoldeaCliCompatibilityStateInput): IMoldeaCliCompatibilityStateInput => ({
        ...state,
        releaseMetadata: { ...state.releaseMetadata, minimumGitVersion: '2.31.0' },
      }),
    ],
    [
      'generated output schema version',
      (state: IMoldeaCliCompatibilityStateInput): IMoldeaCliCompatibilityStateInput => ({
        ...state,
        releaseMetadata: { ...state.releaseMetadata, outputSchemaVersion: 2 as 1 },
      }),
    ],
    [
      'Core repository-format versions',
      (state: IMoldeaCliCompatibilityStateInput): IMoldeaCliCompatibilityStateInput => ({
        ...state,
        coreSupportedRepositoryFormatVersions: [1, 2],
      }),
    ],
    [
      'Core adapter inventory',
      (state: IMoldeaCliCompatibilityStateInput): IMoldeaCliCompatibilityStateInput => ({
        ...state,
        coreRecognizedAdapterIds: state.coreRecognizedAdapterIds.slice(1),
      }),
    ],
  ])('rejects a mismatch in %s', (_description, mutate) => {
    expect(isMoldeaCliCompatibilityStateValid(mutate(createTestCompatibilityState()))).toBe(false);
  });

  test.each([
    [null],
    [
      {
        '@moldea.ai/core': 'workspace:^0.0.1',
        '@moldea.ai/repository': 'workspace:0.0.1',
        '@moldea.ai/repository-fs': 'workspace:0.0.1',
      },
    ],
    [
      {
        '@moldea.ai/core': '0.0.1',
        '@moldea.ai/repository': '0.0.1',
      },
    ],
    [
      {
        '@moldea.ai/core': '0.0.1',
        '@moldea.ai/repository': '0.0.1',
        '@moldea.ai/repository-fs': '0.0.1',
        '@moldea.ai/unexpected': '0.0.1',
      },
    ],
  ])('rejects invalid installed first-class dependency composition %o', (dependencies) => {
    const state = createTestCompatibilityState();

    expect(
      isMoldeaCliCompatibilityStateValid({
        ...state,
        packageMetadata: { ...state.packageMetadata, dependencies },
      }),
    ).toBe(false);
  });

  test.each([
    [null],
    [
      {
        '@moldea.ai/core': '0.0.2',
        '@moldea.ai/repository': '0.0.1',
        '@moldea.ai/repository-fs': '0.0.1',
      },
    ],
    [
      {
        '@moldea.ai/core': '0.0.1',
        '@moldea.ai/repository': '0.0.1',
      },
    ],
  ])('rejects invalid actually installed package composition %o', (installedPackageVersions) => {
    const state = createTestCompatibilityState();

    expect(
      isMoldeaCliCompatibilityStateValid({
        ...state,
        packageMetadata: { ...state.packageMetadata, installedPackageVersions },
      }),
    ).toBe(false);
  });

  test('accepts exact published dependency versions as well as exact workspace versions', () => {
    const state = createTestCompatibilityState();

    expect(
      isMoldeaCliCompatibilityStateValid({
        ...state,
        packageMetadata: {
          ...state.packageMetadata,
          dependencies: {
            '@moldea.ai/core': '0.0.1',
            '@moldea.ai/repository': '0.0.1',
            '@moldea.ai/repository-fs': '0.0.1',
            semver: '7.8.5',
          },
        },
      }),
    ).toBe(true);
  });

  test('treats active package-backed adapter registration order as semantically irrelevant', () => {
    const state = createTestActiveOpenAiState();
    const openAiEntry = state.releaseMetadata.matrix.adapters['openai'];

    if (openAiEntry === undefined) {
      throw new TypeError('The OpenAI matrix entry is required.');
    }

    expect(
      isMoldeaCliCompatibilityStateValid({
        ...state,
        activeAdapters: [createTestRuntimeAdapter('openai'), createTestRuntimeAdapter('anthropic')],
        packageMetadata: {
          ...state.packageMetadata,
          dependencies: {
            ...state.packageMetadata.dependencies,
            '@moldea.ai/adapter-anthropic': 'workspace:0.0.1',
          },
          installedPackageVersions: {
            ...state.packageMetadata.installedPackageVersions,
            '@moldea.ai/adapter-anthropic': '0.0.1',
          },
        },
        releaseMetadata: {
          ...state.releaseMetadata,
          activeAdapterIds: ['anthropic', 'openai'],
          matrix: {
            ...state.releaseMetadata.matrix,
            adapters: {
              ...state.releaseMetadata.matrix.adapters,
              anthropic: {
                ...openAiEntry,
                implementation: {
                  ...openAiEntry.implementation,
                  package: '@moldea.ai/adapter-anthropic',
                },
              },
            },
          },
          packages: [
            { name: '@moldea.ai/adapter-anthropic', version: '0.0.1' },
            ...state.releaseMetadata.packages,
          ],
        },
      }),
    ).toBe(true);
  });

  test.each([
    [
      'duplicate adapter IDs',
      [createTestRuntimeAdapter('openai'), createTestRuntimeAdapter('openai')],
    ],
    ['the built-in custom ID', [createTestRuntimeAdapter('custom')]],
    ['a planned adapter', [createTestRuntimeAdapter('openai')]],
  ])('rejects active registration containing %s', (_description, activeAdapters) => {
    const state = createTestCompatibilityState();

    expect(isMoldeaCliCompatibilityStateValid({ ...state, activeAdapters })).toBe(false);
  });

  test('rejects an available adapter that is absent from active registration', () => {
    const state = createTestActiveOpenAiState();

    expect(isMoldeaCliCompatibilityStateValid({ ...state, activeAdapters: [] })).toBe(false);
  });

  test.each([
    [
      'implementation package identity',
      (state: IMoldeaCliCompatibilityStateInput): IMoldeaCliCompatibilityStateInput => {
        const openAiEntry = state.releaseMetadata.matrix.adapters['openai'];

        if (openAiEntry === undefined) {
          throw new TypeError('The OpenAI matrix entry is required.');
        }

        return {
          ...state,
          releaseMetadata: {
            ...state.releaseMetadata,
            matrix: {
              ...state.releaseMetadata.matrix,
              adapters: {
                ...state.releaseMetadata.matrix.adapters,
                openai: {
                  ...openAiEntry,
                  implementation: {
                    ...openAiEntry.implementation,
                    package: '@moldea.ai/adapter-not-openai',
                  },
                },
              },
            },
          },
        };
      },
    ],
    [
      'implementation version range',
      (state: IMoldeaCliCompatibilityStateInput): IMoldeaCliCompatibilityStateInput => {
        const openAiEntry = state.releaseMetadata.matrix.adapters['openai'];

        if (openAiEntry === undefined) {
          throw new TypeError('The OpenAI matrix entry is required.');
        }

        return {
          ...state,
          releaseMetadata: {
            ...state.releaseMetadata,
            matrix: {
              ...state.releaseMetadata.matrix,
              adapters: {
                ...state.releaseMetadata.matrix.adapters,
                openai: {
                  ...openAiEntry,
                  implementation: { ...openAiEntry.implementation, versionRange: '^1.0.0' },
                },
              },
            },
          },
        };
      },
    ],
    [
      'compatible Core range',
      (state: IMoldeaCliCompatibilityStateInput): IMoldeaCliCompatibilityStateInput => {
        const openAiEntry = state.releaseMetadata.matrix.adapters['openai'];

        if (openAiEntry === undefined) {
          throw new TypeError('The OpenAI matrix entry is required.');
        }

        return {
          ...state,
          releaseMetadata: {
            ...state.releaseMetadata,
            matrix: {
              ...state.releaseMetadata.matrix,
              adapters: {
                ...state.releaseMetadata.matrix.adapters,
                openai: { ...openAiEntry, compatibleCoreRange: '^1.0.0' },
              },
            },
          },
        };
      },
    ],
    [
      'repository-format support',
      (state: IMoldeaCliCompatibilityStateInput): IMoldeaCliCompatibilityStateInput => ({
        ...state,
        activeAdapters: [createTestRuntimeAdapter('openai', [2 as 1])],
      }),
    ],
  ])('rejects active-adapter mismatch in %s', (_description, mutate) => {
    expect(isMoldeaCliCompatibilityStateValid(mutate(createTestActiveOpenAiState()))).toBe(false);
  });

  test('rejects an available custom claim incompatible with bundled Core', () => {
    const state = createTestCompatibilityState();
    const customEntry = state.releaseMetadata.matrix.adapters['custom'];

    if (customEntry === undefined) {
      throw new TypeError('The custom matrix entry is required.');
    }

    expect(
      isMoldeaCliCompatibilityStateValid({
        ...state,
        releaseMetadata: {
          ...state.releaseMetadata,
          matrix: {
            ...state.releaseMetadata.matrix,
            adapters: {
              ...state.releaseMetadata.matrix.adapters,
              custom: {
                ...customEntry,
                compatibleCoreRange: '^1.0.0',
                implementationStatus: 'available',
                supportedRepositoryFormatVersions: [1],
              },
            },
          },
        },
      }),
    ).toBe(false);
  });

  test.each([
    [
      'implementation version range',
      (entry: IMoldeaCliRuntimeAdapterEntry) => ({
        ...entry,
        implementation: { ...entry.implementation, versionRange: '^0.0.1' },
      }),
    ],
    [
      'Core compatibility range',
      (entry: IMoldeaCliRuntimeAdapterEntry) => ({ ...entry, compatibleCoreRange: '^0.0.1' }),
    ],
    [
      'runtime guidance',
      (entry: IMoldeaCliRuntimeAdapterEntry) => ({
        ...entry,
        runtimeGuidance: { expectation: 'optional' as const },
      }),
    ],
    [
      'targets',
      (entry: IMoldeaCliRuntimeAdapterEntry) => ({
        ...entry,
        targets: [
          {
            id: 'custom',
            kind: 'custom' as const,
            language: 'custom',
            lastVerifiedAt: '2026-08-13',
            supportLevel: 'supported' as const,
          },
        ],
      }),
    ],
    [
      'verification date',
      (entry: IMoldeaCliRuntimeAdapterEntry) => ({ ...entry, lastVerifiedAt: '2026-08-13' }),
    ],
  ])('rejects a planned entry carrying prohibited %s', (_description, mutate) => {
    const state = createTestCompatibilityState();
    const customEntry = state.releaseMetadata.matrix.adapters['custom'];

    if (customEntry === undefined) {
      throw new TypeError('The custom matrix entry is required.');
    }

    expect(
      isMoldeaCliCompatibilityStateValid({
        ...state,
        releaseMetadata: {
          ...state.releaseMetadata,
          matrix: {
            ...state.releaseMetadata.matrix,
            adapters: {
              ...state.releaseMetadata.matrix.adapters,
              custom: mutate(customEntry),
            },
          },
        },
      }),
    ).toBe(false);
  });

  test.each(['runtimeGuidance', 'targets', 'lastVerifiedAt'] as const)(
    'rejects an available adapter missing required %s',
    (propertyName) => {
      const state = createTestActiveOpenAiState();
      const openAiEntry = state.releaseMetadata.matrix.adapters['openai'];

      if (openAiEntry === undefined) {
        throw new TypeError('The OpenAI matrix entry is required.');
      }

      const incompleteEntry = { ...openAiEntry };
      delete incompleteEntry[propertyName];

      expect(
        isMoldeaCliCompatibilityStateValid({
          ...state,
          releaseMetadata: {
            ...state.releaseMetadata,
            matrix: {
              ...state.releaseMetadata.matrix,
              adapters: {
                ...state.releaseMetadata.matrix.adapters,
                openai: incompleteEntry,
              },
            },
          },
        }),
      ).toBe(false);
    },
  );

  test('rejects an available package adapter without a current target', () => {
    const state = createTestActiveOpenAiState();
    const openAiEntry = state.releaseMetadata.matrix.adapters['openai'];

    if (openAiEntry === undefined || openAiEntry.targets === undefined) {
      throw new TypeError('The available OpenAI targets are required.');
    }

    expect(
      isMoldeaCliCompatibilityStateValid({
        ...state,
        releaseMetadata: {
          ...state.releaseMetadata,
          matrix: {
            ...state.releaseMetadata.matrix,
            adapters: {
              ...state.releaseMetadata.matrix.adapters,
              openai: {
                ...openAiEntry,
                targets: openAiEntry.targets.map((target) => ({
                  ...target,
                  supportLevel: 'deprecated' as const,
                })),
              },
            },
          },
        },
      }),
    ).toBe(false);
  });

  test('requires the exact available custom target identity', () => {
    const state = createTestCompatibilityState();
    const customEntry = state.releaseMetadata.matrix.adapters['custom'];

    if (customEntry === undefined) {
      throw new TypeError('The custom matrix entry is required.');
    }

    const availableCustomTarget = {
      id: 'custom',
      kind: 'custom',
      language: 'any',
      lastVerifiedAt: '2026-08-13',
      supportLevel: 'supported',
    } as const;
    const availableCustomEntry: IMoldeaCliRuntimeAdapterEntry = {
      ...customEntry,
      compatibleCoreRange: '^0.0.1',
      implementationStatus: 'available',
      lastVerifiedAt: '2026-08-13',
      runtimeGuidance: { expectation: 'optional' },
      supportedRepositoryFormatVersions: [1],
      targets: [availableCustomTarget],
    };
    const createStateWithCustomEntry = (
      entry: IMoldeaCliRuntimeAdapterEntry,
    ): IMoldeaCliCompatibilityStateInput => ({
      ...state,
      releaseMetadata: {
        ...state.releaseMetadata,
        matrix: {
          ...state.releaseMetadata.matrix,
          adapters: { ...state.releaseMetadata.matrix.adapters, custom: entry },
        },
      },
    });

    expect(
      isMoldeaCliCompatibilityStateValid(createStateWithCustomEntry(availableCustomEntry)),
    ).toBe(true);
    expect(
      isMoldeaCliCompatibilityStateValid(
        createStateWithCustomEntry({
          ...availableCustomEntry,
          targets: [{ ...availableCustomTarget, language: 'custom' }],
        }),
      ),
    ).toBe(false);
  });

  test('accepts a complete deprecated adapter without bundling it', () => {
    const state = createTestCompatibilityState();
    const availableTargets = AVAILABLE_OPENAI_MATRIX_ENTRY.targets;

    if (availableTargets === undefined) {
      throw new TypeError('The available OpenAI targets are required.');
    }

    expect(
      isMoldeaCliCompatibilityStateValid({
        ...state,
        releaseMetadata: {
          ...state.releaseMetadata,
          matrix: {
            ...state.releaseMetadata.matrix,
            adapters: {
              ...state.releaseMetadata.matrix.adapters,
              openai: {
                ...AVAILABLE_OPENAI_MATRIX_ENTRY,
                implementationStatus: 'deprecated',
                targets: availableTargets.map((target) => ({
                  ...target,
                  supportLevel: 'deprecated' as const,
                })),
              },
            },
          },
        },
      }),
    ).toBe(true);
  });

  test('rejects deprecated custom and invalid deprecated replacement claims', () => {
    const state = createTestCompatibilityState();
    const customEntry = state.releaseMetadata.matrix.adapters['custom'];
    const availableState = createTestActiveOpenAiState();
    const openAiEntry = availableState.releaseMetadata.matrix.adapters['openai'];

    if (
      customEntry === undefined ||
      openAiEntry === undefined ||
      openAiEntry.targets === undefined
    ) {
      throw new TypeError('The custom and OpenAI matrix entries are required.');
    }

    expect(
      isMoldeaCliCompatibilityStateValid({
        ...state,
        releaseMetadata: {
          ...state.releaseMetadata,
          matrix: {
            ...state.releaseMetadata.matrix,
            adapters: {
              ...state.releaseMetadata.matrix.adapters,
              custom: {
                ...openAiEntry,
                implementation: customEntry.implementation,
                implementationStatus: 'deprecated',
                targets: openAiEntry.targets.map((target) => ({
                  ...target,
                  supportLevel: 'deprecated' as const,
                })),
              },
            },
          },
        },
      }),
    ).toBe(false);

    expect(
      isMoldeaCliCompatibilityStateValid({
        ...availableState,
        releaseMetadata: {
          ...availableState.releaseMetadata,
          matrix: {
            ...availableState.releaseMetadata.matrix,
            adapters: {
              ...availableState.releaseMetadata.matrix.adapters,
              openai: {
                ...openAiEntry,
                implementationStatus: 'deprecated',
                replacement: 'openai',
                targets: openAiEntry.targets.map((target) => ({
                  ...target,
                  supportLevel: 'deprecated' as const,
                })),
              },
            },
          },
        },
      }),
    ).toBe(false);
  });

  test('rejects noncanonical generated ordering and duplicate repository formats', () => {
    const state = createTestCompatibilityState();

    expect(
      isMoldeaCliCompatibilityStateValid({
        ...state,
        releaseMetadata: {
          ...state.releaseMetadata,
          packages: [...state.releaseMetadata.packages].reverse(),
        },
      }),
    ).toBe(false);
    expect(
      isMoldeaCliCompatibilityStateValid({
        ...state,
        coreSupportedRepositoryFormatVersions: [1, 1],
        releaseMetadata: { ...state.releaseMetadata, repositoryFormatVersions: [1, 1] },
      }),
    ).toBe(false);
  });
});
