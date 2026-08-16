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
    '@moldea.ai/adapter-anthropic': 'workspace:1.0.0',
    '@moldea.ai/adapter-openai': 'workspace:2.0.1',
    '@moldea.ai/core': 'workspace:2.0.0',
    '@moldea.ai/repository': 'workspace:1.0.1',
    '@moldea.ai/repository-fs': 'workspace:1.0.1',
    semver: '7.8.5',
  }),
  installedPackageVersions: Object.freeze({
    '@moldea.ai/adapter-anthropic': '1.0.0',
    '@moldea.ai/adapter-openai': '2.0.1',
    '@moldea.ai/core': '2.0.0',
    '@moldea.ai/repository': '1.0.1',
    '@moldea.ai/repository-fs': '1.0.1',
  }),
  supportedNodeRange: '^22.11.0 || ^24.11.0',
  version: '2.1.0',
});

const availableOpenAiMatrixEntry = MOLDEA_CLI_RELEASE_METADATA.matrix.adapters['openai'];

if (availableOpenAiMatrixEntry === undefined) {
  throw new TypeError('The generated OpenAI matrix entry is required.');
}

// complete available package-backed matrix claim used by activation tests
export const AVAILABLE_OPENAI_MATRIX_ENTRY: IMoldeaCliRuntimeAdapterEntry =
  availableOpenAiMatrixEntry;

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
    activeAdapters: [createTestRuntimeAdapter('anthropic'), createTestRuntimeAdapter('openai')],
    coreRecognizedAdapterIds: releaseMetadata.coreRecognizedAdapterIds,
    coreSupportedRepositoryFormatVersions: [1],
    minimumGitVersion: '2.30.0',
    outputSchemaVersion: 1,
    packageMetadata: INSTALLED_PACKAGE_METADATA,
    releaseMetadata,
  };
};

/** Creates a valid compatibility state with the active package-backed adapters. */
export const createTestActivePackageAdaptersState = (): IMoldeaCliCompatibilityStateInput => {
  return createTestCompatibilityState();
};
