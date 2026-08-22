import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';

import type { IMoldeaCliPackageMetadata } from '../package-metadata/index.js';

import type { IMoldeaCliCompatibilityStateInput } from './types.js';

const PACKAGE_VERSIONS = {
  '@moldea.ai/adapter-anthropic': '2.0.3',
  '@moldea.ai/adapter-claude-agent-sdk': '1.0.2',
  '@moldea.ai/adapter-cloudflare-agents': '1.0.2',
  '@moldea.ai/adapter-eve': '1.0.2',
  '@moldea.ai/adapter-google-genai': '1.0.5',
  '@moldea.ai/adapter-langchain': '1.0.2',
  '@moldea.ai/adapter-langgraph': '1.0.2',
  '@moldea.ai/adapter-openai': '2.0.6',
  '@moldea.ai/adapter-openai-agents-sdk': '1.0.4',
  '@moldea.ai/adapter-vercel-ai-sdk': '1.0.2',
  '@moldea.ai/core': '2.0.1',
  '@moldea.ai/repository': '1.0.2',
  '@moldea.ai/repository-fs': '1.0.3',
} as const;

// exact installed package metadata used by compatibility tests
export const INSTALLED_PACKAGE_METADATA: IMoldeaCliPackageMetadata = Object.freeze({
  dependencies: Object.freeze(
    Object.fromEntries(
      Object.entries(PACKAGE_VERSIONS).map(([name, version]) => [name, `workspace:${version}`]),
    ),
  ),
  installedPackageVersions: Object.freeze({ ...PACKAGE_VERSIONS }),
  supportedNodeRange: '^22.11.0 || ^24.11.0',
  version: '4.0.0',
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

/** Creates the exact valid current runtime compatibility state. */
export const createTestCompatibilityState = (): IMoldeaCliCompatibilityStateInput => ({
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
  coreSupportedRepositoryFormatVersions: [1],
  minimumGitVersion: '2.30.0',
  outputSchemaVersion: 2,
  packageMetadata: INSTALLED_PACKAGE_METADATA,
});
