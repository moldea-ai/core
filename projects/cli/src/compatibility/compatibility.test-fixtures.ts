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
    '@moldea.ai/adapter-anthropic': 'workspace:2.0.2',
    '@moldea.ai/adapter-claude-agent-sdk': 'workspace:1.0.1',
    '@moldea.ai/adapter-cloudflare-agents': 'workspace:1.0.1',
    '@moldea.ai/adapter-eve': 'workspace:1.0.1',
    '@moldea.ai/adapter-google-genai': 'workspace:1.0.4',
    '@moldea.ai/adapter-langchain': 'workspace:1.0.1',
    '@moldea.ai/adapter-langgraph': 'workspace:1.0.1',
    '@moldea.ai/adapter-openai': 'workspace:2.0.5',
    '@moldea.ai/adapter-openai-agents-sdk': 'workspace:1.0.3',
    '@moldea.ai/adapter-vercel-ai-sdk': 'workspace:1.0.1',
    '@moldea.ai/core': 'workspace:2.0.1',
    '@moldea.ai/repository': 'workspace:1.0.2',
    '@moldea.ai/repository-fs': 'workspace:1.0.3',
    semver: '7.8.5',
  }),
  installedPackageVersions: Object.freeze({
    '@moldea.ai/adapter-anthropic': '2.0.2',
    '@moldea.ai/adapter-claude-agent-sdk': '1.0.1',
    '@moldea.ai/adapter-cloudflare-agents': '1.0.1',
    '@moldea.ai/adapter-eve': '1.0.1',
    '@moldea.ai/adapter-google-genai': '1.0.4',
    '@moldea.ai/adapter-langchain': '1.0.1',
    '@moldea.ai/adapter-langgraph': '1.0.1',
    '@moldea.ai/adapter-openai': '2.0.5',
    '@moldea.ai/adapter-openai-agents-sdk': '1.0.3',
    '@moldea.ai/adapter-vercel-ai-sdk': '1.0.1',
    '@moldea.ai/core': '2.0.1',
    '@moldea.ai/repository': '1.0.2',
    '@moldea.ai/repository-fs': '1.0.3',
  }),
  supportedNodeRange: '^22.11.0 || ^24.11.0',
  version: '3.3.7',
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
    activeAdapters: [
      createTestRuntimeAdapter('anthropic'),
      createTestRuntimeAdapter('claude-agent-sdk'),
      createTestRuntimeAdapter('cloudflare-agents'),
      createTestRuntimeAdapter('eve'),
      createTestRuntimeAdapter('google-genai'),
      createTestRuntimeAdapter('langchain'),
      createTestRuntimeAdapter('langgraph'),
      createTestRuntimeAdapter('openai'),
      createTestRuntimeAdapter('openai-agents-sdk'),
      createTestRuntimeAdapter('vercel-ai-sdk'),
    ],
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

/** Creates a valid compatibility state where LangGraph remains an unbundled planned adapter. */
export const createTestPlannedLangGraphState = (): IMoldeaCliCompatibilityStateInput => {
  const state = createTestCompatibilityState();
  const langGraphEntry = state.releaseMetadata.matrix.adapters['langgraph'];

  if (langGraphEntry === undefined) {
    throw new TypeError('The generated LangGraph matrix entry is required.');
  }

  const plannedLangGraphEntry: IMoldeaCliRuntimeAdapterEntry = {
    implementation: {
      distribution: langGraphEntry.implementation.distribution,
      kind: langGraphEntry.implementation.kind,
      package: langGraphEntry.implementation.package,
    },
    implementationStatus: 'planned',
  };
  const dependencies = Object.fromEntries(
    Object.entries(state.packageMetadata.dependencies ?? {}).filter(
      ([packageName]) => packageName !== '@moldea.ai/adapter-langgraph',
    ),
  );
  const installedPackageVersions = Object.fromEntries(
    Object.entries(state.packageMetadata.installedPackageVersions ?? {}).filter(
      ([packageName]) => packageName !== '@moldea.ai/adapter-langgraph',
    ),
  );

  return {
    ...state,
    activeAdapters: state.activeAdapters.filter(({ id }) => id !== 'langgraph'),
    packageMetadata: {
      ...state.packageMetadata,
      dependencies,
      installedPackageVersions,
    },
    releaseMetadata: {
      ...state.releaseMetadata,
      activeAdapterIds: state.releaseMetadata.activeAdapterIds.filter(
        (adapterId) => adapterId !== 'langgraph',
      ),
      matrix: {
        ...state.releaseMetadata.matrix,
        adapters: {
          ...state.releaseMetadata.matrix.adapters,
          langgraph: plannedLangGraphEntry,
        },
      },
      packages: state.releaseMetadata.packages.filter(
        ({ name }) => name !== '@moldea.ai/adapter-langgraph',
      ),
    },
  };
};
