> **Generated file. Do not edit directly. Canonical source: `/compatibility/runtimes.yaml`.**

Matrix format version: `1`

The matrix publishes only the verified targets and support boundaries shown below.

| Adapter ID          | Owning package                         | Implementation | Distribution | Implementation range | Status      | Runtime guidance | Verified targets |
| ------------------- | -------------------------------------- | -------------- | ------------ | -------------------- | ----------- | ---------------- | ---------------: |
| `anthropic`         | `@moldea.ai/adapter-anthropic`         | `package`      | `public`     | `^2.0.0`             | `available` | `optional`       |              `1` |
| `claude-agent-sdk`  | `@moldea.ai/adapter-claude-agent-sdk`  | `package`      | `public`     | `^1.0.0`             | `available` | `optional`       |              `1` |
| `cloudflare-agents` | `@moldea.ai/adapter-cloudflare-agents` | `package`      | `public`     | `^1.0.0`             | `available` | `recommended`    |              `2` |
| `custom`            | `@moldea.ai/core`                      | `built-in`     | `public`     | Not available        | `available` | `required`       |              `1` |
| `eve`               | `@moldea.ai/adapter-eve`               | `package`      | `public`     | `^1.0.0`             | `available` | `optional`       |              `1` |
| `google-genai`      | `@moldea.ai/adapter-google-genai`      | `package`      | `public`     | `^1.0.3`             | `available` | `optional`       |              `1` |
| `langchain`         | `@moldea.ai/adapter-langchain`         | `package`      | `public`     | `^1.0.0`             | `available` | `optional`       |              `1` |
| `langgraph`         | `@moldea.ai/adapter-langgraph`         | `package`      | `public`     | Not available        | `planned`   | Not available    |              `0` |
| `openai`            | `@moldea.ai/adapter-openai`            | `package`      | `public`     | `^2.0.0`             | `available` | `recommended`    |              `1` |
| `openai-agents-sdk` | `@moldea.ai/adapter-openai-agents-sdk` | `package`      | `public`     | `^1.0.0`             | `available` | `optional`       |              `1` |
| `vercel-ai-sdk`     | `@moldea.ai/adapter-vercel-ai-sdk`     | `package`      | `public`     | `^1.0.0`             | `available` | `optional`       |              `2` |

## Adapter: `anthropic`

- Owning package: `@moldea.ai/adapter-anthropic`
- Implementation range: `^2.0.0`
- Supported repository-format versions: `1`
- Compatible Core range: `^2.0.0`
- Runtime guidance: `optional`
- Last verified: `2026-08-17`

Runtime guidance notes: Project-local guidance is needed only for repository-specific wrappers or unsupported indirect integration patterns.

### Target: `typescript-messages-api-0-117`

- Kind: `package`
- Support level: `experimental`
- Language: `typescript`
- Evidence kinds: `instruction-loader`, `language`, `runtime-package`, `runtime-pattern`, `schema`, `tool-registration`
- Last verified: `2026-08-17`

| Ecosystem | Package             | Role      | Verified range       |
| --------- | ------------------- | --------- | -------------------- |
| `npm`     | `@anthropic-ai/sdk` | `primary` | `>=0.117.1 <0.118.0` |

#### Binding support

| Subject              | Relationship | Symbol |
| -------------------- | ------------ | ------ |
| `runtime-agent`      | `full`       | `full` |
| `instruction-loader` | `full`       | `full` |
| `tool-registration`  | `full`       | `full` |
| `tool-input-schema`  | `full`       | `full` |

#### Patterns

| Kind                 | Pattern                        | Support       | Description                                                                                                        | Notes         |
| -------------------- | ------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------ | ------------- |
| `instruction-loader` | `direct-system-loader`         | `full`        | A directly bound instruction loader supplies the top-level system request property.                                | Not available |
| `runtime`            | `direct-messages-create`       | `full`        | Direct Anthropic Messages API invocation through a module-local client in a directly exported TypeScript function. | Not available |
| `runtime`            | `dynamic-request-construction` | `ambiguous`   | Dynamically assembled Messages requests cannot be mapped reliably without semantic analysis.                       | Not available |
| `schema`             | `direct-tool-input-schema`     | `full`        | A bound tool input schema is referenced directly through the client tool input_schema property.                    | Not available |
| `tool`               | `closed-client-tool-array`     | `full`        | Closed inline or immutable module-local arrays contain statically declared Anthropic client tools.                 | Not available |
| `tool`               | `provider-server-tools`        | `unsupported` | Anthropic provider or server tools are outside the initial client-tool target.                                     | Not available |

#### Provider limits

| Subject     | Limit              | Kind      | Value                   | Description                                                                                         | Reference                                          |
| ----------- | ------------------ | --------- | ----------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `tool-name` | `client-tool-name` | `pattern` | `^[A-Za-z0-9_-]{1,64}$` | Anthropic client-tool names match the complete ASCII letter, digit, underscore, and hyphen pattern. | Anthropic Messages API reference for client tools. |

#### Known limitations

- Arbitrary compiler resolution, path aliases, directory indexes, package exports, and re-export graphs are not resolved.
- Beta resources, client.messages.stream, parse helpers, and tool-runner abstractions are not interpreted; an exact stream property on direct messages.create requests is tolerated, but its semantics are not validated.
- Client-tool input-schema contents, including the provider-required top-level type object, are not validated; the target establishes only direct schema wiring.
- Source forms outside the verified TypeScript ESM target, dynamic factories, mutable requests, provider tools, output schemas, runtime variables, and handoffs are outside the initial target.

## Adapter: `claude-agent-sdk`

- Owning package: `@moldea.ai/adapter-claude-agent-sdk`
- Implementation range: `^1.0.0`
- Supported repository-format versions: `1`
- Compatible Core range: `^2.0.0`
- Runtime guidance: `optional`
- Last verified: `2026-08-19`

Runtime guidance notes: Project-local guidance is needed only for repository-specific wrappers, main-thread agent selection, tool aliases, string-array prompts, filesystem-defined agents, dynamic agent construction, observer behavior, external MCP configuration, or other unsupported indirect integration patterns.

### Target: `typescript-query-subagents-0-3`

- Kind: `package`
- Support level: `experimental`
- Language: `typescript`
- Evidence kinds: `agent-definition`, `handoff-registration`, `instruction-loader`, `language`, `runtime-package`, `runtime-pattern`, `schema`, `tool-registration`
- Last verified: `2026-08-19`

| Ecosystem | Package                          | Role      | Verified range     |
| --------- | -------------------------------- | --------- | ------------------ |
| `npm`     | `@anthropic-ai/claude-agent-sdk` | `primary` | `>=0.3.234 <0.4.0` |

#### Binding support

| Subject               | Relationship | Symbol    |
| --------------------- | ------------ | --------- |
| `runtime-agent`       | `full`       | `full`    |
| `output-schema`       | `partial`    | `partial` |
| `instruction-loader`  | `full`       | `full`    |
| `tool-implementation` | `full`       | `full`    |
| `tool-registration`   | `full`       | `full`    |
| `tool-input-schema`   | `full`       | `full`    |

#### Patterns

