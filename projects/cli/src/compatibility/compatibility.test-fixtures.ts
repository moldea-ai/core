import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';

import type { IMoldeaCliPackageMetadata } from '../package-metadata/index.js';
import {
  MOLDEA_CLI_RELEASE_METADATA,
  type IMoldeaCliReleaseMetadata,
  type IMoldeaCliRuntimeAdapterEntry,
} from '../release-metadata/index.js';

import type { IMoldeaCliCompatibilityStateInput } from './types.js';

// exact source-workspace package metadata used by compatibility tests
export const INSTALLED_PACKAGE_METADATA: IMoldeaCliPackageMetadata = Object.freeze({
  dependencies: Object.freeze({
    '@moldea.ai/core': 'workspace:1.0.1',
    '@moldea.ai/repository': 'workspace:1.0.1',
    '@moldea.ai/repository-fs': 'workspace:1.0.1',
    semver: '7.8.5',
  }),
  installedPackageVersions: Object.freeze({
    '@moldea.ai/core': '1.0.1',
    '@moldea.ai/repository': '1.0.1',
    '@moldea.ai/repository-fs': '1.0.1',
  }),
  supportedNodeRange: '^22.11.0 || ^24.11.0',
  version: '1.0.1',
});

// complete available package-backed matrix claim used by activation tests
export const AVAILABLE_OPENAI_MATRIX_ENTRY: IMoldeaCliRuntimeAdapterEntry = Object.freeze({
  compatibleCoreRange: '^1.0.0',
  implementation: Object.freeze({
    distribution: 'public',
    kind: 'package',
    package: '@moldea.ai/adapter-openai',
    versionRange: '^1.0.0',
  }),
  implementationStatus: 'available',
  lastVerifiedAt: '2026-08-13',
  runtimeGuidance: Object.freeze({ expectation: 'optional' }),
  supportedRepositoryFormatVersions: Object.freeze([1]),
  targets: Object.freeze([
    Object.freeze({
      id: 'typescript',
      kind: 'package',
      language: 'typescript',
      lastVerifiedAt: '2026-08-13',
      supportLevel: 'supported',
    }),
  ]),
});

/** Creates one minimal runtime adapter for compatibility-composition tests. */
export const createTestRuntimeAdapter = (
  id: string,
  supportedRepositoryFormatVersions: readonly 1[] = [1],
): IRuntimeAdapter => ({
  id,
  inspect: () => Promise.resolve(Object.freeze({ diagnostics: [], evidence: [] })),
  supportedRepositoryFormatVersions,
});

/** Creates a mutable clone of the trusted generated release snapshot for adversarial tests. */
export const createTestReleaseMetadata = (): IMoldeaCliReleaseMetadata =>
  structuredClone(MOLDEA_CLI_RELEASE_METADATA);

/** Creates the exact valid current runtime compatibility state. */
export const createTestCompatibilityState = (): IMoldeaCliCompatibilityStateInput => {
  const releaseMetadata = createTestReleaseMetadata();

  return {
    activeAdapters: [],
    coreRecognizedAdapterIds: releaseMetadata.coreRecognizedAdapterIds,
    coreSupportedRepositoryFormatVersions: [1],
    minimumGitVersion: '2.30.0',
    outputSchemaVersion: 1,
    packageMetadata: INSTALLED_PACKAGE_METADATA,
    releaseMetadata,
  };
};

/** Creates a valid compatibility state with one available package-backed OpenAI adapter. */
export const createTestActiveOpenAiState = (): IMoldeaCliCompatibilityStateInput => {
  const baseState = createTestCompatibilityState();
  const matrixAdapters = {
    ...baseState.releaseMetadata.matrix.adapters,
    openai: AVAILABLE_OPENAI_MATRIX_ENTRY,
  };

  return {
    ...baseState,
    activeAdapters: [createTestRuntimeAdapter('openai')],
    packageMetadata: {
      ...baseState.packageMetadata,
      dependencies: {
        ...baseState.packageMetadata.dependencies,
        '@moldea.ai/adapter-openai': 'workspace:1.0.0',
      },
      installedPackageVersions: {
        ...baseState.packageMetadata.installedPackageVersions,
        '@moldea.ai/adapter-openai': '1.0.0',
      },
    },
    releaseMetadata: {
      ...baseState.releaseMetadata,
      activeAdapterIds: ['openai'],
      matrix: { adapters: matrixAdapters, version: 1 },
      packages: [
        { name: '@moldea.ai/adapter-openai', version: '1.0.0' },
        ...baseState.releaseMetadata.packages,
      ],
    },
  };
};
