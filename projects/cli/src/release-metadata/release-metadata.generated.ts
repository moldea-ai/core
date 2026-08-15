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
  activeAdapterIds: ['openai'],
  cliPackage: {
    name: '@moldea.ai/cli',
    supportedNodeRange: '^22.11.0 || ^24.11.0',
    version: '1.1.0',
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
        compatibleCoreRange: '^1.0.0',
        implementation: {
          distribution: 'public',
          kind: 'built-in',
          package: '@moldea.ai/core',
        },
        implementationStatus: 'available',
        lastVerifiedAt: '2026-08-13',
        runtimeGuidance: {
          expectation: 'required',
          notes: 'Project-local guidance defines the custom runtime integration.',
        },
        supportedRepositoryFormatVersions: [1],
        targets: [
          {
            id: 'custom',
            kind: 'custom',
            language: 'any',
            lastVerifiedAt: '2026-08-13',
            patterns: [
              {
                description:
                  'Universal Core validation of explicit repository relationships without runtime-specific inference.',
                id: 'explicit-repository-relationships',
                kind: 'runtime',
                support: 'full',
              },
            ],
            supportLevel: 'supported',
          },
        ],
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
        compatibleCoreRange: '^1.0.0',
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-openai',
          versionRange: '^1.0.0',
        },
        implementationStatus: 'available',
        lastVerifiedAt: '2026-08-15',
        runtimeGuidance: {
          expectation: 'recommended',
          notes:
            'Document project-specific model selection, tool execution, streaming, retry, and error behavior that static inspection cannot establish.',
        },
        supportedRepositoryFormatVersions: [1],
        targets: [
          {
            bindingSupport: {
              'instruction-loader': {
                relationship: 'full',
                symbol: 'full',
              },
              'runtime-agent': {
                relationship: 'full',
                symbol: 'full',
              },
              'tool-input-schema': {
                relationship: 'full',
                symbol: 'full',
              },
              'tool-registration': {
                relationship: 'full',
                symbol: 'full',
              },
            },
            evidenceKinds: [
              'instruction-loader',
              'language',
              'runtime-package',
              'runtime-pattern',
              'schema',
              'tool-registration',
            ],
            id: 'typescript-responses-api-7',
            kind: 'package',
            knownLimitations: [
              'Agent input and output schemas, tool implementations and output schemas, skills, variables, and runtime-native routing do not produce evidence.',
              'JavaScript, CommonJS, Python, Realtime, Assistants, Agents SDK, streaming semantics, and provider-hosted configuration are not interpreted.',
              'Only TypeScript ESM files with supported direct default and relative named imports are interpreted.',
              'Package versions are classified from nearest package manifests; lockfiles and installed node_modules are not inspected.',
            ],
            language: 'typescript',
            lastVerifiedAt: '2026-08-15',
            packages: [
              {
                ecosystem: 'npm',
                name: 'openai',
                role: 'primary',
                versionRange: '>=7.4.0 <8.0.0',
              },
            ],
            patterns: [
              {
                description:
                  'A bound loader is called directly, optionally through await, by a Responses request instructions property.',
                id: 'direct-instruction-loader',
                kind: 'instruction-loader',
                support: 'full',
              },
              {
                description:
                  'Chat Completions usage is outside this target and is not rejected merely because Responses is preferred.',
                id: 'chat-completions',
                kind: 'runtime',
                support: 'ambiguous',
              },
              {
                description:
                  'A bound exported TypeScript function uses a module-local OpenAI client for one or more direct closed Responses API requests.',
                id: 'direct-responses-runtime-agent',
                kind: 'runtime',
                support: 'full',
              },
              {
                description:
                  'Factories, computed properties, spreads, mutable arrays, and indirect request values are not resolved.',
                id: 'dynamic-source-indirection',
                kind: 'runtime',
                support: 'ambiguous',
              },
              {
                description:
                  'A bound tool input schema is referenced directly by function-tool parameters.',
                id: 'direct-tool-input-schema',
                kind: 'schema',
                support: 'full',
              },
              {
                description:
                  'Bound static OpenAI function-tool objects are included in a closed inline or immutable module-local Responses tools array.',
                id: 'static-function-tools',
                kind: 'tool',
                support: 'full',
              },
            ],
            supportLevel: 'experimental',
          },
        ],
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
      name: '@moldea.ai/adapter-openai',
      version: '1.0.0',
    },
    {
      name: '@moldea.ai/core',
      version: '1.0.1',
    },
    {
      name: '@moldea.ai/repository',
      version: '1.0.1',
    },
    {
      name: '@moldea.ai/repository-fs',
      version: '1.0.1',
    },
  ],
  repositoryFormatVersions: [1],
} satisfies IMoldeaCliReleaseMetadata);