| Kind                 | Pattern                                 | Support       | Description                                                                                                                                                                                                                                                                                                                                                    | Notes         |
| -------------------- | --------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `agent`              | `dynamic-agent-definition`              | `ambiguous`   | Runtime-generated, factory-produced, conditional, spread-based, or mutated programmatic agent definitions remain unestablished.                                                                                                                                                                                                                                | Not available |
| `agent`              | `filesystem-subagents`                  | `unsupported` | Subagents defined through .claude/agents files are outside the initial repository-owned programmatic target.                                                                                                                                                                                                                                                   | Not available |
| `agent`              | `programmatic-agent-definition`         | `full`        | A directly exported immutable object-literal AgentDefinition supplies independently analyzable prompt, routing-description, and tool-restriction relationships.                                                                                                                                                                                                | Not available |
| `agent`              | `query-main-thread-agent-selection`     | `unsupported` | Query-level agent selection can apply another definition's prompt and tool restrictions to the main thread and keeps affected instruction, delegation, and tool relationships unresolved.                                                                                                                                                                      | Not available |
| `instruction-loader` | `experimental-critical-system-reminder` | `unsupported` | AgentDefinition criticalSystemReminder_EXPERIMENTAL is additional model-facing content and is not interpreted as canonical subagent instruction wiring.                                                                                                                                                                                                        | Not available |
| `instruction-loader` | `query-custom-system-prompt`            | `full`        | A query-wrapper agent wires the declared instruction loader through a direct custom systemPrompt call.                                                                                                                                                                                                                                                         | Not available |
| `instruction-loader` | `query-preset-append`                   | `full`        | A query-wrapper agent uses the claude_code system-prompt preset and appends the declared canonical instruction loader directly.                                                                                                                                                                                                                                | Not available |
| `instruction-loader` | `query-system-prompt-block-array`       | `unsupported` | String-array system prompts and dynamic prompt-cache boundaries do not establish canonical query-wrapper instruction-loader wiring in the initial target.                                                                                                                                                                                                      | Not available |
| `instruction-loader` | `sdk-mcp-server-instructions`           | `unsupported` | createSdkMcpServer instructions may coexist with supported tool relationships but are not canonical agent instruction-loader evidence or semantically validated content.                                                                                                                                                                                       | Not available |
| `routing`            | `built-in-subagents`                    | `unsupported` | The built-in general-purpose subagent and runtime Agent tool decisions are not mapped to registered moldea agents.                                                                                                                                                                                                                                             | Not available |
| `routing`            | `closed-programmatic-agents-map`        | `full`        | A closed query agents map exposes supported programmatic subagent definitions under deterministic runtime names only when supported query-local rules classify query-configured Agent availability as available.                                                                                                                                               | Not available |
| `routing`            | `dynamic-agent-delegation-availability` | `ambiguous`   | Dynamic query tools or disallowedTools values, legacy Task aliases, scoped Agent or Task permission expressions, and unsupported non-* glob syntax do not establish whether a configured agents map is an active delegation surface.                                                                                                                           | Not available |
| `routing`            | `dynamic-routing-description`           | `ambiguous`   | Runtime-generated, transformed, or indirectly loaded AgentDefinition descriptions remain unestablished.                                                                                                                                                                                                                                                        | Not available |
| `routing`            | `effective-routing-description`         | `full`        | For an active programmatic subagent registration, AgentDefinition.description uses the target canonical handoff description when present and the canonical agent-description fallback otherwise.                                                                                                                                                               | Not available |
| `routing`            | `observer-agent-fields`                 | `unsupported` | AgentDefinition observer and observerMessage semantics do not create ordinary moldea agent, handoff, routing-description, or instruction-loader relationships in the initial target.                                                                                                                                                                           | Not available |
| `routing`            | `query-agent-delegation-availability`   | `full`        | Supported closed query tools and static bare disallowedTools patterns, including complete-name * globs, classify query-configured Agent availability; dynamic, scoped, legacy-alias, and unsupported non-* forms remain ambiguous.                                                                                                                             | Not available |
| `routing`            | `query-built-in-tools-preset`           | `unsupported` | The claude_code tools preset is not expanded to establish built-in Agent availability in the initial target.                                                                                                                                                                                                                                                   | Not available |
| `runtime`            | `direct-query-wrapper`                  | `full`        | A directly exported TypeScript function contains one or more direct query calls in its own lexical body.                                                                                                                                                                                                                                                       | Not available |
| `runtime`            | `dynamic-query-options`                 | `ambiguous`   | Query inputs or options assembled through variables, factories, spreads, mutation, or arbitrary wrappers cannot be mapped reliably without semantic analysis.                                                                                                                                                                                                  | Not available |
| `runtime`            | `skills-plugins-and-hooks`              | `unsupported` | Skills, plugins, hooks, settings, CLAUDE.md loading, and other filesystem features are outside the initial deterministic relationship target.                                                                                                                                                                                                                  | Not available |
| `schema`             | `query-json-schema-output`              | `full`        | A query-wrapper agent wires a bound output schema through outputFormat with the json_schema type.                                                                                                                                                                                                                                                              | Not available |
| `tool`               | `dynamic-tool-availability`             | `ambiguous`   | Dynamic or unsupported query or AgentDefinition tool restrictions that could match an SDK MCP tool establish neither positive registration evidence nor a closed negative registration conclusion.                                                                                                                                                             | Not available |
| `tool`               | `explicit-subagent-tools`               | `full`        | An actively delegable programmatic subagent has a closed AgentDefinition tools array containing the exact fully qualified SDK MCP tool name, and supported static deny-pattern analysis leaves the exact tool available.                                                                                                                                       | Not available |
| `tool`               | `external-mcp-servers`                  | `unsupported` | Stdio, SSE, HTTP, remote, proxy, and other external MCP configurations do not establish repository-local manifest tool relationships in the initial target.                                                                                                                                                                                                    | Not available |
| `tool`               | `inherited-subagent-tools`              | `full`        | An actively delegable programmatic subagent with omitted tools inherits a query-available SDK MCP tool when supported subagent deny-pattern analysis also leaves the exact tool available.                                                                                                                                                                     | Not available |
| `tool`               | `per-agent-mcp-servers`                 | `unsupported` | AgentDefinition-level MCP server configuration is outside the initial query-level SDK MCP target.                                                                                                                                                                                                                                                              | Not available |
| `tool`               | `query-tool-aliases`                    | `unsupported` | Query-level toolAliases can redirect model-emitted tool names and keep affected delegation and SDK MCP tool relationships unresolved.                                                                                                                                                                                                                          | Not available |
| `tool`               | `sdk-mcp-server-key-normalization`      | `unsupported` | An empty query mcpServers key cannot establish a supported canonical runtime-name segment, while a key containing characters outside [A-Za-z0-9_-] requires SDK normalization; either form produces the stable unsupported-key diagnostic and establishes no runtime-name or tool-availability conclusion for that mount.                                      | Not available |
| `tool`               | `sdk-mcp-server-registration`           | `full`        | A closed SDK MCP server mounted under a canonical query mcpServers key matching ^[A-Za-z0-9_-]+$ exposes declared tools under fully qualified runtime names only when relationship-local query tool availability remains available after supported static deny-pattern analysis; optional server instructions remain outside canonical instruction validation. | Not available |
| `tool`               | `sdk-mcp-tool-declaration`              | `full`        | A directly exported SDK tool uses a static name, direct implementation binding, and direct input-schema binding.                                                                                                                                                                                                                                               | Not available |

#### Known limitations

