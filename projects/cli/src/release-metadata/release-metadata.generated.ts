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
  activeAdapterIds: ['anthropic', 'google-genai', 'openai'],
  cliPackage: {
    name: '@moldea.ai/cli',
    supportedNodeRange: '^22.11.0 || ^24.11.0',
    version: '3.1.2',
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
  matrix: {
    adapters: {
      anthropic: {
        compatibleCoreRange: '^2.0.0',
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-anthropic',
          versionRange: '^2.0.0',
        },
        implementationStatus: 'available',
        lastVerifiedAt: '2026-08-17',
        runtimeGuidance: {
          expectation: 'optional',
          notes:
            'Project-local guidance is needed only for repository-specific wrappers or unsupported indirect integration patterns.',
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
            id: 'typescript-messages-api-0-117',
            kind: 'package',
            knownLimitations: [
              'Arbitrary compiler resolution, path aliases, directory indexes, package exports, and re-export graphs are not resolved.',
              'Beta resources, client.messages.stream, parse helpers, and tool-runner abstractions are not interpreted; an exact stream property on direct messages.create requests is tolerated, but its semantics are not validated.',
              'Client-tool input-schema contents, including the provider-required top-level type object, are not validated; the target establishes only direct schema wiring.',
              'Source forms outside the verified TypeScript ESM target, dynamic factories, mutable requests, provider tools, output schemas, runtime variables, and handoffs are outside the initial target.',
            ],
            language: 'typescript',
            lastVerifiedAt: '2026-08-17',
            packages: [
              {
                ecosystem: 'npm',
                name: '@anthropic-ai/sdk',
                role: 'primary',
                versionRange: '>=0.117.1 <0.118.0',
              },
            ],
            patterns: [
              {
                description:
                  'A directly bound instruction loader supplies the top-level system request property.',
                id: 'direct-system-loader',
                kind: 'instruction-loader',
                support: 'full',
              },
              {
                description:
                  'Direct Anthropic Messages API invocation through a module-local client in a directly exported TypeScript function.',
                id: 'direct-messages-create',
                kind: 'runtime',
                support: 'full',
              },
              {
                description:
                  'Dynamically assembled Messages requests cannot be mapped reliably without semantic analysis.',
                id: 'dynamic-request-construction',
                kind: 'runtime',
                support: 'ambiguous',
              },
              {
                description:
                  'A bound tool input schema is referenced directly through the client tool input_schema property.',
                id: 'direct-tool-input-schema',
                kind: 'schema',
                support: 'full',
              },
              {
                description:
                  'Closed inline or immutable module-local arrays contain statically declared Anthropic client tools.',
                id: 'closed-client-tool-array',
                kind: 'tool',
                support: 'full',
              },
              {
                description:
                  'Anthropic provider or server tools are outside the initial client-tool target.',
                id: 'provider-server-tools',
                kind: 'tool',
                support: 'unsupported',
              },
            ],
            providerLimits: [
              {
                description:
                  'Anthropic client-tool names match the complete ASCII letter, digit, underscore, and hyphen pattern.',
                id: 'client-tool-name',
                kind: 'pattern',
                reference: 'Anthropic Messages API reference for client tools.',
                subject: 'tool-name',
                value: '^[A-Za-z0-9_-]{1,64}$',
              },
            ],
            supportLevel: 'experimental',
          },
        ],
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
        compatibleCoreRange: '^2.0.0',
        implementation: {
          distribution: 'public',
          kind: 'built-in',
          package: '@moldea.ai/core',
        },
        implementationStatus: 'available',
        lastVerifiedAt: '2026-08-15',
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
            lastVerifiedAt: '2026-08-15',
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
        compatibleCoreRange: '^2.0.0',
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-google-genai',
          versionRange: '^1.0.0',
        },
        implementationStatus: 'available',
        lastVerifiedAt: '2026-08-18',
        runtimeGuidance: {
          expectation: 'optional',
          notes:
            'Project-local guidance is needed only for repository-specific wrappers or unsupported indirect integration patterns.',
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
            id: 'typescript-models-generate-content-2',
            kind: 'package',
            knownLimitations: [
              'Arbitrary compiler resolution, path aliases, directory indexes, package exports, subpath imports, and re-export graphs are not resolved.',
              'Backend-specific function-name restrictions are not validated; the published function-name rules cover only the version-matched SDK declaration contract.',
              'Constructor configuration, provider backend, API version, authentication mode, model selection, request contents, and response handling are not interpreted.',
              'Dynamic configuration, callable tools, MCP helpers, provider/server tools, automatic function execution, streaming, chats, live sessions, and Interactions API calls are outside the initial target.',
              'Function input-schema contents, including top-level object shape and parameter-name restrictions, are not validated; the target establishes only direct parametersJsonSchema wiring.',
              'Source forms outside the verified TypeScript ESM target, legacy @google/generative-ai, alternative parameters schemas, output schemas, runtime variables, and handoffs are outside the initial target.',
            ],
            language: 'typescript',
            lastVerifiedAt: '2026-08-18',
            packages: [
              {
                ecosystem: 'npm',
                name: '@google/genai',
                role: 'primary',
                versionRange: '>=2.17.1 <3.0.0',
              },
            ],
            patterns: [
              {
                description:
                  'A directly bound instruction loader supplies config.systemInstruction in a closed generate-content request.',
                id: 'direct-config-system-instruction',
                kind: 'instruction-loader',
                support: 'full',
              },
              {
                description:
                  'Direct Google Gen AI models.generateContent invocation through a module-local client in a directly exported TypeScript function.',
                id: 'direct-models-generate-content',
                kind: 'runtime',
                support: 'full',
              },
              {
                description:
                  'Dynamically assembled requests or configuration cannot be mapped reliably without semantic analysis.',
                id: 'dynamic-request-or-config',
                kind: 'runtime',
                support: 'ambiguous',
              },
              {
                description:
                  'Streaming generation, chat sessions, live sessions, and Interactions API calls are outside the initial direct generate-content target.',
                id: 'streaming-chat-live-interactions',
                kind: 'runtime',
                support: 'unsupported',
              },
              {
                description:
                  'FunctionDeclaration.parameters and its OpenAPI-style Schema representation are outside the initial JSON-schema target.',
                id: 'alternative-parameters-schema',
                kind: 'schema',
                support: 'unsupported',
              },
              {
                description:
                  'A bound tool input schema is referenced directly through the function declaration parametersJsonSchema property.',
                id: 'direct-parameters-json-schema',
                kind: 'schema',
                support: 'full',
              },
              {
                description:
                  'Callable tools, MCP conversion helpers, and automatic tool execution are outside the initial static function-declaration target.',
                id: 'callable-and-mcp-tools',
                kind: 'tool',
                support: 'unsupported',
              },
              {
                description:
                  'Closed inline or immutable module-local collections expose statically declared functions through config.tools and functionDeclarations.',
                id: 'closed-function-declaration-tools',
                kind: 'tool',
                support: 'full',
              },
              {
                description:
                  'Google-hosted or provider/server tools do not establish version 1 repository-local manifest tool relationships.',
                id: 'provider-server-tools',
                kind: 'tool',
                support: 'unsupported',
              },
            ],
            providerLimits: [
              {
                description:
                  'The Google Gen AI SDK Tool contract permits at most 512 function declarations in each closed functionDeclarations collection.',
                id: 'function-declaration-count',
                kind: 'other',
                reference: 'Google Gen AI SDK Tool reference.',
                subject: 'other',
                value: 512,
              },
              {
                description:
                  'The Google Gen AI SDK FunctionDeclaration contract limits function names to 128 Unicode scalar values.',
                id: 'function-name-length',
                kind: 'max-unicode-scalars',
                reference: 'Google Gen AI SDK FunctionDeclaration reference.',
                subject: 'tool-name',
                value: 128,
              },
              {
                description:
                  'The Google Gen AI SDK FunctionDeclaration contract uses the documented ASCII leading and continuation character set.',
                id: 'function-name-pattern',
                kind: 'pattern',
                reference: 'Google Gen AI SDK FunctionDeclaration reference.',
                subject: 'tool-name',
                value: '^[A-Za-z_][A-Za-z0-9_.:-]*$',
              },
            ],
            supportLevel: 'experimental',
          },
        ],
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
        compatibleCoreRange: '^2.0.0',
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-openai',
          versionRange: '^2.0.0',
        },
        implementationStatus: 'available',
        lastVerifiedAt: '2026-08-17',
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
              'Only TypeScript ESM files with supported direct default and relative named imports are interpreted.',
              'Package versions are classified from nearest package manifests; lockfiles and installed node_modules are not inspected.',
              'Source forms outside the verified TypeScript ESM target, Realtime, Assistants, Agents SDK, streaming semantics, and provider-hosted configuration are not interpreted.',
            ],
            language: 'typescript',
            lastVerifiedAt: '2026-08-17',
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
                  'A bound exported TypeScript function uses a module-local OpenAI client for one or more direct Responses API object-literal requests with relationship-specific closure.',
                id: 'direct-responses-runtime-agent',
                kind: 'runtime',
                support: 'full',
              },
              {
                description:
                  'Factories, relationship-affecting computed properties and spreads, mutable arrays, and indirect request values remain unresolved.',
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
                  'Bound static OpenAI function-tool objects with the supported exact fields are included in a closed inline or immutable module-local Responses tools array.',
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
      name: '@moldea.ai/adapter-anthropic',
      version: '2.0.1',
    },
    {
      name: '@moldea.ai/adapter-google-genai',
      version: '1.0.2',
    },
    {
      name: '@moldea.ai/adapter-openai',
      version: '2.0.3',
    },
    {
      name: '@moldea.ai/core',
      version: '2.0.0',
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
