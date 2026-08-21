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
    'eve',
    'google-genai',
    'langchain',
    'langgraph',
    'openai',
    'openai-agents-sdk',
    'vercel-ai-sdk',
  ],
  cliPackage: {
    name: '@moldea.ai/cli',
    supportedNodeRange: '^22.11.0 || ^24.11.0',
    version: '3.3.6',
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
            qualificationEvidence: {
              url: 'https://skill.moldea.ai/qualification/custom/custom/',
            },
            supportLevel: 'supported',
          },
        ],
      },
      eve: {
        compatibleCoreRange: '^2.0.0',
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-eve',
          versionRange: '^1.0.0',
        },
        implementationStatus: 'available',
        lastVerifiedAt: '2026-08-19',
        runtimeGuidance: {
          expectation: 'optional',
          notes:
            'Project-local guidance is needed only for unsupported dynamic capabilities, extensions, remote agents, non-canonical or composed instructions, positive single-file subagent analysis, Markdown skill registration, framework-tool overrides, or other repository-specific Eve patterns outside the verified static filesystem target.',
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
                relationship: 'full',
                symbol: 'full',
              },
              'runtime-agent': {
                relationship: 'full',
                symbol: 'partial',
              },
              'skill-implementation': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'skill-registration': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'tool-implementation': {
                relationship: 'full',
                symbol: 'partial',
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
              'skill-registration',
              'tool-registration',
            ],
            id: 'typescript-filesystem-agent-0-39',
            kind: 'package',
            knownLimitations: [
              'Agent output, tool input, and tool output schema contents are not validated; the target establishes only direct binding relationships.',
              'Complete positive instruction evidence requires one exclusive exact-lowercase modern Markdown or exact-shape TypeScript system source. Eve directory composition, case-varied Markdown, unsupported module extensions, deprecated system.* fallback, the deprecated markdown definition branch, user-role entries, and dynamic instruction sources remain outside positive target evidence.',
              'Dynamic capabilities, remote agents, extensions, connections, channels, schedules, hooks, sandboxes, approvals, auth, state, sessions, compaction, task orchestration, and runtime-variable providers are not interpreted.',
              'Eve 0.39.x requires Node.js 24 or newer for the inspected application runtime. The adapter records but does not validate that application prerequisite and may itself run on another adapter-supported Node.js line.',
              'Extension declarations and contributions are not interpreted. Observable extension mount names participate only in conservative namespace-prefix preflight so root contributions cannot receive false registration evidence under a prefix Eve reserves for a mounted extension.',
              'Flat and packaged Markdown skill paths may establish implementation-path relationships, but the target emits no Markdown skill-registration evidence because it does not reproduce Eve frontmatter acceptance and collision resolution.',
              'Only direct TypeScript default exports, exact Eve helper imports, and limited relative named-import resolution are supported; path aliases, package exports, directory indexes, CommonJS, re-exports, wrappers, and arbitrary compiler resolution remain unresolved.',
              'Positive agent-definition evidence requires the closed defineAgent object to use only model, optional description, and optional outputSchema, with a supported static model string. Every other verified Eve agent option remains present-unsupported until a future target validates its nested runtime shape; dynamic models and sibling overrides therefore cannot produce optimistic evidence.',
              'Recursive static tools are supported. Static prepared-name effects from supported authored tools, framework defaults, and unresolved same-name override candidates participate in registration preflight; dynamic, extension, connection, provider, disable-sentinel, and Workflow execution semantics otherwise remain outside the target.',
              'The adapter analyzes only a root or directory-backed local subagent with an exact bound static agent.ts; a configuration-free Eve root or single-file local subagent produces no positive target-specific definition or handoff evidence.',
              'The adapter parses only .ts authored modules. It inspects .cts, .mts, .cjs, .mjs, .ts, and .js entry names only to prevent false positive evidence when an Eve filesystem slot or local-subagent identity is collided.',
              'Tool and skill descriptions are required to be statically provable strings for positive registration evidence but are not compared byte for byte with manifest capability descriptions; semantic alignment remains with the skill, evaluate, and PR Assurance.',
              'Tool approval and toModelOutput behavior is not interpreted beyond the static value shape required to avoid false registration claims.',
              'TypeScript skill metadata and files are supported only as closed static string-valued records; Eve-valid Uint8Array skill files and dynamic package content remain outside positive registration evidence.',
            ],
            language: 'typescript',
            lastVerifiedAt: '2026-08-19',
            packages: [
              {
                ecosystem: 'npm',
                name: 'eve',
                role: 'primary',
                versionRange: '>=0.39.1 <0.40.0',
              },
            ],
            patterns: [
              {
                description:
                  'An uncollided bound package-root agent.ts directly default-exports one defineAgent configuration using the positive key subset and a supported static model string.',
                id: 'flat-root-agent',
                kind: 'agent',
                support: 'full',
              },
              {
                description:
                  'An uncollided bound package-relative agent/agent.ts directly default-exports one defineAgent configuration using the positive key subset and a supported static model string.',
                id: 'nested-root-agent',
                kind: 'agent',
                support: 'full',
              },
              {
                description:
                  'Case-varied instructions.md and system.md candidates participate in Eve precedence and collision analysis but do not produce positive complete-instruction evidence.',
                id: 'case-varied-markdown-instruction',
                kind: 'instruction-loader',
                support: 'partial',
              },
              {
                description:
                  'Root-plus-directory, directory-only, multiple-entry, user-role, or dynamic instruction composition is outside the complete initial instruction target.',
                id: 'directory-instruction-composition',
                kind: 'instruction-loader',
                support: 'ambiguous',
              },
              {
                description:
                  'One uncollided exact-lowercase root instructions.md file is the exclusive modern Eve system-instruction slot and is identified by the declared instruction relationship.',
                id: 'exact-lowercase-markdown-instruction',
                kind: 'instruction-loader',
                support: 'full',
              },
              {
                description:
                  'One uncollided root instructions.ts directly default-exports exact-shape defineInstructions whose system content comes from the declared loader call.',
                id: 'exclusive-typescript-instruction-loader',
                kind: 'instruction-loader',
                support: 'full',
              },
              {
                description:
                  'Deprecated system.* fallback is recognized to suppress false absence conclusions but does not produce positive canonical instruction evidence.',
                id: 'legacy-system-instruction',
                kind: 'instruction-loader',
                support: 'partial',
              },
              {
                description:
                  'A unique direct subagents/<name>/agent.ts package registers one immediate local subagent only when both parent and target use the positive static agent-definition subset, the target has a statically proved non-empty string description, and the mapping and runtime tool namespace are unambiguous; an omitted or exact empty description produces no handoff evidence.',
                id: 'directory-local-subagent',
                kind: 'routing',
                support: 'full',
              },
              {
                description:
                  'A supported non-empty static local-subagent description is compared with the canonical handoff description when present and the canonical agent-description fallback otherwise; an omitted or exact empty value is classified as missing and suppresses handoff evidence.',
                id: 'effective-routing-description',
                kind: 'routing',
                support: 'full',
              },
              {
                description:
                  'Static local subagents produce handoff evidence only when their names are unique among the supported static candidates and do not collide with mechanically established prepared authored, active framework, or reserved load_skill tool names; unresolved same-name static candidates suppress the claim.',
                id: 'local-subagent-tool-namespace',
                kind: 'routing',
                support: 'full',
              },
              {
                description:
                  'Remote Eve subagents, remote authentication, URLs, and cross-repository target identity are outside the initial target.',
                id: 'remote-agents',
                kind: 'routing',
                support: 'unsupported',
              },
              {
                description:
                  'Single-file subagent candidates participate in name and namespace preflight but do not produce positive agent-definition or handoff-registration evidence in the initial target.',
                id: 'single-file-local-subagent',
                kind: 'routing',
                support: 'partial',
              },
              {
                description:
                  'Dynamic or non-string model definitions and runtime-resolved agents, instructions, tools, and skills cannot be mapped to one static effective surface by the initial target.',
                id: 'dynamic-capabilities',
                kind: 'runtime',
                support: 'ambiguous',
              },
              {
                description:
                  'Extension-mounted agents, tools, skills, connections, hooks, and namespaced overrides are outside positive target interpretation.',
                id: 'extension-contributions',
                kind: 'runtime',
                support: 'unsupported',
              },
              {
                description:
                  'Competing Eve-authored agent, instruction, tool, skill, or local-subagent sources and root contributions using an observably claimed mounted-extension namespace prefix prevent the initial target from selecting one effective source unless the focused target defines a deterministic collision diagnostic.',
                id: 'filesystem-slot-collisions',
                kind: 'runtime',
                support: 'ambiguous',
              },
              {
                description:
                  'A direct skills/<name>.md file may establish an implementation-path relationship, but Markdown acceptance and Eve registration are not claimed by the initial target.',
                id: 'flat-markdown-skill',
                kind: 'skill',
                support: 'partial',
              },
              {
                description:
                  'A direct skills/<name>/SKILL.md file may establish an implementation-path relationship, but frontmatter acceptance, sibling resources, and Eve registration are not claimed by the initial target.',
                id: 'packaged-skill',
                kind: 'skill',
                support: 'partial',
              },
              {
                description:
                  'An uncollided direct skills/<name>.ts module default-exports one exact closed static-string defineSkill package and may establish registration.',
                id: 'typescript-skill',
                kind: 'skill',
                support: 'full',
              },
              {
                description:
                  'Connection-provided, provider-managed, framework opt-in, disabled, and Workflow tools are not exposed as manifest capabilities. The target models the prepared static framework namespace needed for registration evidence but makes no turn-time dynamic-tool availability claim.',
                id: 'connections-and-framework-tools',
                kind: 'tool',
                support: 'partial',
              },
              {
                description:
                  'Eve tool runtime names are derived by removing the authored extension and replacing relative path separators beneath tools/ with hyphens.',
                id: 'flattened-tool-runtime-name',
                kind: 'tool',
                support: 'full',
              },
              {
                description:
                  'An uncollided direct or nested tools/**/*.ts module with valid path segments and one unique non-reserved flattened name default-exports one registration-eligible defineTool configuration with supported implementation and schema relationships.',
                id: 'recursive-filesystem-tool',
                kind: 'tool',
                support: 'full',
              },
              {
                description:
                  'Distinct authored tool paths that flatten to one runtime name are diagnosed and do not produce effective registration evidence.',
                id: 'tool-runtime-name-collision',
                kind: 'tool',
                support: 'full',
              },
            ],
            providerLimits: [
              {
                description:
                  'Every authored filesystem segment beneath tools/, including the module basename, must contain 1 to 64 ASCII letters, digits, underscores, or hyphens and start with an ASCII letter before Eve flattens nested paths.',
                id: 'filesystem-tool-path-segment-pattern',
                kind: 'pattern',
                reference: 'eve@0.39.1 TOOL_SLUG_PATTERN',
                subject: 'tool-name',
                value: '^[A-Za-z][A-Za-z0-9_-]{0,63}$',
              },
              {
                description:
                  'Eve reserves exact Workflow for its runtime workflow tool and rejects an authored tool with that flattened name.',
                id: 'filesystem-tool-reserved-name',
                kind: 'other',
                reference: 'eve@0.39.1 WORKFLOW_TOOL_NAME',
                subject: 'tool-name',
                value: 'Workflow',
              },
            ],
            supportLevel: 'experimental',
          },
        ],
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
        compatibleCoreRange: '^2.0.0',
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-langchain',
          versionRange: '^1.0.0',
        },
        implementationStatus: 'available',
        lastVerifiedAt: '2026-08-20',
        runtimeGuidance: {
          expectation: 'optional',
          notes:
            'Project-local guidance is needed only for repository-specific wrappers, middleware-driven relationships, supervisor composition around a supported LangChain boundary, headless tools, dynamic tool collections, or other unsupported indirect LangChain integration patterns.',
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
            id: 'typescript-create-agent-1-5',
            kind: 'package',
            knownLimitations: [
              'Developer-authored and statically resolved multi-format arrays are not mapped to the single canonical agent output-schema binding; a single-schema toolStrategy call remains supported despite its array-shaped helper return.',
              'Direct LangGraph applications remain outside this adapter target.',
              'Lockfiles and installed package versions are not inspected.',
              'Non-empty or unresolved middleware suppresses prompt, tool-registration, and output-schema relationship conclusions.',
              'Only TypeScript ESM source and documented direct relative imports are interpreted.',
              'Only directly exported package-root createAgent definitions are recognized.',
              'The target does not infer agent input schemas from stateSchema or contextSchema.',
              'The target does not infer supervisors, routing targets, handoffs, or subagent control transfer.',
              'The target does not interpret headless tools, provider tools, server tools, toolkits, MCP tools, or tool output schemas.',
            ],
            language: 'typescript',
            lastVerifiedAt: '2026-08-20',
            packages: [
              {
                ecosystem: 'npm',
                name: '@langchain/core',
                role: 'companion',
                versionRange: '>=1.2.8 <1.3.0',
              },
              {
                ecosystem: 'npm',
                name: 'langchain',
                role: 'primary',
                versionRange: '>=1.5.9 <1.6.0',
              },
            ],
            patterns: [
              {
                description:
                  'A directly exported TypeScript const initialized through the package-root createAgent helper with one closed object-literal configuration is recognized as the agent definition.',
                id: 'direct-create-agent',
                kind: 'agent',
                support: 'full',
              },
              {
                description:
                  'Direct StateGraph, Functional API, graph, and compiled-graph applications belong to the separate LangGraph adapter.',
                id: 'direct-langgraph-graphs',
                kind: 'agent',
                support: 'unsupported',
              },
              {
                description:
                  'Legacy agent executors and deprecated agent helper surfaces are outside the initial target.',
                id: 'legacy-langchain-agents',
                kind: 'agent',
                support: 'unsupported',
              },
              {
                description:
                  'Non-empty or unresolved middleware may alter prompts, tools, and structured runtime behavior and is not interpreted by the initial target.',
                id: 'middleware-relationship-effects',
                kind: 'agent',
                support: 'ambiguous',
              },
              {
                description:
                  'Direct loader calls and direct SystemMessage construction are supported when middleware is statically inactive.',
                id: 'direct-system-prompt-loader',
                kind: 'instruction-loader',
                support: 'partial',
              },
              {
                description:
                  'Agent description fields do not establish source-to-target routing or handoff relationships without a verified supervisor registration target.',
                id: 'supervisor-routing',
                kind: 'routing',
                support: 'unsupported',
              },
              {
                description:
                  'A supported createAgent definition remains LangChain even though LangChain compiles the agent on top of LangGraph.',
                id: 'langchain-primary-boundary',
                kind: 'runtime',
                support: 'full',
              },
              {
                description:
                  'One directly bound responseFormat schema establishes the agent output-schema relationship when middleware is statically inactive.',
                id: 'direct-response-format-schema',
                kind: 'schema',
                support: 'partial',
              },
              {
                description:
                  'Developer-authored or statically bound multiple response schemas or strategies cannot be mapped uniquely to the single Repository Format agent output-schema binding.',
                id: 'response-format-arrays',
                kind: 'schema',
                support: 'ambiguous',
              },
              {
                description:
                  'stateSchema and contextSchema are not collapsed into the Repository Format agent input-schema relationship.',
                id: 'state-and-context-input-schema',
                kind: 'schema',
                support: 'unsupported',
              },
              {
                description:
                  'Direct toolStrategy and providerStrategy wrappers around one bound schema are supported; the helper-produced array shape of a single-schema toolStrategy call is not treated as an authored multi-format collection.',
                id: 'structured-output-strategies',
                kind: 'schema',
                support: 'partial',
              },
              {
                description:
                  'Closed inline and immutable module-local tool arrays establish agent registration when middleware is statically inactive.',
                id: 'closed-tool-collections',
                kind: 'tool',
                support: 'partial',
              },
              {
                description:
                  'One-argument headless tools do not establish a repository-local server implementation relationship in the initial target.',
                id: 'headless-client-tools',
                kind: 'tool',
                support: 'unsupported',
              },
              {
                description:
                  'Direct normal two-argument tool helper declarations support implementation, runtime-name, and input-schema relationships.',
                id: 'normal-function-tools',
                kind: 'tool',
                support: 'partial',
              },
            ],
            supportLevel: 'experimental',
          },
        ],
      },
      langgraph: {
        compatibleCoreRange: '^2.0.0',
        implementation: {
          distribution: 'public',
          kind: 'package',
          package: '@moldea.ai/adapter-langgraph',
          versionRange: '^1.0.0',
        },
        implementationStatus: 'available',
        lastVerifiedAt: '2026-08-21',
        runtimeGuidance: {
          expectation: 'recommended',
          notes:
            'Project-local guidance is recommended for prompt ownership, model and tool boundaries, node responsibilities, dynamic routing, state semantics, subgraphs, persistence, interrupts, human control, supervisor composition, and other repository-specific LangGraph behavior not represented by the initial static targets.',
        },
        supportedRepositoryFormatVersions: [1],
        targets: [
          {
            bindingSupport: {
              'runtime-agent': {
                relationship: 'partial',
                symbol: 'partial',
              },
            },
            evidenceKinds: ['agent-definition', 'language', 'runtime-package', 'runtime-pattern'],
            id: 'typescript-functional-api-1-4',
            kind: 'package',
            knownLimitations: [
              'Entrypoint and task declarations require exactly two explicit type arguments when a list is present. Interrupt accepts one or two, getPreviousState accepts exactly one, and entrypoint.final accepts exactly two; another count produces no applicable target or optional evidence. Returned task proxies are non-generic, and final-state options must be a closed direct value/save object literal.',
              'Entrypoint and task names outside the evidence-safe runtime-identity grammar may still establish supported relationships but are omitted from runtimeName and name-detail fields.',
              'Entrypoint and task options are interpreted only when authored as direct closed object literals in the corresponding helper call; indirect options bindings and expressions are unsupported.',
              'Interrupt payloads, checkpoint behavior, replay determinism, idempotency, and human-approval semantics are not validated.',
              'Lockfiles and installed package versions are not inspected.',
              'Nested callback, nested helper, and transitive task-call graphs are not followed.',
              'Only TypeScript ESM source and documented direct relative imports are interpreted.',
              'Only directly exported package-root entrypoint definitions with inline or directly resolved non-generator workflow functions are recognized.',
              "Only non-optional direct calls to the exact returned task proxy, with no explicit type arguments, in the entrypoint function's own lexical body are attributed to the registered workflow; explicit type arguments or indirect callee forms at the task-use site produce no task-use evidence.",
              'Ordinary JavaScript control flow is not reconstructed as a graph topology.',
              'Task declarations resolve only through local const values or direct relative named imports to exported const declarations; generator and async-generator task functions are unsupported.',
              'Tasks do not become manifest tools, skills, or handoffs merely because they are exported or invoked.',
              'TypeScript input and output types do not establish executable schema relationships.',
            ],
            language: 'typescript',
            lastVerifiedAt: '2026-08-21',
            packages: [
              {
                ecosystem: 'npm',
                name: '@langchain/core',
                role: 'companion',
                versionRange: '>=1.2.9 <1.3.0',
              },
              {
                ecosystem: 'npm',
                name: '@langchain/langgraph',
                role: 'primary',
                versionRange: '>=1.4.12 <1.5.0',
              },
            ],
            patterns: [
              {
                description:
                  'A directly exported TypeScript const initialized through the package-root entrypoint helper with a supported static string name or direct closed options object literal and a supported workflow function is recognized as the runtime-agent definition; the name is copied into runtimeName only when it satisfies the evidence-safe runtime-identity grammar.',
                id: 'direct-functional-entrypoint',
                kind: 'agent',
                support: 'full',
              },
              {
                description:
                  'Entrypoint control flow and task calls do not establish source-to-target agent handoffs.',
                id: 'functional-routing',
                kind: 'routing',
                support: 'unsupported',
              },
              {
                description:
                  'Direct local or relative-import package-root task declarations with supported non-generator functions produce positive task-pattern evidence when the non-generic returned task proxy is called directly, non-optionally, without explicit type arguments, from the entrypoint lexical body.',
                id: 'direct-functional-tasks',
                kind: 'runtime',
                support: 'partial',
              },
              {
                description:
                  'Ordinary branches, loops, callbacks, helper calls, and dynamic task selection are not reconstructed as a static graph.',
                id: 'functional-control-flow',
                kind: 'runtime',
                support: 'ambiguous',
              },
              {
                description:
                  'An exact one-argument direct entrypoint.final call with a closed value/save object produces saved-state separation evidence without inferring input, output, or persistent-state schemas.',
                id: 'functional-final-state',
                kind: 'runtime',
                support: 'partial',
              },
              {
                description:
                  'An exact one-argument direct package-root interrupt call in the entrypoint body produces human-in-the-loop runtime-pattern evidence without interpreting approval semantics.',
                id: 'functional-interrupt',
                kind: 'runtime',
                support: 'partial',
              },
              {
                description:
                  'An exact zero-argument direct getPreviousState call produces persistence-related runtime-pattern evidence without inferring a schema.',
                id: 'functional-previous-state',
                kind: 'runtime',
                support: 'partial',
              },
              {
                description:
                  'TypeScript parameter and return types are not treated as executable Repository Format agent schema bindings.',
                id: 'functional-agent-schemas',
                kind: 'schema',
                support: 'unsupported',
              },
              {
                description:
                  'Functional API tasks do not establish model-visible manifest tool relationships in the initial target.',
                id: 'functional-task-capabilities',
                kind: 'tool',
                support: 'unsupported',
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
              'output-schema': {
                relationship: 'partial',
                symbol: 'partial',
              },
              'runtime-agent': {
                relationship: 'partial',
                symbol: 'partial',
              },
            },
            evidenceKinds: [
              'agent-definition',
              'language',
              'runtime-package',
              'runtime-pattern',
              'schema',
            ],
            id: 'typescript-state-graph-1-4',
            kind: 'package',
            knownLimitations: [
              'Command, Send, router-body destinations, and other dynamic routing remain unresolved.',
              'Compiled-graph description is not validated without a supported supervisor registration.',
              'Edge-pattern evidence classifies the version-matched START and END sentinel values before applying role-specific source and target rules; waiting-edge source arrays must be non-empty, and role-invalid sentinel positions or the rejected direct START-to-END pair produce no edge evidence or diagnostic and cannot preserve the graph target when statically established.',
              'Every recognized builder call requires a version-matched public runtime arity and explicit type-argument count. StateGraph construction admits one through ten explicit type arguments; positional addNode admits one through three; object-map addNode and addSequence admit exactly two; tuple-array or opaque-collection addNode and addSequence admit one through three; compile admits exactly one. Explicit type arguments on addEdge, addConditionalEdges, setNodeDefaults, setEntryPoint, or setFinishPoint produce no graph target. One-argument node collections, positional and tuple node-options values, conditional-edge path maps and object overloads, and recognized-but-uninterpreted methods also apply explicit target-preservation gates. A call without positive operation evidence preserves the graph target only through the closed object-or-schema, opaque-potentially-string, target-viable node-action, target-viable conditional-router, options, path-map, endpoint, and collection classifiers; statically non-object node options, non-collection path maps, role-invalid path-map destinations, reserved node identities, role-invalid sentinels, separator-bearing endpoints, target-excluded operation sources, and the rejected direct START-to-END pair produce no graph target.',
              'Graph nodes do not become manifest tools, skills, subagents, or handoffs merely from their graph position.',
              'Graph schema relationships require direct immutable non-object-literal values in unambiguous state, stateSchema, input, or output properties of one closed modern object initializer. Direct and directly bound raw object maps are deliberately unverified; the overloaded direct constructor family may preserve target selection but produces no schema evidence or negative wiring diagnostics.',
              'Lockfiles and installed package versions are not inspected.',
              'Member-sensitive directly bound runnable maps, node collections, tuple collections, and path maps must satisfy the closed aggregate-binding use grammar. A const declaration alone proves only binding identity; rooted writes, aliases, separate export forms, returns, yields, spreads, container insertion, unsupported argument or receiver uses, computed or optional access, and other escapes prevent target preservation through member inspection.',
              'Node metadata, node-option property values, node defaults, subgraphs, error handlers, reducers, checkpointers, stores, caches, stream transformers, path-map destination meaning, and runtime context are not semantically interpreted. Compile options, node options, and context or schema candidates preserve unresolved target roles only through their documented closed object- and schema-role classifiers.',
              'One-argument object-map and tuple-array addNode overloads and addSequence are not expanded into positive node or edge evidence. Target preservation requires a non-empty closed supported collection shape or an opaque value that could resolve to one; statically empty, malformed, or incompatible direct or directly bound collections cannot preserve the graph target.',
              'Only TypeScript ESM source and documented direct relative imports are interpreted.',
              'Only directly exported compiled StateGraph definitions with inline or single-owner builders are recognized.',
              'Positive addNode evidence excludes the reserved __start__ and __end__ node names, names containing | or :, and action sources outside the supported callable or opaque potentially runnable forms. Closed recursive runnable-map node-action candidates and exact inline opaque runnable candidates may preserve the graph target without positive operation evidence.',
              'Positive conditional-edge evidence excludes router sources outside the supported callable or opaque potentially runnable forms. Other router values preserve the graph target only through the closed target-viable conditional-router classifier.',
              'Positive edge and conditional-edge evidence excludes separator-bearing static node endpoints. Only the closed opaque-potentially-string classifier may preserve unresolved string-valued operation roles.',
              'Runtime names and source, target, or task name details are omitted unless they satisfy the deliberately narrow evidence-safe runtime-identity grammar; locator-shaped or otherwise unsafe names may still participate in relationship analysis without being copied into evidence.',
              'Runtime-pattern evidence is positive and does not represent a complete or validated graph topology.',
              'StateGraph target selection requires a target-viable version-matched one- or two-argument constructor. Opaque first arguments and indirect second arguments preserve the target only through the closed direct immutable object-family and opaque potentially object-or-schema classifiers; arbitrary unknown expressions do not. Statically impossible first arguments, direct or indirectly bound object literals outside the direct closed modern form, raw state maps, legacy channels objects, and unsupported modern object initializers produce no agent-definition evidence. Conditional constructor and schema candidates are role-viable only when recursive branch classification leaves at least one admitted result; an all-incompatible conditional cannot preserve the target.',
              'Structurally open or incompatible runnable-like object maps, callable objects outside the classifier, generators, mutable bindings, aliases, re-exports, computed or optional accesses, and other excluded runnable forms remain unverified rather than being treated as invalid LangGraph usage.',
            ],
            language: 'typescript',
            lastVerifiedAt: '2026-08-21',
            packages: [
              {
                ecosystem: 'npm',
                name: '@langchain/core',
                role: 'companion',
                versionRange: '>=1.2.9 <1.3.0',
              },
              {
                ecosystem: 'npm',
                name: '@langchain/langgraph',
                role: 'primary',
                versionRange: '>=1.4.12 <1.5.0',
              },
            ],
            patterns: [
              {
                description:
                  "A supported static compile name may establish the graph runtime identity used in agent-definition evidence only when it satisfies the common machine-string contract and the adapter's evidence-safe runtime-identity grammar.",
                id: 'compile-runtime-name',
                kind: 'agent',
                support: 'partial',
              },
              {
                description:
                  'A directly exported TypeScript const compiled from a supported package-root StateGraph builder with a target-viable version-matched constructor is recognized as the runtime-agent definition.',
                id: 'direct-compiled-state-graph',
                kind: 'agent',
                support: 'full',
              },
              {
                description:
                  'Prebuilt agents, ToolNode, Deep Agents, supervisor packages, and higher-level harnesses are outside the initial direct StateGraph target.',
                id: 'prebuilt-and-supervisor-agents',
                kind: 'agent',
                support: 'unsupported',
              },
              {
                description:
                  'Compiled-graph description is not validated against the effective routing description without a supported supervisor registration target.',
                id: 'compile-description-routing',
                kind: 'routing',
                support: 'unsupported',
              },
              {
                description:
                  'Direct static-source addConditionalEdges calls with supported callable or opaque potentially runnable router sources and an absent, explicitly omitted, or target-viable path-map collection produce control-flow evidence without inferring path-map destinations, router destinations, or agent handoffs.',
                id: 'conditional-edge-registration',
                kind: 'routing',
                support: 'partial',
              },
              {
                description:
                  'Command, Send, parent-graph navigation, and runtime-generated destinations cannot be reconstructed as a complete static topology.',
                id: 'dynamic-command-and-send-routing',
                kind: 'routing',
                support: 'ambiguous',
              },
              {
                description:
                  'Direct addEdge calls with role-valid START, END, admissible static node-name, or non-empty waiting-edge positions produce positive edge-pattern evidence, except for the version-matched rejected direct START-to-END pair.',
                id: 'direct-edge-registration',
                kind: 'runtime',
                support: 'partial',
              },
              {
                description:
                  'Direct named addNode calls produce positive node-pattern evidence only for static names outside the runtime-rejected sentinel and reserved-separator set, supported repository-local, inline callable, or opaque potentially runnable action sources, and an absent, explicitly omitted, or target-viable object-family options value.',
                id: 'direct-node-registration',
                kind: 'runtime',
                support: 'partial',
              },
              {
                description:
                  'One inline fluent StateGraph chain ending in compile is supported when every intermediate method belongs to the documented target boundary.',
                id: 'inline-state-graph-builder',
                kind: 'runtime',
                support: 'full',
              },
              {
                description:
                  'One module-local const builder with deterministic top-level ownership and one authoritative compile call is supported.',
                id: 'single-owner-state-graph-builder',
                kind: 'runtime',
                support: 'partial',
              },
              {
                description:
                  'Direct immutable non-object-literal schema value bindings in one closed modern object initializer are supported, including state fallback when distinct input or output schemas are absent.',
                id: 'graph-input-output-schemas',
                kind: 'schema',
                support: 'partial',
              },
              {
                description:
                  'Graph nodes and node-local model or tool calls do not establish manifest tool relationships in the initial target.',
                id: 'graph-node-capabilities',
                kind: 'tool',
                support: 'unsupported',
              },
            ],
            supportLevel: 'experimental',
          },
        ],
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
      name: '@moldea.ai/adapter-eve',
      version: '1.0.0',
    },
    {
      name: '@moldea.ai/adapter-google-genai',
      version: '1.0.3',
    },
    {
      name: '@moldea.ai/adapter-langchain',
      version: '1.0.0',
    },
    {
      name: '@moldea.ai/adapter-langgraph',
      version: '1.0.0',
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