- A configured agents map becomes active delegation evidence only when supported static query tools and bare tool-name deny-pattern analysis classify query-configured Agent availability as available; tools arrays that omit Agent, tools: [], and any supported deny pattern matching Agent make it unavailable.
- A supported query-level mcpServers key must match ^[A-Za-z0-9_-]+$ exactly. Empty or normalization-requiring keys produce CLAUDE_AGENT_SDK_MCP_SERVER_KEY_UNSUPPORTED and keep only the affected mount's runtime-name and tool-availability relationships unresolved; the adapter does not reproduce SDK normalization or infer normalized-key collisions.
- Agent output-schema support applies only to query-wrapper agents through outputFormat; programmatic AgentDefinitions have no initial output-schema relationship.
- AgentDefinition observer, observerMessage, and criticalSystemReminder_EXPERIMENTAL semantics are outside the target, although their presence does not erase independently proved prompt, description, tool, or active-registration relationships.
- Arbitrary compiler resolution, path aliases, directory indexes, package exports, CommonJS, JavaScript, re-export graphs, and generated source are not resolved.
- Dynamic availability, scoped Agent or Task permission expressions, unsupported non-* glob syntax, and legacy Task aliases remain unresolved. Static bare * globs are matched against the complete tool name. allowedTools controls preapproval rather than availability and neither creates nor restores the Agent tool.
- Establishing query-configured Agent or SDK MCP tool availability does not prove that filesystem-loaded settings, managed policy, hooks, later session state, allowedTools, canUseTool, permission mode, or user approval preserve or permit a particular invocation, and no evidence claims that Claude will actually invoke the subagent or tool.
- Programmatic subagents require directly exported immutable object-literal AgentDefinitions; dynamic factories and filesystem-defined agents remain outside the target.
- Query and subagent tool-registration evidence requires an available relationship-local state after supported exact-name, server-selector, and complete-name * glob deny analysis. Dynamic or unsupported restrictions that could match the tool remain unresolved and produce neither optimistic evidence nor a false negative diagnostic.
- Query wrappers require a directly exported function and direct query calls with object-literal input and options forms.
- Query-level agent selection, toolAliases, string-array system prompts, and built-in-tool preset expansion remain outside the initial target and keep only the relationships they can change unresolved.
- Routing-description validation supports only static inline, immutable module-local, and directly imported static strings in an active delegation context; loaders, file reads, transformations, and runtime-generated values remain unresolved.
- SDK MCP tool support is limited to repository-local tool and createSdkMcpServer definitions mounted through query-level mcpServers maps.
- The fully qualified manifest tool name is derived from the canonical query mcpServers key and tool name; the createSdkMcpServer name does not replace that key.
- Tool input and query output schema contents are not validated; the target establishes only direct schema wiring.
- Tool output schemas, agent input schemas, external MCP tools, resources, prompts, skills, plugins, hooks, sessions, permission approval, sandboxing, workflows, model selection, and provider behavior are not interpreted.
- createSdkMcpServer instructions are tolerated but are not canonical instruction-loader evidence or semantically validated model-facing content.

## Adapter: `cloudflare-agents`

- Owning package: `@moldea.ai/adapter-cloudflare-agents`
- Implementation range: `^1.0.0`
- Supported repository-format versions: `1`
- Compatible Core range: `^2.0.0`
- Runtime guidance: `recommended`
- Last verified: `2026-08-19`

Runtime guidance notes: Project-local guidance should document Cloudflare bindings, Durable Object wiring, and deployment-specific behavior outside the verified static source boundary.

### Target: `typescript-ai-chat-agent-0-10-ai-sdk-7`

- Kind: `package`
- Support level: `experimental`
- Language: `typescript`
- Evidence kinds: `agent-definition`, `handoff-registration`, `instruction-loader`, `language`, `runtime-package`, `runtime-pattern`, `schema`, `tool-registration`
- Last verified: `2026-08-19`

| Ecosystem | Package               | Role        | Verified range     |
| --------- | --------------------- | ----------- | ------------------ |
| `npm`     | `agents`              | `companion` | `>=0.21.0 <0.22.0` |
| `npm`     | `ai`                  | `companion` | `>=7.0.0 <8.0.0`   |
| `npm`     | `@cloudflare/ai-chat` | `primary`   | `>=0.10.2 <0.11.0` |

#### Binding support

| Subject               | Relationship | Symbol    |
| --------------------- | ------------ | --------- |
| `runtime-agent`       | `partial`    | `partial` |
| `output-schema`       | `partial`    | `partial` |
| `instruction-loader`  | `partial`    | `partial` |
| `tool-implementation` | `partial`    | `partial` |
| `tool-registration`   | `partial`    | `partial` |
| `tool-input-schema`   | `partial`    | `partial` |
| `tool-output-schema`  | `partial`    | `partial` |

#### Patterns

| Kind      | Pattern                                 | Support   | Description                                                                                                                                    | Notes         |
| --------- | --------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `agent`   | `directly-exported-ai-chat-agent-class` | `partial` | Directly exported TypeScript classes extending an exact named AIChatAgent import with the supported onChatMessage signature.                   | Not available |
| `runtime` | `direct-ai-sdk-generation`              | `partial` | Direct generateText or streamText calls in the onChatMessage method's own lexical body.                                                        | Not available |
| `tool`    | `ai-chat-structured-output-and-tools`   | `partial` | Output.object agent schemas, repository-local AI SDK function tools, and Cloudflare agentTool helpers in closed generation-request tools maps. | Not available |

#### Known limitations

- Dynamic, provider, MCP-generated, or inline tools without exact repository registration identities are outside the target.
- Nested or indirect generation, request variables, prepareStep instruction interpretation, and generation functions other than generateText and streamText are outside the target.
- Output variants other than Output.object and all agent input schemas are outside the target.

### Target: `typescript-think-0-16-ai-sdk-7`

- Kind: `package`
- Support level: `experimental`
- Language: `typescript`
- Evidence kinds: `agent-definition`, `handoff-registration`, `instruction-loader`, `language`, `runtime-package`, `schema`, `tool-registration`
- Last verified: `2026-08-19`

| Ecosystem | Package             | Role        | Verified range     |
| --------- | ------------------- | ----------- | ------------------ |
| `npm`     | `agents`            | `companion` | `>=0.21.0 <0.22.0` |
| `npm`     | `ai`                | `companion` | `>=7.0.0 <8.0.0`   |
| `npm`     | `@cloudflare/think` | `primary`   | `>=0.16.0 <0.17.0` |

#### Binding support

| Subject               | Relationship | Symbol    |
| --------------------- | ------------ | --------- |
| `runtime-agent`       | `partial`    | `partial` |
| `instruction-loader`  | `partial`    | `partial` |
| `tool-implementation` | `partial`    | `partial` |
| `tool-registration`   | `partial`    | `partial` |
| `tool-input-schema`   | `partial`    | `partial` |
| `tool-output-schema`  | `partial`    | `partial` |

#### Patterns

| Kind                 | Pattern                         | Support   | Description                                                                                                  | Notes         |
| -------------------- | ------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------ | ------------- |
| `agent`              | `directly-exported-think-class` | `partial` | Directly exported TypeScript classes extending an exact named Think import with closed class initialization. | Not available |
| `instruction-loader` | `think-instruction-methods`     | `partial` | Direct loader calls returned by getSystemPrompt or supported closed configureSession chaining.               | Not available |
| `tool`               | `closed-think-tools-map`        | `partial` | Repository-local AI SDK function tools and Cloudflare agentTool helpers active in a closed getTools map.     | Not available |

