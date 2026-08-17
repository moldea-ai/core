// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { MOLDEA_CLI_RELEASE_METADATA } from './release-metadata.generated.js';
import type { IMoldeaCliReleaseMetadata } from './types.js';
import { freezeMoldeaCliReleaseMetadata } from './utilities.js';

/** Asserts recursive object immutability without assuming a particular metadata shape. */
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

describe('CLI release metadata immutability', () => {
  test('deeply freezes generated release metadata with exact current composition', () => {
    expect(MOLDEA_CLI_RELEASE_METADATA).toMatchObject({
      activeAdapterIds: ['anthropic', 'openai'],
      cliPackage: {
        name: '@moldea.ai/cli',
        supportedNodeRange: '^22.11.0 || ^24.11.0',
        version: '3.0.0',
      },
      coreRecognizedAdapterIds: [
        'anthropic',
        'claude-agent-sdk',
        'cloudflare-agents',
        'custom',
        'eve',
        'google-genai',
        'langchain',
        'langgraph',
        'openai',
        'openai-agents-sdk',
        'vercel-ai-sdk',
      ],
      minimumGitVersion: '2.30.0',
      outputSchemaVersion: 1,
      packages: [
        { name: '@moldea.ai/adapter-anthropic', version: '2.0.0' },
        { name: '@moldea.ai/adapter-openai', version: '2.0.3' },
        { name: '@moldea.ai/core', version: '2.0.0' },
        { name: '@moldea.ai/repository', version: '1.0.1' },
        { name: '@moldea.ai/repository-fs', version: '1.0.1' },
      ],
      repositoryFormatVersions: [1],
    });
    expect(Object.keys(MOLDEA_CLI_RELEASE_METADATA.matrix.adapters)).toStrictEqual([
      'anthropic',
      'claude-agent-sdk',
      'cloudflare-agents',
      'custom',
      'eve',
      'google-genai',
      'langchain',
      'langgraph',
      'openai',
      'openai-agents-sdk',
      'vercel-ai-sdk',
    ]);
    expect(MOLDEA_CLI_RELEASE_METADATA.matrix.adapters['custom']).toMatchObject({
      compatibleCoreRange: '^2.0.0',
      implementationStatus: 'available',
      runtimeGuidance: { expectation: 'required' },
      supportedRepositoryFormatVersions: [1],
      targets: [{ id: 'custom' }],
    });
    expect(MOLDEA_CLI_RELEASE_METADATA.matrix.adapters['openai']).toMatchObject({
      compatibleCoreRange: '^2.0.0',
      implementation: { package: '@moldea.ai/adapter-openai', versionRange: '^2.0.0' },
      implementationStatus: 'available',
      runtimeGuidance: { expectation: 'recommended' },
      supportedRepositoryFormatVersions: [1],
      targets: [{ id: 'typescript-responses-api-7', supportLevel: 'experimental' }],
    });
    expect(
      Object.entries(MOLDEA_CLI_RELEASE_METADATA.matrix.adapters).every(
        ([adapterId, { implementationStatus }]) =>
          adapterId === 'anthropic' ||
          adapterId === 'custom' ||
          adapterId === 'openai' ||
          implementationStatus === 'planned',
      ),
    ).toBe(true);
    expectDeeplyFrozen(MOLDEA_CLI_RELEASE_METADATA);
  });

  test('returns and recursively freezes the supplied trusted object', () => {
    const metadata: IMoldeaCliReleaseMetadata = {
      activeAdapterIds: [],
      cliPackage: {
        name: '@moldea.ai/cli',
        supportedNodeRange: '^24.11.0',
        version: '1.0.0',
      },
      coreRecognizedAdapterIds: [],
      matrix: { adapters: {}, version: 1 },
      minimumGitVersion: '2.30.0',
      outputSchemaVersion: 1,
      packages: [],
      repositoryFormatVersions: [1],
    };

    expect(freezeMoldeaCliReleaseMetadata(metadata)).toBe(metadata);
    expectDeeplyFrozen(metadata);
  });
});
