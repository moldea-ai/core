// @vitest-environment node
import { describe, expect, test } from 'vitest';

import type { IMoldeaCliRuntimeAdapterEntry } from '../release-metadata/index.js';

import type { IMoldeaCliCompatibilityStateInput } from './types.js';
import { isMoldeaCliCompatibilityStateValid } from './validations.js';
import {
  AVAILABLE_OPENAI_MATRIX_ENTRY,
  createTestActivePackageAdaptersState,
  createTestCompatibilityState,
  createTestRuntimeAdapter,
} from './compatibility.test-fixtures.js';

describe('isMoldeaCliCompatibilityStateValid', () => {
  test('accepts the exact generated, installed, and runtime composition', () => {
    expect(isMoldeaCliCompatibilityStateValid(createTestCompatibilityState())).toBe(true);
    expect(isMoldeaCliCompatibilityStateValid(createTestActivePackageAdaptersState())).toBe(true);
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
        '@moldea.ai/core': 'workspace:^1.0.0',
        '@moldea.ai/repository': 'workspace:1.0.0',
        '@moldea.ai/repository-fs': 'workspace:1.0.0',
      },
    ],
    [
      {
        '@moldea.ai/core': '1.0.0',
        '@moldea.ai/repository': '1.0.0',
      },
    ],
    [
      {
        '@moldea.ai/core': '1.0.0',
        '@moldea.ai/repository': '1.0.0',
        '@moldea.ai/repository-fs': '1.0.0',
        '@moldea.ai/unexpected': '1.0.0',
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
        '@moldea.ai/repository': '1.0.0',
        '@moldea.ai/repository-fs': '1.0.0',
      },
    ],
    [
      {
        '@moldea.ai/core': '1.0.0',
        '@moldea.ai/repository': '1.0.0',
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
            '@moldea.ai/adapter-anthropic': '2.0.1',
            '@moldea.ai/adapter-claude-agent-sdk': '1.0.0',
            '@moldea.ai/adapter-cloudflare-agents': '1.0.0',
            '@moldea.ai/adapter-eve': '1.0.0',
            '@moldea.ai/adapter-google-genai': '1.0.3',
            '@moldea.ai/adapter-langchain': '1.0.0',
            '@moldea.ai/adapter-openai': '2.0.4',
            '@moldea.ai/adapter-openai-agents-sdk': '1.0.2',
            '@moldea.ai/adapter-vercel-ai-sdk': '1.0.0',
            '@moldea.ai/core': '2.0.0',
            '@moldea.ai/repository': '1.0.1',
            '@moldea.ai/repository-fs': '1.0.2',
            semver: '7.8.5',
          },
        },
      }),
    ).toBe(true);
  });

  test('treats active package-backed adapter registration order as semantically irrelevant', () => {
    const state = createTestActivePackageAdaptersState();

    expect(
      isMoldeaCliCompatibilityStateValid({
        ...state,
        activeAdapters: [
          createTestRuntimeAdapter('openai'),
          createTestRuntimeAdapter('openai-agents-sdk'),
          createTestRuntimeAdapter('vercel-ai-sdk'),
          createTestRuntimeAdapter('langchain'),
          createTestRuntimeAdapter('google-genai'),
          createTestRuntimeAdapter('eve'),
          createTestRuntimeAdapter('cloudflare-agents'),
          createTestRuntimeAdapter('claude-agent-sdk'),
          createTestRuntimeAdapter('anthropic'),
        ],
      }),
    ).toBe(true);
  });

  test.each([
    [
      'duplicate adapter IDs',
      [createTestRuntimeAdapter('openai'), createTestRuntimeAdapter('openai')],
    ],
    ['the built-in custom ID', [createTestRuntimeAdapter('custom')]],
    ['a planned adapter', [createTestRuntimeAdapter('langgraph')]],
  ])('rejects active registration containing %s', (_description, activeAdapters) => {
    const state = createTestCompatibilityState();

    expect(isMoldeaCliCompatibilityStateValid({ ...state, activeAdapters })).toBe(false);
  });

  test('rejects an available adapter that is absent from active registration', () => {
    const state = createTestActivePackageAdaptersState();

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
                  implementation: { ...openAiEntry.implementation, versionRange: '^3.0.0' },
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
                openai: { ...openAiEntry, compatibleCoreRange: '^3.0.0' },
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
    expect(isMoldeaCliCompatibilityStateValid(mutate(createTestActivePackageAdaptersState()))).toBe(
      false,
    );
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
                compatibleCoreRange: '^3.0.0',
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
        implementation: { ...entry.implementation, versionRange: '^1.0.0' },
      }),
    ],
    [
      'Core compatibility range',
      (entry: IMoldeaCliRuntimeAdapterEntry) => ({ ...entry, compatibleCoreRange: '^1.0.0' }),
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
    const plannedEntry = state.releaseMetadata.matrix.adapters['langgraph'];

    if (plannedEntry === undefined) {
      throw new TypeError('The planned LangGraph matrix entry is required.');
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
              langgraph: mutate(plannedEntry),
            },
          },
        },
      }),
    ).toBe(false);
  });

  test.each(['runtimeGuidance', 'targets', 'lastVerifiedAt'] as const)(
    'rejects an available adapter missing required %s',
    (propertyName) => {
      const state = createTestActivePackageAdaptersState();
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
    const state = createTestActivePackageAdaptersState();
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
      compatibleCoreRange: '^2.0.0',
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
    const availableState = createTestActivePackageAdaptersState();
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