#### Known limitations

- Agent input and output schemas are not supported for Think.
- Bare Agent classes, factories, indirect subclasses, decorators, executable fields, static blocks, computed members, generators, and non-pass-through constructors are outside the target.
- Dynamic session builders, onCompaction interpretation, runtime mutation, channel-provided tool replacement, and open tools maps are outside the target.

## Adapter: `custom`

- Owning package: `@moldea.ai/core`
- Implementation range: Not available
- Supported repository-format versions: `1`
- Compatible Core range: `^2.0.0`
- Runtime guidance: `required`
- Last verified: `2026-08-15`

Runtime guidance notes: Project-local guidance defines the custom runtime integration.

### Target: `custom`

- Kind: `custom`
- Support level: `supported`
- Language: `any`
- Evidence kinds: Not available
- Last verified: `2026-08-15`

#### Patterns

| Kind      | Pattern                             | Support | Description                                                                                        | Notes         |
| --------- | ----------------------------------- | ------- | -------------------------------------------------------------------------------------------------- | ------------- |
| `runtime` | `explicit-repository-relationships` | `full`  | Universal Core validation of explicit repository relationships without runtime-specific inference. | Not available |

## Adapter: `eve`

- Owning package: `@moldea.ai/adapter-eve`
- Implementation range: `^1.0.0`
- Supported repository-format versions: `1`
- Compatible Core range: `^2.0.0`
- Runtime guidance: `optional`
- Last verified: `2026-08-19`

Runtime guidance notes: Project-local guidance is needed only for unsupported dynamic capabilities, extensions, remote agents, non-canonical or composed instructions, positive single-file subagent analysis, Markdown skill registration, framework-tool overrides, or other repository-specific Eve patterns outside the verified static filesystem target.

### Target: `typescript-filesystem-agent-0-39`

- Kind: `package`
- Support level: `experimental`
- Language: `typescript`
- Evidence kinds: `agent-definition`, `handoff-registration`, `instruction-loader`, `language`, `runtime-package`, `schema`, `skill-registration`, `tool-registration`
- Last verified: `2026-08-19`

| Ecosystem | Package | Role      | Verified range     |
| --------- | ------- | --------- | ------------------ |
| `npm`     | `eve`   | `primary` | `>=0.39.1 <0.40.0` |

#### Binding support

| Subject                | Relationship | Symbol    |
| ---------------------- | ------------ | --------- |
| `runtime-agent`        | `full`       | `partial` |
| `output-schema`        | `full`       | `full`    |
| `instruction-loader`   | `partial`    | `partial` |
| `tool-implementation`  | `full`       | `partial` |
| `tool-registration`    | `full`       | `partial` |
| `tool-input-schema`    | `full`       | `full`    |
| `tool-output-schema`   | `full`       | `full`    |
| `skill-implementation` | `partial`    | `partial` |
| `skill-registration`   | `partial`    | `partial` |

#### Patterns

| Kind                 | Pattern                                   | Support       | Description                                                                                                                                                                                                                                                                                                                                                                 | Notes         |
| -------------------- | ----------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `agent`              | `flat-root-agent`                         | `full`        | An uncollided bound package-root agent.ts directly default-exports one defineAgent configuration using the positive key subset and a supported static model string.                                                                                                                                                                                                         | Not available |
| `agent`              | `nested-root-agent`                       | `full`        | An uncollided bound package-relative agent/agent.ts directly default-exports one defineAgent configuration using the positive key subset and a supported static model string.                                                                                                                                                                                               | Not available |
| `instruction-loader` | `case-varied-markdown-instruction`        | `partial`     | Case-varied instructions.md and system.md candidates participate in Eve precedence and collision analysis but do not produce positive complete-instruction evidence.                                                                                                                                                                                                        | Not available |
| `instruction-loader` | `directory-instruction-composition`       | `ambiguous`   | Root-plus-directory, directory-only, multiple-entry, user-role, or dynamic instruction composition is outside the complete initial instruction target.                                                                                                                                                                                                                      | Not available |
| `instruction-loader` | `exact-lowercase-markdown-instruction`    | `full`        | One uncollided exact-lowercase root instructions.md file is the exclusive modern Eve system-instruction slot and is identified by the declared instruction relationship.                                                                                                                                                                                                    | Not available |
| `instruction-loader` | `exclusive-typescript-instruction-loader` | `full`        | One uncollided root instructions.ts directly default-exports exact-shape defineInstructions whose system content comes from the declared loader call.                                                                                                                                                                                                                       | Not available |
| `instruction-loader` | `legacy-system-instruction`               | `partial`     | Deprecated system.* fallback is recognized to suppress false absence conclusions but does not produce positive canonical instruction evidence.                                                                                                                                                                                                                              | Not available |
| `routing`            | `directory-local-subagent`                | `full`        | A unique direct subagents/<name>/agent.ts package registers one immediate local subagent only when both parent and target use the positive static agent-definition subset, the target has a statically proved non-empty string description, and the mapping and runtime tool namespace are unambiguous; an omitted or exact empty description produces no handoff evidence. | Not available |
| `routing`            | `effective-routing-description`           | `full`        | A supported non-empty static local-subagent description is compared with the canonical handoff description when present and the canonical agent-description fallback otherwise; an omitted or exact empty value is classified as missing and suppresses handoff evidence.                                                                                                   | Not available |
| `routing`            | `local-subagent-tool-namespace`           | `full`        | Static local subagents produce handoff evidence only when their names are unique among the supported static candidates and do not collide with mechanically established prepared authored, active framework, or reserved load_skill tool names; unresolved same-name static candidates suppress the claim.                                                                  | Not available |
| `routing`            | `remote-agents`                           | `unsupported` | Remote Eve subagents, remote authentication, URLs, and cross-repository target identity are outside the initial target.                                                                                                                                                                                                                                                     | Not available |
| `routing`            | `single-file-local-subagent`              | `partial`     | Single-file subagent candidates participate in name and namespace preflight but do not produce positive agent-definition or handoff-registration evidence in the initial target.                                                                                                                                                                                            | Not available |
| `runtime`            | `dynamic-capabilities`                    | `ambiguous`   | Dynamic or non-string model definitions and runtime-resolved agents, instructions, tools, and skills cannot be mapped to one static effective surface by the initial target.                                                                                                                                                                                                | Not available |
| `runtime`            | `extension-contributions`                 | `unsupported` | Extension-mounted agents, tools, skills, connections, hooks, and namespaced overrides are outside positive target interpretation.                                                                                                                                                                                                                                           | Not available |
| `runtime`            | `filesystem-slot-collisions`              | `ambiguous`   | Competing Eve-authored agent, instruction, tool, skill, or local-subagent sources and root contributions using an observably claimed mounted-extension namespace prefix prevent the initial target from selecting one effective source unless the focused target defines a deterministic collision diagnostic.                                                              | Not available |
| `skill`              | `flat-markdown-skill`                     | `partial`     | A direct skills/<name>.md file may establish an implementation-path relationship, but Markdown acceptance and Eve registration are not claimed by the initial target.                                                                                                                                                                                                       | Not available |
| `skill`              | `packaged-skill`                          | `partial`     | A direct skills/<name>/SKILL.md file may establish an implementation-path relationship, but frontmatter acceptance, sibling resources, and Eve registration are not claimed by the initial target.                                                                                                                                                                          | Not available |
| `skill`              | `typescript-skill`                        | `full`        | An uncollided direct skills/<name>.ts module default-exports one exact closed static-string defineSkill package and may establish registration.                                                                                                                                                                                                                             | Not available |
| `tool`               | `connections-and-framework-tools`         | `partial`     | Connection-provided, provider-managed, framework opt-in, disabled, and Workflow tools are not exposed as manifest capabilities. The target models the prepared static framework namespace needed for registration evidence but makes no turn-time dynamic-tool availability claim.                                                                                          | Not available |
| `tool`               | `flattened-tool-runtime-name`             | `full`        | Eve tool runtime names are derived by removing the authored extension and replacing relative path separators beneath tools/ with hyphens.                                                                                                                                                                                                                                   | Not available |
| `tool`               | `recursive-filesystem-tool`               | `full`        | An uncollided direct or nested tools/**/*.ts module with valid path segments and one unique non-reserved flattened name default-exports one registration-eligible defineTool configuration with supported implementation and schema relationships.                                                                                                                          | Not available |
| `tool`               | `tool-runtime-name-collision`             | `full`        | Distinct authored tool paths that flatten to one runtime name are diagnosed and do not produce effective registration evidence.                                                                                                                                                                                                                                             | Not available |

