/*
 * Generated file. Do not edit directly.
 * Canonical sources:
 * - /compatibility/runtimes.yaml
 * - /projects/<project>/package.json
 * - /projects/core/src/constants/index.ts
 * - /projects/cli/src/core-composition/release-definitions/index.ts
 * - /projects/cli/src/git-version/constants.ts
 * - /projects/cli/src/json-output-contract/index.ts
 */
import type { IMoldeaCliReleaseMetadata } from './types.js';
import { freezeMoldeaCliReleaseMetadata } from './utilities.js';

// immutable compatibility and package composition bundled into this CLI release
export const MOLDEA_CLI_RELEASE_METADATA = freezeMoldeaCliReleaseMetadata({
  activeAdapterIds: [],
  cliPackage: {
    name: '@moldea.ai/cli',
    supportedNodeRange: '^22.11.0 || ^24.11.0',
    version: '0.0.1',
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
    'pydantic-ai',
    'vercel-ai-sdk',
  ],
  matrix: {
    adapters: {
      anthropic: {
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-anthropic',
        },
        implementationStatus: 'planned',
      },
      'claude-agent-sdk': {
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-claude-agent-sdk',
        },
        implementationStatus: 'planned',
      },
      'cloudflare-agents': {
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-cloudflare-agents',
        },
        implementationStatus: 'planned',
      },
      custom: {
        implementation: {
          distribution: 'public',
          kind: 'built-in',
          package: '@moldea.ai/core',
        },
        implementationStatus: 'planned',
      },
      eve: {
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-eve',
        },
        implementationStatus: 'planned',
      },
      'google-genai': {
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-google-genai',
        },
        implementationStatus: 'planned',
      },
      langchain: {
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-langchain',
        },
        implementationStatus: 'planned',
      },
      langgraph: {
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-langgraph',
        },
        implementationStatus: 'planned',
      },
      openai: {
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-openai',
        },
        implementationStatus: 'planned',
      },
      'openai-agents-sdk': {
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-openai-agents-sdk',
        },
        implementationStatus: 'planned',
      },
      'pydantic-ai': {
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-pydantic-ai',
        },
        implementationStatus: 'planned',
      },
      'vercel-ai-sdk': {
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-vercel-ai-sdk',
        },
        implementationStatus: 'planned',
      },
    },
    version: 1,
  },
  minimumGitVersion: '2.30.0',
  outputSchemaVersion: 1,
  packages: [
    {
      name: '@moldea.ai/core',
      version: '0.0.1',
    },
    {
      name: '@moldea.ai/repository',
      version: '0.0.1',
    },
    {
      name: '@moldea.ai/repository-fs',
      version: '0.0.1',
    },
  ],
  repositoryFormatVersions: [1],
} satisfies IMoldeaCliReleaseMetadata);
