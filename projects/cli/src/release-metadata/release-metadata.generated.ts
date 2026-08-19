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
  activeAdapterIds: [
    'anthropic',
    'claude-agent-sdk',
    'cloudflare-agents',
    'google-genai',
    'openai',
    'openai-agents-sdk',
    'vercel-ai-sdk',
  ],
  cliPackage: {
    name: '@moldea.ai/cli',
    supportedNodeRange: '^22.11.0 || ^24.11.0',
    version: '3.3.2',
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
        compatibleCoreRange: '^2.0.0',
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-claude-agent-sdk',
          versionRange: '^1.0.0',
        },
        implementationStatus: 'available',
        lastVerifiedAt: '2026-08-19',
        runtimeGuidance: {
          expectation: 'optional',
          notes:
            'Project-local guidance is needed only for repository-specific wrappers, main-thread agent selection, tool aliases, string-array prompts, filesystem-defined agents, dynamic agent construction, observer behavior, external MCP configuration, or other unsupported indirect integration patterns.',
        },
        supportedRepositoryFormatVersions: [1],
        targets: [
          {
            bindingSupport: {
              'instruction-loader': {
                relationship: 'full',
                symbol: 'full',
              },
              'output-schema': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'runtime-agent': {
                relationship: 'full',
                symbol: 'full',
              },
              'tool-implementation': {
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
              'agent-definition',
              'handoff-registration',
              'instruction-loader',
              'language',
              'runtime-package',
              'runtime-pattern',
              'schema',
              'tool-registration',
            ],
            id: 'typescript-query-subagents-0-3',
            kind: 'package',
            knownLimitations: [
              'A configured agents map becomes active delegation evidence only when supported static query tools and bare tool-name deny-pattern analysis classify query-configured Agent availability as available; tools arrays that omit Agent, tools: [], and any supported deny pattern matching Agent make it unavailable.',
              "A supported query-level mcpServers key must match ^[A-Za-z0-9_-]+$ exactly. Empty or normalization-requiring keys produce CLAUDE_AGENT_SDK_MCP_SERVER_KEY_UNSUPPORTED and keep only the affected mount's runtime-name and tool-availability relationships unresolved; the adapter does not reproduce SDK normalization or infer normalized-key collisions.",
              'Agent output-schema support applies only to query-wrapper agents through outputFormat; programmatic AgentDefinitions have no initial output-schema relationship.',
              'AgentDefinition observer, observerMessage, and criticalSystemReminder_EXPERIMENTAL semantics are outside the target, although their presence does not erase independently proved prompt, description, tool, or active-registration relationships.',
              'Arbitrary compiler resolution, path aliases, directory indexes, package exports, CommonJS, JavaScript, re-export graphs, and generated source are not resolved.',
              'Dynamic availability, scoped Agent or Task permission expressions, unsupported non-* glob syntax, and legacy Task aliases remain unresolved. Static bare * globs are matched against the complete tool name. allowedTools controls preapproval rather than availability and neither creates nor restores the Agent tool.',
              'Establishing query-configured Agent or SDK MCP tool availability does not prove that filesystem-loaded settings, managed policy, hooks, later session state, allowedTools, canUseTool, permission mode, or user approval preserve or permit a particular invocation, and no evidence claims that Claude will actually invoke the subagent or tool.',
              'Programmatic subagents require directly exported immutable object-literal AgentDefinitions; dynamic factories and filesystem-defined agents remain outside the target.',
              'Query and subagent tool-registration evidence requires an available relationship-local state after supported exact-name, server-selector, and complete-name * glob deny analysis. Dynamic or unsupported restrictions that could match the tool remain unresolved and produce neither optimistic evidence nor a false negative diagnostic.',
              'Query wrappers require a directly exported function and direct query calls with object-literal input and options forms.',
              'Query-level agent selection, toolAliases, string-array system prompts, and built-in-tool preset expansion remain outside the initial target and keep only the relationships they can change unresolved.',
              'Routing-description validation supports only static inline, immutable module-local, and directly imported static strings in an active delegation context; loaders, file reads, transformations, and runtime-generated values remain unresolved.',
              'SDK MCP tool support is limited to repository-local tool and createSdkMcpServer definitions mounted through query-level mcpServers maps.',
              'The fully qualified manifest tool name is derived from the canonical query mcpServers key and tool name; the createSdkMcpServer name does not replace that key.',
              'Tool input and query output schema contents are not validated; the target establishes only direct schema wiring.',
              'Tool output schemas, agent input schemas, external MCP tools, resources, prompts, skills, plugins, hooks, sessions, permission approval, sandboxing, workflows, model selection, and provider behavior are not interpreted.',
              'createSdkMcpServer instructions are tolerated but are not canonical instruction-loader evidence or semantically validated model-facing content.',
            ],
            language: 'typescript',
            lastVerifiedAt: '2026-08-19',
            packages: [
              {
                ecosystem: 'npm',
                name: '@anthropic-ai/claude-agent-sdk',
                role: 'primary',
                versionRange: '>=0.3.234 <0.4.0',
              },
            ],
            patterns: [
              {
                description:
                  'Runtime-generated, factory-produced, conditional, spread-based, or mutated programmatic agent definitions remain unestablished.',
                id: 'dynamic-agent-definition',
                kind: 'agent',
                support: 'ambiguous',
              },
              {
                description:
                  'Subagents defined through .claude/agents files are outside the initial repository-owned programmatic target.',
                id: 'filesystem-subagents',
                kind: 'agent',
                support: 'unsupported',
              },
              {
                description:
                  'A directly exported immutable object-literal AgentDefinition supplies independently analyzable prompt, routing-description, and tool-restriction relationships.',
                id: 'programmatic-agent-definition',
                kind: 'agent',
                support: 'full',
              },
              {
                description:
                  "Query-level agent selection can apply another definition's prompt and tool restrictions to the main thread and keeps affected instruction, delegation, and tool relationships unresolved.",
                id: 'query-main-thread-agent-selection',
                kind: 'agent',
                support: 'unsupported',
              },
              {
                description:
                  'AgentDefinition criticalSystemReminder_EXPERIMENTAL is additional model-facing content and is not interpreted as canonical subagent instruction wiring.',
                id: 'experimental-critical-system-reminder',
                kind: 'instruction-loader',
                support: 'unsupported',
              },
              {
                description:
                  'A query-wrapper agent wires the declared instruction loader through a direct custom systemPrompt call.',
                id: 'query-custom-system-prompt',
                kind: 'instruction-loader',
                support: 'full',
              },
              {
                description:
                  'A query-wrapper agent uses the claude_code system-prompt preset and appends the declared canonical instruction loader directly.',
                id: 'query-preset-append',
                kind: 'instruction-loader',
                support: 'full',
              },
              {
                description:
                  'String-array system prompts and dynamic prompt-cache boundaries do not establish canonical query-wrapper instruction-loader wiring in the initial target.',
                id: 'query-system-prompt-block-array',
                kind: 'instruction-loader',
                support: 'unsupported',
              },
              {
                description:
                  'createSdkMcpServer instructions may coexist with supported tool relationships but are not canonical agent instruction-loader evidence or semantically validated content.',
                id: 'sdk-mcp-server-instructions',
                kind: 'instruction-loader',
                support: 'unsupported',
              },
              {
                description:
                  'The built-in general-purpose subagent and runtime Agent tool decisions are not mapped to registered moldea agents.',
                id: 'built-in-subagents',
                kind: 'routing',
                support: 'unsupported',
              },
              {
                description:
                  'A closed query agents map exposes supported programmatic subagent definitions under deterministic runtime names only when supported query-local rules classify query-configured Agent availability as available.',
                id: 'closed-programmatic-agents-map',
                kind: 'routing',
                support: 'full',
              },
              {
                description:
                  'Dynamic query tools or disallowedTools values, legacy Task aliases, scoped Agent or Task permission expressions, and unsupported non-* glob syntax do not establish whether a configured agents map is an active delegation surface.',
                id: 'dynamic-agent-delegation-availability',
                kind: 'routing',
                support: 'ambiguous',
              },
              {
                description:
                  'Runtime-generated, transformed, or indirectly loaded AgentDefinition descriptions remain unestablished.',
                id: 'dynamic-routing-description',
                kind: 'routing',
                support: 'ambiguous',
              },
              {
                description:
                  'For an active programmatic subagent registration, AgentDefinition.description uses the target canonical handoff description when present and the canonical agent-description fallback otherwise.',
                id: 'effective-routing-description',
                kind: 'routing',
                support: 'full',
              },
              {
                description:
                  'AgentDefinition observer and observerMessage semantics do not create ordinary moldea agent, handoff, routing-description, or instruction-loader relationships in the initial target.',
                id: 'observer-agent-fields',
                kind: 'routing',
                support: 'unsupported',
              },
              {
                description:
                  'Supported closed query tools and static bare disallowedTools patterns, including complete-name * globs, classify query-configured Agent availability; dynamic, scoped, legacy-alias, and unsupported non-* forms remain ambiguous.',
                id: 'query-agent-delegation-availability',
                kind: 'routing',
                support: 'full',
              },
              {
                description:
                  'The claude_code tools preset is not expanded to establish built-in Agent availability in the initial target.',
                id: 'query-built-in-tools-preset',
                kind: 'routing',
                support: 'unsupported',
              },
              {
                description:
                  'A directly exported TypeScript function contains one or more direct query calls in its own lexical body.',
                id: 'direct-query-wrapper',
                kind: 'runtime',
                support: 'full',
              },
              {
                description:
                  'Query inputs or options assembled through variables, factories, spreads, mutation, or arbitrary wrappers cannot be mapped reliably without semantic analysis.',
                id: 'dynamic-query-options',
                kind: 'runtime',
                support: 'ambiguous',
              },
              {
                description:
                  'Skills, plugins, hooks, settings, CLAUDE.md loading, and other filesystem features are outside the initial deterministic relationship target.',
                id: 'skills-plugins-and-hooks',
                kind: 'runtime',
                support: 'unsupported',
              },
              {
                description:
                  'A query-wrapper agent wires a bound output schema through outputFormat with the json_schema type.',
                id: 'query-json-schema-output',
                kind: 'schema',
                support: 'full',
              },
              {
                description:
                  'Dynamic or unsupported query or AgentDefinition tool restrictions that could match an SDK MCP tool establish neither positive registration evidence nor a closed negative registration conclusion.',
                id: 'dynamic-tool-availability',
                kind: 'tool',
                support: 'ambiguous',
              },
              {
                description:
                  'An actively delegable programmatic subagent has a closed AgentDefinition tools array containing the exact fully qualified SDK MCP tool name, and supported static deny-pattern analysis leaves the exact tool available.',
                id: 'explicit-subagent-tools',
                kind: 'tool',
                support: 'full',
              },
              {
                description:
                  'Stdio, SSE, HTTP, remote, proxy, and other external MCP configurations do not establish repository-local manifest tool relationships in the initial target.',
                id: 'external-mcp-servers',
                kind: 'tool',
                support: 'unsupported',
              },
              {
                description:
                  'An actively delegable programmatic subagent with omitted tools inherits a query-available SDK MCP tool when supported subagent deny-pattern analysis also leaves the exact tool available.',
                id: 'inherited-subagent-tools',
                kind: 'tool',
                support: 'full',
              },
              {
                description:
                  'AgentDefinition-level MCP server configuration is outside the initial query-level SDK MCP target.',
                id: 'per-agent-mcp-servers',
                kind: 'tool',
                support: 'unsupported',
              },
              {
                description:
                  'Query-level toolAliases can redirect model-emitted tool names and keep affected delegation and SDK MCP tool relationships unresolved.',
                id: 'query-tool-aliases',
                kind: 'tool',
                support: 'unsupported',
              },
              {
                description:
                  'An empty query mcpServers key cannot establish a supported canonical runtime-name segment, while a key containing characters outside [A-Za-z0-9_-] requires SDK normalization; either form produces the stable unsupported-key diagnostic and establishes no runtime-name or tool-availability conclusion for that mount.',
                id: 'sdk-mcp-server-key-normalization',
                kind: 'tool',
                support: 'unsupported',
              },
              {
                description:
                  'A closed SDK MCP server mounted under a canonical query mcpServers key matching ^[A-Za-z0-9_-]+$ exposes declared tools under fully qualified runtime names only when relationship-local query tool availability remains available after supported static deny-pattern analysis; optional server instructions remain outside canonical instruction validation.',
                id: 'sdk-mcp-server-registration',
                kind: 'tool',
                support: 'full',
              },
              {
                description:
                  'A directly exported SDK tool uses a static name, direct implementation binding, and direct input-schema binding.',
                id: 'sdk-mcp-tool-declaration',
                kind: 'tool',
                support: 'full',
              },
            ],
            supportLevel: 'experimental',
          },
        ],
      },
      'cloudflare-agents': {
        compatibleCoreRange: '^2.0.0',
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-cloudflare-agents',
          versionRange: '^1.0.0',
        },
        implementationStatus: 'available',
        lastVerifiedAt: '2026-08-19',
        runtimeGuidance: {
          expectation: 'recommended',
          notes:
            'Project-local guidance should document Cloudflare bindings, Durable Object wiring, and deployment-specific behavior outside the verified static source boundary.',
        },
        supportedRepositoryFormatVersions: [1],
        targets: [
          {
            bindingSupport: {
              'instruction-loader': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'output-schema': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'runtime-agent': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'tool-implementation': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'tool-input-schema': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'tool-output-schema': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'tool-registration': {
                relationship: 'partial',
                symbol: 'partial',
              },
            },
            evidenceKinds: [
              'agent-definition',
              'handoff-registration',
              'instruction-loader',
              'language',
              'runtime-package',
              'runtime-pattern',
              'schema',
              'tool-registration',
            ],
            id: 'typescript-ai-chat-agent-0-10-ai-sdk-7',
            kind: 'package',
            knownLimitations: [
              'Dynamic, provider, MCP-generated, or inline tools without exact repository registration identities are outside the target.',
              'Nested or indirect generation, request variables, prepareStep instruction interpretation, and generation functions other than generateText and streamText are outside the target.',
              'Output variants other than Output.object and all agent input schemas are outside the target.',
            ],
            language: 'typescript',
            lastVerifiedAt: '2026-08-19',
            packages: [
              {
                ecosystem: 'npm',
                name: 'agents',
                role: 'companion',
                versionRange: '>=0.21.0 <0.22.0',
              },
              {
                ecosystem: 'npm',
                name: 'ai',
                role: 'companion',
                versionRange: '>=7.0.0 <8.0.0',
              },
              {
                ecosystem: 'npm',
                name: '@cloudflare/ai-chat',
                role: 'primary',
                versionRange: '>=0.10.2 <0.11.0',
              },
            ],
            patterns: [
              {
                description:
                  'Directly exported TypeScript classes extending an exact named AIChatAgent import with the supported onChatMessage signature.',
                id: 'directly-exported-ai-chat-agent-class',
                kind: 'agent',
                support: 'partial',
              },
              {
                description:
                  "Direct generateText or streamText calls in the onChatMessage method's own lexical body.",
                id: 'direct-ai-sdk-generation',
                kind: 'runtime',
                support: 'partial',
              },
              {
                description:
                  'Output.object agent schemas, repository-local AI SDK function tools, and Cloudflare agentTool helpers in closed generation-request tools maps.',
                id: 'ai-chat-structured-output-and-tools',
                kind: 'tool',
                support: 'partial',
              },
            ],
            supportLevel: 'experimental',
          },
          {
            bindingSupport: {
              'instruction-loader': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'runtime-agent': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'tool-implementation': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'tool-input-schema': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'tool-output-schema': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'tool-registration': {
                relationship: 'partial',
                symbol: 'partial',
              },
            },
            evidenceKinds: [
              'agent-definition',
              'handoff-registration',
              'instruction-loader',
              'language',
              'runtime-package',
              'schema',
              'tool-registration',
            ],
            id: 'typescript-think-0-16-ai-sdk-7',
            kind: 'package',
            knownLimitations: [
              'Agent input and output schemas are not supported for Think.',
              'Bare Agent classes, factories, indirect subclasses, decorators, executable fields, static blocks, computed members, generators, and non-pass-through constructors are outside the target.',
              'Dynamic session builders, onCompaction interpretation, runtime mutation, channel-provided tool replacement, and open tools maps are outside the target.',
            ],
            language: 'typescript',
            lastVerifiedAt: '2026-08-19',
            packages: [
              {
                ecosystem: 'npm',
                name: 'agents',
                role: 'companion',
                versionRange: '>=0.21.0 <0.22.0',
              },
              {
                ecosystem: 'npm',
                name: 'ai',
                role: 'companion',
                versionRange: '>=7.0.0 <8.0.0',
              },
              {
                ecosystem: 'npm',
                name: '@cloudflare/think',
                role: 'primary',
                versionRange: '>=0.16.0 <0.17.0',
              },
            ],
            patterns: [
              {
                description:
                  'Directly exported TypeScript classes extending an exact named Think import with closed class initialization.',
                id: 'directly-exported-think-class',
                kind: 'agent',
                support: 'partial',
              },
              {
                description:
                  'Direct loader calls returned by getSystemPrompt or supported closed configureSession chaining.',
                id: 'think-instruction-methods',
                kind: 'instruction-loader',
                support: 'partial',
              },
              {
                description:
                  'Repository-local AI SDK function tools and Cloudflare agentTool helpers active in a closed getTools map.',
                id: 'closed-think-tools-map',
                kind: 'tool',
                support: 'partial',
              },
            ],
            supportLevel: 'experimental',
          },
        ],
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
          versionRange: '^1.0.3',
        },
        implementationStatus: 'available',
        lastVerifiedAt: '2026-08-19',
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
            lastVerifiedAt: '2026-08-19',
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
        compatibleCoreRange: '^2.0.0',
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-openai-agents-sdk',
          versionRange: '^1.0.0',
        },
        implementationStatus: 'available',
        lastVerifiedAt: '2026-08-19',
        runtimeGuidance: {
          expectation: 'optional',
          notes:
            'Project-local guidance is needed only for repository-specific wrappers, dynamic graph construction, or unsupported indirect integration patterns.',
        },
        supportedRepositoryFormatVersions: [1],
        targets: [
          {
            bindingSupport: {
              'instruction-loader': {
                relationship: 'full',
                symbol: 'full',
              },
              'output-schema': {
                relationship: 'full',
                symbol: 'full',
              },
              'runtime-agent': {
                relationship: 'full',
                symbol: 'full',
              },
              'tool-implementation': {
                relationship: 'full',
                symbol: 'full',
              },
              'tool-input-schema': {
                relationship: 'full',
                symbol: 'full',
              },
              'tool-output-schema': {
                relationship: 'full',
                symbol: 'full',
              },
              'tool-registration': {
                relationship: 'full',
                symbol: 'full',
              },
            },
            evidenceKinds: [
              'agent-definition',
              'handoff-registration',
              'instruction-loader',
              'language',
              'runtime-package',
              'schema',
              'tool-registration',
            ],
            id: 'typescript-agent-handoffs-0-16',
            kind: 'package',
            knownLimitations: [
              'Agent output, tool input, and tool output schema contents are not validated; the target establishes only direct schema wiring.',
              'Arbitrary compiler resolution, path aliases, directory indexes, package exports, CommonJS, and re-export graphs are not resolved.',
              'Custom Handoff objects, agents as tools, hosted tools, MCP tools, Realtime agents, sandbox agents, and dynamically assembled agent graphs are outside the initial target.',
              'Function tools require an explicit static name already in the initial normalized runtime subset; omitted names and names requiring SDK normalization are outside the target rather than invalid.',
              'Handoff evidence reports a runtime name only for a supported static non-empty toolNameOverride that can be represented as a valid Runtime Adapter Contract machine string. SDK-generated default names and absent, empty, dynamic, unsupported, mutation-obscured, or evidence-unrepresentable overrides are reported as null.',
              'Handoff input schemas, callbacks, filters, enablement, runtime variables, guardrails, prompt templates, sessions, tracing, approvals, models, and provider behavior are not interpreted.',
              'Routing-description validation supports only static inline, immutable module-local, and directly imported static strings; loaders, file reads, transformations, and runtime-generated values remain unresolved.',
            ],
            language: 'typescript',
            lastVerifiedAt: '2026-08-19',
            packages: [
              {
                ecosystem: 'npm',
                name: '@openai/agents',
                role: 'primary',
                versionRange: '>=0.16.1 <0.17.0',
              },
            ],
            patterns: [
              {
                description:
                  'A directly exported TypeScript const constructs an Agent through Agent.create with one closed object-literal configuration.',
                id: 'agent-create-construction',
                kind: 'agent',
                support: 'full',
              },
              {
                description:
                  'A directly exported TypeScript const constructs an Agent through new Agent with one closed object-literal configuration.',
                id: 'direct-agent-construction',
                kind: 'agent',
                support: 'full',
              },
              {
                description:
                  'Dynamically assembled Agent configurations cannot be mapped reliably without semantic analysis.',
                id: 'dynamic-agent-configuration',
                kind: 'agent',
                support: 'ambiguous',
              },
              {
                description:
                  'Realtime and sandbox agent abstractions are outside the initial Agent target.',
                id: 'realtime-and-sandbox-agents',
                kind: 'agent',
                support: 'unsupported',
              },
              {
                description:
                  'A declared instruction loader is used by direct call, direct reference, or one supported single-return dynamic-instruction wrapper.',
                id: 'direct-instruction-loader',
                kind: 'instruction-loader',
                support: 'full',
              },
              {
                description:
                  'Agent-as-tool delegation retains manager control and is not interpreted as a handoff by the initial target.',
                id: 'agents-as-tools',
                kind: 'routing',
                support: 'unsupported',
              },
              {
                description:
                  'A source Agent registers a supported target through handoff with optional closed name and description overrides.',
                id: 'configured-handoff-helper',
                kind: 'routing',
                support: 'full',
              },
              {
                description:
                  'A source Agent registers a supported target Agent directly in its closed handoffs collection.',
                id: 'direct-agent-handoff',
                kind: 'routing',
                support: 'full',
              },
              {
                description:
                  'Runtime-generated or transformed handoff descriptions and description overrides remain unestablished.',
                id: 'dynamic-routing-description',
                kind: 'routing',
                support: 'ambiguous',
              },
              {
                description:
                  'Target handoffDescription uses the canonical handoff description when present and the canonical agent-description fallback otherwise.',
                id: 'effective-routing-description',
                kind: 'routing',
                support: 'full',
              },
              {
                description:
                  'A non-empty static toolDescriptionOverride is authoritative for its handoff registration and must use the target effective routing description.',
                id: 'registration-description-override',
                kind: 'routing',
                support: 'full',
              },
              {
                description:
                  'A bound agent output schema is referenced directly through outputType.',
                id: 'direct-agent-output-schema',
                kind: 'schema',
                support: 'full',
              },
              {
                description:
                  'Closed inline or immutable module-local arrays register supported function tools on an Agent.',
                id: 'closed-agent-tool-array',
                kind: 'tool',
                support: 'full',
              },
              {
                description:
                  'A directly exported function tool uses the root tool helper, an explicit normalized static name, direct implementation, and direct schema bindings.',
                id: 'closed-function-tool',
                kind: 'tool',
                support: 'full',
              },
              {
                description:
                  'Hosted, MCP-generated, namespaced, and tool-search tools are outside the initial repository-local function-tool target.',
                id: 'hosted-and-mcp-tools',
                kind: 'tool',
                support: 'unsupported',
              },
            ],
            supportLevel: 'experimental',
          },
        ],
      },
      'vercel-ai-sdk': {
        compatibleCoreRange: '^2.0.0',
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-vercel-ai-sdk',
          versionRange: '^1.0.0',
        },
        implementationStatus: 'available',
        lastVerifiedAt: '2026-08-19',
        runtimeGuidance: {
          expectation: 'optional',
          notes:
            'Project-local guidance is needed only for repository-specific wrappers or unsupported dynamic integration patterns.',
        },
        supportedRepositoryFormatVersions: [1],
        targets: [
          {
            bindingSupport: {
              'instruction-loader': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'output-schema': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'runtime-agent': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'tool-implementation': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'tool-input-schema': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'tool-output-schema': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'tool-registration': {
                relationship: 'partial',
                symbol: 'partial',
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
            id: 'typescript-generate-stream-text-7',
            kind: 'package',
            knownLimitations: [
              'Lockfiles and installed package versions are not inspected.',
              'Only Output.object establishes an agent output-schema relationship.',
              'Only TypeScript ESM source and documented direct relative imports are interpreted.',
              "Only direct generateText and streamText calls in the bound function's own lexical body are interpreted.",
              'The target does not infer providers, models, routing targets, handoffs, or subagent control transfer.',
              'prepareStep function bodies are not interpreted.',
            ],
            language: 'typescript',
            lastVerifiedAt: '2026-08-19',
            packages: [
              {
                ecosystem: 'npm',
                name: 'ai',
                role: 'primary',
                versionRange: '>=7.0.66 <8.0.0',
              },
            ],
            patterns: [
              {
                description:
                  'A directly exported function containing a direct generateText object-literal call is recognized as the runtime pattern.',
                id: 'direct-generate-text-wrapper',
                kind: 'agent',
                support: 'full',
              },
              {
                description:
                  'A directly exported function containing a direct streamText object-literal call is recognized as the runtime pattern.',
                id: 'direct-stream-text-wrapper',
                kind: 'agent',
                support: 'full',
              },
              {
                description:
                  'Direct loader calls are supported when prepareStep cannot replace the instructions.',
                id: 'direct-generation-instruction-loader',
                kind: 'instruction-loader',
                support: 'partial',
              },
              {
                description:
                  'instructions is authoritative and deprecated system is used only through the supported absence fallback.',
                id: 'instructions-system-precedence',
                kind: 'instruction-loader',
                support: 'full',
              },
              {
                description:
                  'prepareStep may replace per-step instructions and is not interpreted by the initial target.',
                id: 'prepare-step-instruction-overrides',
                kind: 'instruction-loader',
                support: 'ambiguous',
              },
              {
                description:
                  'Calls routed through arbitrary wrappers, factories, callbacks, or request builders are outside the initial target.',
                id: 'indirect-generation-wrapper',
                kind: 'runtime',
                support: 'unsupported',
              },
              {
                description:
                  'The initial direct-generation target publishes no agent input-schema relationship.',
                id: 'direct-agent-input-schema',
                kind: 'schema',
                support: 'unsupported',
              },
              {
                description:
                  'Direct Output.object schema binding establishes the agent output-schema relationship.',
                id: 'object-output-schema',
                kind: 'schema',
                support: 'partial',
              },
              {
                description:
                  'Closed object-map registration supports repository-local function tools created through tool.',
                id: 'closed-tools-map',
                kind: 'tool',
                support: 'partial',
              },
              {
                description:
                  'Direct execute, inputSchema, and outputSchema bindings are interpreted without executing the tool.',
                id: 'direct-function-tool-bindings',
                kind: 'tool',
                support: 'partial',
              },
            ],
            supportLevel: 'experimental',
          },
          {
            bindingSupport: {
              'input-schema': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'instruction-loader': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'output-schema': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'runtime-agent': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'tool-implementation': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'tool-input-schema': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'tool-output-schema': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'tool-registration': {
                relationship: 'partial',
                symbol: 'partial',
              },
            },
            evidenceKinds: [
              'agent-definition',
              'instruction-loader',
              'language',
              'runtime-package',
              'schema',
              'tool-registration',
            ],
            id: 'typescript-tool-loop-agent-7',
            kind: 'package',
            knownLimitations: [
              'Lockfiles and installed package versions are not inspected.',
              'Only Output.object establishes an agent output-schema relationship.',
              'Only TypeScript ESM source and documented direct relative imports are interpreted.',
              'The target does not infer providers, models, routing targets, handoffs, or subagent control transfer.',
              'prepareCall and prepareStep function bodies are not interpreted; prepareCall therefore leaves instruction, tool, and output-schema wiring unresolved.',
            ],
            language: 'typescript',
            lastVerifiedAt: '2026-08-19',
            packages: [
              {
                ecosystem: 'npm',
                name: 'ai',
                role: 'primary',
                versionRange: '>=7.0.66 <8.0.0',
              },
            ],
            patterns: [
              {
                description:
                  'Directly exported ToolLoopAgent construction through one closed object-literal settings value.',
                id: 'direct-tool-loop-agent-construction',
                kind: 'agent',
                support: 'full',
              },
              {
                description:
                  'prepareCall may replace instructions and tools or omit the construction-time output, and is not interpreted by the initial target.',
                id: 'prepare-call-overrides',
                kind: 'agent',
                support: 'ambiguous',
              },
              {
                description: 'WorkflowAgent and @ai-sdk/workflow are outside the initial target.',
                id: 'workflow-agent',
                kind: 'agent',
                support: 'unsupported',
              },
              {
                description:
                  'Direct loader calls in instructions are supported when prepareCall and prepareStep cannot replace them.',
                id: 'direct-agent-instruction-loader',
                kind: 'instruction-loader',
                support: 'partial',
              },
              {
                description:
                  'prepareStep may replace per-step instructions and is not interpreted by the initial target.',
                id: 'prepare-step-instruction-overrides',
                kind: 'instruction-loader',
                support: 'ambiguous',
              },
              {
                description:
                  'A function tool that calls another agent does not establish a target or handoff relationship in the initial target.',
                id: 'subagent-handoff-inference',
                kind: 'routing',
                support: 'unsupported',
              },
              {
                description:
                  'Direct callOptionsSchema binding establishes the agent input-schema relationship.',
                id: 'call-options-input-schema',
                kind: 'schema',
                support: 'full',
              },
              {
                description:
                  'Direct Output.object schema binding establishes the agent output-schema relationship when no uninterpreted prepareCall can remove it.',
                id: 'object-output-schema',
                kind: 'schema',
                support: 'partial',
              },
              {
                description:
                  'Closed object-map registration supports repository-local function tools created through tool.',
                id: 'closed-tools-map',
                kind: 'tool',
                support: 'partial',
              },
              {
                description:
                  'Direct execute, inputSchema, and outputSchema bindings are interpreted without executing the tool.',
                id: 'direct-function-tool-bindings',
                kind: 'tool',
                support: 'partial',
              },
            ],
            supportLevel: 'experimental',
          },
        ],
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
      name: '@moldea.ai/adapter-claude-agent-sdk',
      version: '1.0.0',
    },
    {
      name: '@moldea.ai/adapter-cloudflare-agents',
      version: '1.0.0',
    },
    {
      name: '@moldea.ai/adapter-google-genai',
      version: '1.0.3',
    },
    {
      name: '@moldea.ai/adapter-openai',
      version: '2.0.4',
    },
    {
      name: '@moldea.ai/adapter-openai-agents-sdk',
      version: '1.0.2',
    },
    {
      name: '@moldea.ai/adapter-vercel-ai-sdk',
      version: '1.0.0',
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
      version: '1.0.2',
    },
  ],
  repositoryFormatVersions: [1],
} satisfies IMoldeaCliReleaseMetadata);