#### Provider limits

| Subject     | Limit                                  | Kind      | Value                           | Description                                                                                                                                                                                                           | Reference                     |
| ----------- | -------------------------------------- | --------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| `tool-name` | `filesystem-tool-path-segment-pattern` | `pattern` | `^[A-Za-z][A-Za-z0-9_-]{0,63}$` | Every authored filesystem segment beneath tools/, including the module basename, must contain 1 to 64 ASCII letters, digits, underscores, or hyphens and start with an ASCII letter before Eve flattens nested paths. | eve@0.39.1 TOOL_SLUG_PATTERN  |
| `tool-name` | `filesystem-tool-reserved-name`        | `other`   | `Workflow`                      | Eve reserves exact Workflow for its runtime workflow tool and rejects an authored tool with that flattened name.                                                                                                      | eve@0.39.1 WORKFLOW_TOOL_NAME |

#### Known limitations

- Agent output, tool input, and tool output schema contents are not validated; the target establishes only direct binding relationships.
- Complete positive instruction evidence requires one exclusive exact-lowercase modern Markdown or exact-shape TypeScript system source. Eve directory composition, case-varied Markdown, unsupported module extensions, deprecated system.* fallback, the deprecated markdown definition branch, user-role entries, and dynamic instruction sources remain outside positive target evidence.
- Dynamic capabilities, remote agents, extensions, connections, channels, schedules, hooks, sandboxes, approvals, auth, state, sessions, compaction, task orchestration, and runtime-variable providers are not interpreted.
- Eve 0.39.x requires Node.js 24 or newer for the inspected application runtime. The adapter records but does not validate that application prerequisite and may itself run on another adapter-supported Node.js line.
- Extension declarations and contributions are not interpreted. Observable extension mount names participate only in conservative namespace-prefix preflight so root contributions cannot receive false registration evidence under a prefix Eve reserves for a mounted extension.
- Flat and packaged Markdown skill paths may establish implementation-path relationships, but the target emits no Markdown skill-registration evidence because it does not reproduce Eve frontmatter acceptance and collision resolution.
- Only direct TypeScript default exports, exact Eve helper imports, and limited relative named-import resolution are supported; path aliases, package exports, directory indexes, CommonJS, re-exports, wrappers, and arbitrary compiler resolution remain unresolved.
- Positive agent-definition evidence requires the closed defineAgent object to use only model, optional description, and optional outputSchema, with a supported static model string. Every other verified Eve agent option remains present-unsupported until a future target validates its nested runtime shape; dynamic models and sibling overrides therefore cannot produce optimistic evidence.
- Recursive static tools are supported. Static prepared-name effects from supported authored tools, framework defaults, and unresolved same-name override candidates participate in registration preflight; dynamic, extension, connection, provider, disable-sentinel, and Workflow execution semantics otherwise remain outside the target.
- The adapter analyzes only a root or directory-backed local subagent with an exact bound static agent.ts; a configuration-free Eve root or single-file local subagent produces no positive target-specific definition or handoff evidence.
- The adapter parses only .ts authored modules. It inspects .cts, .mts, .cjs, .mjs, .ts, and .js entry names only to prevent false positive evidence when an Eve filesystem slot or local-subagent identity is collided.
- Tool and skill descriptions are required to be statically provable strings for positive registration evidence but are not compared byte for byte with manifest capability descriptions; semantic alignment remains with the skill, evaluate, and PR Assurance.
- Tool approval and toModelOutput behavior is not interpreted beyond the static value shape required to avoid false registration claims.
- TypeScript skill metadata and files are supported only as closed static string-valued records; Eve-valid Uint8Array skill files and dynamic package content remain outside positive registration evidence.

## Adapter: `google-genai`

- Owning package: `@moldea.ai/adapter-google-genai`
- Implementation range: `^1.0.3`
- Supported repository-format versions: `1`
- Compatible Core range: `^2.0.0`
- Runtime guidance: `optional`
- Last verified: `2026-08-19`

Runtime guidance notes: Project-local guidance is needed only for repository-specific wrappers or unsupported indirect integration patterns.

### Target: `typescript-models-generate-content-2`

- Kind: `package`
- Support level: `experimental`
- Language: `typescript`
- Evidence kinds: `instruction-loader`, `language`, `runtime-package`, `runtime-pattern`, `schema`, `tool-registration`
- Last verified: `2026-08-19`

| Ecosystem | Package         | Role      | Verified range    |
| --------- | --------------- | --------- | ----------------- |
| `npm`     | `@google/genai` | `primary` | `>=2.17.1 <3.0.0` |

#### Binding support

| Subject              | Relationship | Symbol |
| -------------------- | ------------ | ------ |
| `runtime-agent`      | `full`       | `full` |
| `instruction-loader` | `full`       | `full` |
| `tool-registration`  | `full`       | `full` |
| `tool-input-schema`  | `full`       | `full` |

#### Patterns

| Kind                 | Pattern                             | Support       | Description                                                                                                                             | Notes         |
| -------------------- | ----------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `instruction-loader` | `direct-config-system-instruction`  | `full`        | A directly bound instruction loader supplies config.systemInstruction in a closed generate-content request.                             | Not available |
| `runtime`            | `direct-models-generate-content`    | `full`        | Direct Google Gen AI models.generateContent invocation through a module-local client in a directly exported TypeScript function.        | Not available |
| `runtime`            | `dynamic-request-or-config`         | `ambiguous`   | Dynamically assembled requests or configuration cannot be mapped reliably without semantic analysis.                                    | Not available |
| `runtime`            | `streaming-chat-live-interactions`  | `unsupported` | Streaming generation, chat sessions, live sessions, and Interactions API calls are outside the initial direct generate-content target.  | Not available |
| `schema`             | `alternative-parameters-schema`     | `unsupported` | FunctionDeclaration.parameters and its OpenAPI-style Schema representation are outside the initial JSON-schema target.                  | Not available |
| `schema`             | `direct-parameters-json-schema`     | `full`        | A bound tool input schema is referenced directly through the function declaration parametersJsonSchema property.                        | Not available |
| `tool`               | `callable-and-mcp-tools`            | `unsupported` | Callable tools, MCP conversion helpers, and automatic tool execution are outside the initial static function-declaration target.        | Not available |
| `tool`               | `closed-function-declaration-tools` | `full`        | Closed inline or immutable module-local collections expose statically declared functions through config.tools and functionDeclarations. | Not available |
| `tool`               | `provider-server-tools`             | `unsupported` | Google-hosted or provider/server tools do not establish version 1 repository-local manifest tool relationships.                         | Not available |

#### Provider limits

| Subject     | Limit                        | Kind                  | Value                         | Description                                                                                                                   | Reference                                        |
| ----------- | ---------------------------- | --------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `other`     | `function-declaration-count` | `other`               | `512`                         | The Google Gen AI SDK Tool contract permits at most 512 function declarations in each closed functionDeclarations collection. | Google Gen AI SDK Tool reference.                |
| `tool-name` | `function-name-length`       | `max-unicode-scalars` | `128`                         | The Google Gen AI SDK FunctionDeclaration contract limits function names to 128 Unicode scalar values.                        | Google Gen AI SDK FunctionDeclaration reference. |
| `tool-name` | `function-name-pattern`      | `pattern`             | `^[A-Za-z_][A-Za-z0-9_.:-]*$` | The Google Gen AI SDK FunctionDeclaration contract uses the documented ASCII leading and continuation character set.          | Google Gen AI SDK FunctionDeclaration reference. |

#### Known limitations

- Arbitrary compiler resolution, path aliases, directory indexes, package exports, subpath imports, and re-export graphs are not resolved.
- Backend-specific function-name restrictions are not validated; the published function-name rules cover only the version-matched SDK declaration contract.
- Constructor configuration, provider backend, API version, authentication mode, model selection, request contents, and response handling are not interpreted.
- Dynamic configuration, callable tools, MCP helpers, provider/server tools, automatic function execution, streaming, chats, live sessions, and Interactions API calls are outside the initial target.
- Function input-schema contents, including top-level object shape and parameter-name restrictions, are not validated; the target establishes only direct parametersJsonSchema wiring.
- Source forms outside the verified TypeScript ESM target, legacy @google/generative-ai, alternative parameters schemas, output schemas, runtime variables, and handoffs are outside the initial target.

## Adapter: `langchain`

- Owning package: `@moldea.ai/adapter-langchain`
- Implementation range: `^1.0.0`
- Supported repository-format versions: `1`
- Compatible Core range: `^2.0.0`
- Runtime guidance: `optional`
- Last verified: `2026-08-20`

Runtime guidance notes: Project-local guidance is needed only for repository-specific wrappers, middleware-driven relationships, supervisor composition around a supported LangChain boundary, headless tools, dynamic tool collections, or other unsupported indirect LangChain integration patterns.

### Target: `typescript-create-agent-1-5`

- Kind: `package`
- Support level: `experimental`
- Language: `typescript`
- Evidence kinds: `agent-definition`, `instruction-loader`, `language`, `runtime-package`, `schema`, `tool-registration`
- Last verified: `2026-08-20`

| Ecosystem | Package           | Role        | Verified range   |
| --------- | ----------------- | ----------- | ---------------- |
| `npm`     | `@langchain/core` | `companion` | `>=1.2.8 <1.3.0` |
| `npm`     | `langchain`       | `primary`   | `>=1.5.9 <1.6.0` |

#### Binding support

| Subject               | Relationship | Symbol    |
| --------------------- | ------------ | --------- |
| `runtime-agent`       | `partial`    | `partial` |
| `output-schema`       | `partial`    | `partial` |
| `instruction-loader`  | `partial`    | `partial` |
| `tool-implementation` | `partial`    | `partial` |
| `tool-registration`   | `partial`    | `partial` |
| `tool-input-schema`   | `partial`    | `partial` |

#### Patterns

| Kind                 | Pattern                           | Support       | Description                                                                                                                                                                                                          | Notes         |
| -------------------- | --------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `agent`              | `direct-create-agent`             | `full`        | A directly exported TypeScript const initialized through the package-root createAgent helper with one closed object-literal configuration is recognized as the agent definition.                                     | Not available |
| `agent`              | `direct-langgraph-graphs`         | `unsupported` | Direct StateGraph, Functional API, graph, and compiled-graph applications belong to the separate LangGraph adapter.                                                                                                  | Not available |
| `agent`              | `legacy-langchain-agents`         | `unsupported` | Legacy agent executors and deprecated agent helper surfaces are outside the initial target.                                                                                                                          | Not available |
| `agent`              | `middleware-relationship-effects` | `ambiguous`   | Non-empty or unresolved middleware may alter prompts, tools, and structured runtime behavior and is not interpreted by the initial target.                                                                           | Not available |
| `instruction-loader` | `direct-system-prompt-loader`     | `partial`     | Direct loader calls and direct SystemMessage construction are supported when middleware is statically inactive.                                                                                                      | Not available |
| `routing`            | `supervisor-routing`              | `unsupported` | Agent description fields do not establish source-to-target routing or handoff relationships without a verified supervisor registration target.                                                                       | Not available |
| `runtime`            | `langchain-primary-boundary`      | `full`        | A supported createAgent definition remains LangChain even though LangChain compiles the agent on top of LangGraph.                                                                                                   | Not available |
| `schema`             | `direct-response-format-schema`   | `partial`     | One directly bound responseFormat schema establishes the agent output-schema relationship when middleware is statically inactive.                                                                                    | Not available |
| `schema`             | `response-format-arrays`          | `ambiguous`   | Developer-authored or statically bound multiple response schemas or strategies cannot be mapped uniquely to the single Repository Format agent output-schema binding.                                                | Not available |
| `schema`             | `state-and-context-input-schema`  | `unsupported` | stateSchema and contextSchema are not collapsed into the Repository Format agent input-schema relationship.                                                                                                          | Not available |
| `schema`             | `structured-output-strategies`    | `partial`     | Direct toolStrategy and providerStrategy wrappers around one bound schema are supported; the helper-produced array shape of a single-schema toolStrategy call is not treated as an authored multi-format collection. | Not available |
| `tool`               | `closed-tool-collections`         | `partial`     | Closed inline and immutable module-local tool arrays establish agent registration when middleware is statically inactive.                                                                                            | Not available |
| `tool`               | `headless-client-tools`           | `unsupported` | One-argument headless tools do not establish a repository-local server implementation relationship in the initial target.                                                                                            | Not available |
| `tool`               | `normal-function-tools`           | `partial`     | Direct normal two-argument tool helper declarations support implementation, runtime-name, and input-schema relationships.                                                                                            | Not available |

#### Known limitations

- Developer-authored and statically resolved multi-format arrays are not mapped to the single canonical agent output-schema binding; a single-schema toolStrategy call remains supported despite its array-shaped helper return.
- Direct LangGraph applications remain outside this adapter target.
- Lockfiles and installed package versions are not inspected.
- Non-empty or unresolved middleware suppresses prompt, tool-registration, and output-schema relationship conclusions.
- Only TypeScript ESM source and documented direct relative imports are interpreted.
- Only directly exported package-root createAgent definitions are recognized.
- The target does not infer agent input schemas from stateSchema or contextSchema.
- The target does not infer supervisors, routing targets, handoffs, or subagent control transfer.
- The target does not interpret headless tools, provider tools, server tools, toolkits, MCP tools, or tool output schemas.

## Adapter: `openai`

- Owning package: `@moldea.ai/adapter-openai`
- Implementation range: `^2.0.0`
- Supported repository-format versions: `1`
- Compatible Core range: `^2.0.0`
- Runtime guidance: `recommended`
- Last verified: `2026-08-17`

Runtime guidance notes: Document project-specific model selection, tool execution, streaming, retry, and error behavior that static inspection cannot establish.

### Target: `typescript-responses-api-7`

- Kind: `package`
- Support level: `experimental`
- Language: `typescript`
- Evidence kinds: `instruction-loader`, `language`, `runtime-package`, `runtime-pattern`, `schema`, `tool-registration`
- Last verified: `2026-08-17`

| Ecosystem | Package  | Role      | Verified range   |
| --------- | -------- | --------- | ---------------- |
| `npm`     | `openai` | `primary` | `>=7.4.0 <8.0.0` |

#### Binding support

| Subject              | Relationship | Symbol |
| -------------------- | ------------ | ------ |
| `runtime-agent`      | `full`       | `full` |
| `instruction-loader` | `full`       | `full` |
| `tool-registration`  | `full`       | `full` |
| `tool-input-schema`  | `full`       | `full` |

#### Patterns

| Kind                 | Pattern                          | Support     | Description                                                                                                                                                             | Notes         |
| -------------------- | -------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `instruction-loader` | `direct-instruction-loader`      | `full`      | A bound loader is called directly, optionally through await, by a Responses request instructions property.                                                              | Not available |
| `runtime`            | `chat-completions`               | `ambiguous` | Chat Completions usage is outside this target and is not rejected merely because Responses is preferred.                                                                | Not available |
| `runtime`            | `direct-responses-runtime-agent` | `full`      | A bound exported TypeScript function uses a module-local OpenAI client for one or more direct Responses API object-literal requests with relationship-specific closure. | Not available |
| `runtime`            | `dynamic-source-indirection`     | `ambiguous` | Factories, relationship-affecting computed properties and spreads, mutable arrays, and indirect request values remain unresolved.                                       | Not available |
| `schema`             | `direct-tool-input-schema`       | `full`      | A bound tool input schema is referenced directly by function-tool parameters.                                                                                           | Not available |
| `tool`               | `static-function-tools`          | `full`      | Bound static OpenAI function-tool objects with the supported exact fields are included in a closed inline or immutable module-local Responses tools array.              | Not available |

#### Known limitations

- Agent input and output schemas, tool implementations and output schemas, skills, variables, and runtime-native routing do not produce evidence.
- Only TypeScript ESM files with supported direct default and relative named imports are interpreted.
- Package versions are classified from nearest package manifests; lockfiles and installed node_modules are not inspected.
- Source forms outside the verified TypeScript ESM target, Realtime, Assistants, Agents SDK, streaming semantics, and provider-hosted configuration are not interpreted.

## Adapter: `openai-agents-sdk`

- Owning package: `@moldea.ai/adapter-openai-agents-sdk`
- Implementation range: `^1.0.0`
- Supported repository-format versions: `1`
- Compatible Core range: `^2.0.0`
- Runtime guidance: `optional`
- Last verified: `2026-08-19`

Runtime guidance notes: Project-local guidance is needed only for repository-specific wrappers, dynamic graph construction, or unsupported indirect integration patterns.

### Target: `typescript-agent-handoffs-0-16`

- Kind: `package`
- Support level: `experimental`
- Language: `typescript`
- Evidence kinds: `agent-definition`, `handoff-registration`, `instruction-loader`, `language`, `runtime-package`, `schema`, `tool-registration`
- Last verified: `2026-08-19`

| Ecosystem | Package          | Role      | Verified range     |
| --------- | ---------------- | --------- | ------------------ |
| `npm`     | `@openai/agents` | `primary` | `>=0.16.1 <0.17.0` |

#### Binding support

| Subject               | Relationship | Symbol |
| --------------------- | ------------ | ------ |
| `runtime-agent`       | `full`       | `full` |
| `output-schema`       | `full`       | `full` |
| `instruction-loader`  | `full`       | `full` |
| `tool-implementation` | `full`       | `full` |
| `tool-registration`   | `full`       | `full` |
| `tool-input-schema`   | `full`       | `full` |
| `tool-output-schema`  | `full`       | `full` |

#### Patterns

| Kind                 | Pattern                             | Support       | Description                                                                                                                                         | Notes         |
| -------------------- | ----------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `agent`              | `agent-create-construction`         | `full`        | A directly exported TypeScript const constructs an Agent through Agent.create with one closed object-literal configuration.                         | Not available |
| `agent`              | `direct-agent-construction`         | `full`        | A directly exported TypeScript const constructs an Agent through new Agent with one closed object-literal configuration.                            | Not available |
| `agent`              | `dynamic-agent-configuration`       | `ambiguous`   | Dynamically assembled Agent configurations cannot be mapped reliably without semantic analysis.                                                     | Not available |
| `agent`              | `realtime-and-sandbox-agents`       | `unsupported` | Realtime and sandbox agent abstractions are outside the initial Agent target.                                                                       | Not available |
| `instruction-loader` | `direct-instruction-loader`         | `full`        | A declared instruction loader is used by direct call, direct reference, or one supported single-return dynamic-instruction wrapper.                 | Not available |
| `routing`            | `agents-as-tools`                   | `unsupported` | Agent-as-tool delegation retains manager control and is not interpreted as a handoff by the initial target.                                         | Not available |
| `routing`            | `configured-handoff-helper`         | `full`        | A source Agent registers a supported target through handoff with optional closed name and description overrides.                                    | Not available |
| `routing`            | `direct-agent-handoff`              | `full`        | A source Agent registers a supported target Agent directly in its closed handoffs collection.                                                       | Not available |
| `routing`            | `dynamic-routing-description`       | `ambiguous`   | Runtime-generated or transformed handoff descriptions and description overrides remain unestablished.                                               | Not available |
| `routing`            | `effective-routing-description`     | `full`        | Target handoffDescription uses the canonical handoff description when present and the canonical agent-description fallback otherwise.               | Not available |
| `routing`            | `registration-description-override` | `full`        | A non-empty static toolDescriptionOverride is authoritative for its handoff registration and must use the target effective routing description.     | Not available |
| `schema`             | `direct-agent-output-schema`        | `full`        | A bound agent output schema is referenced directly through outputType.                                                                              | Not available |
| `tool`               | `closed-agent-tool-array`           | `full`        | Closed inline or immutable module-local arrays register supported function tools on an Agent.                                                       | Not available |
| `tool`               | `closed-function-tool`              | `full`        | A directly exported function tool uses the root tool helper, an explicit normalized static name, direct implementation, and direct schema bindings. | Not available |
| `tool`               | `hosted-and-mcp-tools`              | `unsupported` | Hosted, MCP-generated, namespaced, and tool-search tools are outside the initial repository-local function-tool target.                             | Not available |

#### Known limitations

- Agent output, tool input, and tool output schema contents are not validated; the target establishes only direct schema wiring.
- Arbitrary compiler resolution, path aliases, directory indexes, package exports, CommonJS, and re-export graphs are not resolved.
- Custom Handoff objects, agents as tools, hosted tools, MCP tools, Realtime agents, sandbox agents, and dynamically assembled agent graphs are outside the initial target.
- Function tools require an explicit static name already in the initial normalized runtime subset; omitted names and names requiring SDK normalization are outside the target rather than invalid.
- Handoff evidence reports a runtime name only for a supported static non-empty toolNameOverride that can be represented as a valid Runtime Adapter Contract machine string. SDK-generated default names and absent, empty, dynamic, unsupported, mutation-obscured, or evidence-unrepresentable overrides are reported as null.
- Handoff input schemas, callbacks, filters, enablement, runtime variables, guardrails, prompt templates, sessions, tracing, approvals, models, and provider behavior are not interpreted.
- Routing-description validation supports only static inline, immutable module-local, and directly imported static strings; loaders, file reads, transformations, and runtime-generated values remain unresolved.

## Adapter: `vercel-ai-sdk`

- Owning package: `@moldea.ai/adapter-vercel-ai-sdk`
- Implementation range: `^1.0.0`
- Supported repository-format versions: `1`
- Compatible Core range: `^2.0.0`
- Runtime guidance: `optional`
- Last verified: `2026-08-19`

Runtime guidance notes: Project-local guidance is needed only for repository-specific wrappers or unsupported dynamic integration patterns.

### Target: `typescript-generate-stream-text-7`

- Kind: `package`
- Support level: `experimental`
- Language: `typescript`
- Evidence kinds: `instruction-loader`, `language`, `runtime-package`, `runtime-pattern`, `schema`, `tool-registration`
- Last verified: `2026-08-19`

| Ecosystem | Package | Role      | Verified range    |
| --------- | ------- | --------- | ----------------- |
| `npm`     | `ai`    | `primary` | `>=7.0.66 <8.0.0` |

#### Binding support

| Subject               | Relationship | Symbol    |
| --------------------- | ------------ | --------- |
| `runtime-agent`       | `partial`    | `partial` |
| `output-schema`       | `partial`    | `partial` |
| `instruction-loader`  | `partial`    | `partial` |
| `tool-implementation` | `partial`    | `partial` |
| `tool-registration`   | `partial`    | `partial` |
| `tool-input-schema`   | `partial`    | `partial` |
| `tool-output-schema`  | `partial`    | `partial` |

#### Patterns

| Kind                 | Pattern                                | Support       | Description                                                                                                             | Notes         |
| -------------------- | -------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------- |
| `agent`              | `direct-generate-text-wrapper`         | `full`        | A directly exported function containing a direct generateText object-literal call is recognized as the runtime pattern. | Not available |
| `agent`              | `direct-stream-text-wrapper`           | `full`        | A directly exported function containing a direct streamText object-literal call is recognized as the runtime pattern.   | Not available |
| `instruction-loader` | `direct-generation-instruction-loader` | `partial`     | Direct loader calls are supported when prepareStep cannot replace the instructions.                                     | Not available |
| `instruction-loader` | `instructions-system-precedence`       | `full`        | instructions is authoritative and deprecated system is used only through the supported absence fallback.                | Not available |
| `instruction-loader` | `prepare-step-instruction-overrides`   | `ambiguous`   | prepareStep may replace per-step instructions and is not interpreted by the initial target.                             | Not available |
| `runtime`            | `indirect-generation-wrapper`          | `unsupported` | Calls routed through arbitrary wrappers, factories, callbacks, or request builders are outside the initial target.      | Not available |
| `schema`             | `direct-agent-input-schema`            | `unsupported` | The initial direct-generation target publishes no agent input-schema relationship.                                      | Not available |
| `schema`             | `object-output-schema`                 | `partial`     | Direct Output.object schema binding establishes the agent output-schema relationship.                                   | Not available |
| `tool`               | `closed-tools-map`                     | `partial`     | Closed object-map registration supports repository-local function tools created through tool.                           | Not available |
| `tool`               | `direct-function-tool-bindings`        | `partial`     | Direct execute, inputSchema, and outputSchema bindings are interpreted without executing the tool.                      | Not available |

#### Known limitations

- Lockfiles and installed package versions are not inspected.
- Only Output.object establishes an agent output-schema relationship.
- Only TypeScript ESM source and documented direct relative imports are interpreted.
- Only direct generateText and streamText calls in the bound function's own lexical body are interpreted.
- The target does not infer providers, models, routing targets, handoffs, or subagent control transfer.
- prepareStep function bodies are not interpreted.

### Target: `typescript-tool-loop-agent-7`

- Kind: `package`
- Support level: `experimental`
- Language: `typescript`
- Evidence kinds: `agent-definition`, `instruction-loader`, `language`, `runtime-package`, `schema`, `tool-registration`
- Last verified: `2026-08-19`

| Ecosystem | Package | Role      | Verified range    |
| --------- | ------- | --------- | ----------------- |
| `npm`     | `ai`    | `primary` | `>=7.0.66 <8.0.0` |

#### Binding support

| Subject               | Relationship | Symbol    |
| --------------------- | ------------ | --------- |
| `runtime-agent`       | `partial`    | `partial` |
| `input-schema`        | `partial`    | `partial` |
| `output-schema`       | `partial`    | `partial` |
| `instruction-loader`  | `partial`    | `partial` |
| `tool-implementation` | `partial`    | `partial` |
| `tool-registration`   | `partial`    | `partial` |
| `tool-input-schema`   | `partial`    | `partial` |
| `tool-output-schema`  | `partial`    | `partial` |

#### Patterns

| Kind                 | Pattern                               | Support       | Description                                                                                                                           | Notes         |
| -------------------- | ------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `agent`              | `direct-tool-loop-agent-construction` | `full`        | Directly exported ToolLoopAgent construction through one closed object-literal settings value.                                        | Not available |
| `agent`              | `prepare-call-overrides`              | `ambiguous`   | prepareCall may replace instructions and tools or omit the construction-time output, and is not interpreted by the initial target.    | Not available |
| `agent`              | `workflow-agent`                      | `unsupported` | WorkflowAgent and @ai-sdk/workflow are outside the initial target.                                                                    | Not available |
| `instruction-loader` | `direct-agent-instruction-loader`     | `partial`     | Direct loader calls in instructions are supported when prepareCall and prepareStep cannot replace them.                               | Not available |
| `instruction-loader` | `prepare-step-instruction-overrides`  | `ambiguous`   | prepareStep may replace per-step instructions and is not interpreted by the initial target.                                           | Not available |
| `routing`            | `subagent-handoff-inference`          | `unsupported` | A function tool that calls another agent does not establish a target or handoff relationship in the initial target.                   | Not available |
| `schema`             | `call-options-input-schema`           | `full`        | Direct callOptionsSchema binding establishes the agent input-schema relationship.                                                     | Not available |
| `schema`             | `object-output-schema`                | `partial`     | Direct Output.object schema binding establishes the agent output-schema relationship when no uninterpreted prepareCall can remove it. | Not available |
| `tool`               | `closed-tools-map`                    | `partial`     | Closed object-map registration supports repository-local function tools created through tool.                                         | Not available |
| `tool`               | `direct-function-tool-bindings`       | `partial`     | Direct execute, inputSchema, and outputSchema bindings are interpreted without executing the tool.                                    | Not available |

#### Known limitations

- Lockfiles and installed package versions are not inspected.
- Only Output.object establishes an agent output-schema relationship.
- Only TypeScript ESM source and documented direct relative imports are interpreted.
- The target does not infer providers, models, routing targets, handoffs, or subagent control transfer.
- prepareCall and prepareStep function bodies are not interpreted; prepareCall therefore leaves instruction, tool, and output-schema wiring unresolved.
