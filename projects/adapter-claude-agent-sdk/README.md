![moldea Claude Agent SDK adapter](cover.png)

# `@moldea.ai/adapter-claude-agent-sdk`

Deterministic runtime evidence and diagnostics for Claude Agent SDK query and programmatic-subagent integrations declared by `moldea` agents.

The package implements the official `claude-agent-sdk` runtime adapter for `@moldea.ai/core`. It statically inspects explicitly bound repository source through Core's source-neutral reader. It never imports or calls the Claude Agent SDK, requires no API key, executes no repository code, and makes no network request.

## Supported target

Version `1.0.2` supports:

- Repository Format version `1`
- `@moldea.ai/core ^2.0.0`
- TypeScript ESM source
- npm `@anthropic-ai/claude-agent-sdk >=0.3.234 <0.4.0`
- directly exported functions containing direct `query({ ... })` calls
- directly exported immutable object-literal programmatic `AgentDefinition` values
- query `systemPrompt`, `claude_code` preset `append`, and subagent `prompt` instruction loaders
- query output schemas through `outputFormat: { type: 'json_schema', schema }`
- custom tools created through positional `tool(...)` calls
- SDK MCP servers created through `createSdkMcpServer(...)` and mounted through query `mcpServers`
- query- and subagent-local tool availability using closed `tools` and `disallowedTools` lists
- active programmatic-subagent registration through an available built-in `Agent` tool
- exact routing-description comparison through `AgentDefinition.description`

Named root-package imports and aliases of `query`, `tool`, and `createSdkMcpServer` are supported. Relative ESM named imports resolve exact paths plus `.js` to `.ts` or `.tsx` and `.mjs` to `.mts` substitutions. Relationship closure is independent: a dynamic relationship does not erase other relationships proved from the same query or definition.

The Runtime Compatibility Matrix is authoritative for exact versions, evidence, binding support, patterns, and known limitations.

## Usage

```typescript
import { claudeAgentSdkAdapter } from '@moldea.ai/adapter-claude-agent-sdk';
import { createCore } from '@moldea.ai/core';

const core = createCore({ adapters: [claudeAgentSdkAdapter] });
```

The local CLI bundles active official adapters automatically. Applications composing Core directly register the immutable singleton explicitly.

## Public exports

The package exports only `claudeAgentSdkAdapter`. It has no default export, configuration factory, diagnostic registry, SDK facade, parser export, or mutable runtime state.

## Evidence

The verified target may emit `runtime-package`, `language`, `runtime-pattern`, `agent-definition`, `instruction-loader`, `schema`, `tool-registration`, and `handoff-registration` evidence. Tool runtime names use `mcp__{server key}__{tool name}` only when the query-level key requires no SDK normalization.

Evidence is source-grounded, references existing regular files, and contains no repository contents, instructions, descriptions, credentials, tool arguments, MCP payloads, session data, or provider output.

## Diagnostics

| Code                                                     | Stable message                                                                                                            |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE_AGENT_SDK_PACKAGE_MANIFEST_INVALID`              | The owning package manifest is invalid for Claude Agent SDK dependency detection.                                         |
| `CLAUDE_AGENT_SDK_VERSION_UNSUPPORTED`                   | The observed Claude Agent SDK dependency range is disjoint from the supported range.                                      |
| `CLAUDE_AGENT_SDK_SOURCE_TEXT_INVALID`                   | The referenced Claude Agent SDK source file is not valid normalized text.                                                 |
| `CLAUDE_AGENT_SDK_SOURCE_SYNTAX_INVALID`                 | The referenced Claude Agent SDK source file contains invalid TypeScript syntax.                                           |
| `CLAUDE_AGENT_SDK_RUNTIME_AGENT_SYMBOL_NOT_FOUND`        | The declared runtime-agent symbol was not found.                                                                          |
| `CLAUDE_AGENT_SDK_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND`   | The declared instruction-loader symbol was not found.                                                                     |
| `CLAUDE_AGENT_SDK_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND`  | The declared agent output-schema symbol was not found.                                                                    |
| `CLAUDE_AGENT_SDK_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND`  | The declared tool-implementation symbol was not found.                                                                    |
| `CLAUDE_AGENT_SDK_TOOL_REGISTRATION_SYMBOL_NOT_FOUND`    | The declared tool-registration symbol was not found.                                                                      |
| `CLAUDE_AGENT_SDK_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND`    | The declared tool input-schema symbol was not found.                                                                      |
| `CLAUDE_AGENT_SDK_MCP_SERVER_KEY_UNSUPPORTED`            | The detected Claude Agent SDK MCP server key cannot establish a canonical runtime-name segment.                           |
| `CLAUDE_AGENT_SDK_INSTRUCTION_LOADER_NOT_WIRED`          | The declared instruction loader is not wired to the detected Claude Agent SDK agent.                                      |
| `CLAUDE_AGENT_SDK_AGENT_OUTPUT_SCHEMA_NOT_WIRED`         | The declared agent output schema is not wired to the detected Claude Agent SDK query output format.                       |
| `CLAUDE_AGENT_SDK_TOOL_IMPLEMENTATION_NOT_WIRED`         | The declared tool implementation is not wired to the detected Claude Agent SDK custom tool.                               |
| `CLAUDE_AGENT_SDK_TOOL_REGISTRATION_NOT_WIRED`           | The declared tool registration is not available to the detected Claude Agent SDK agent.                                   |
| `CLAUDE_AGENT_SDK_TOOL_NAME_MISMATCH`                    | The declared tool name does not match the detected Claude Agent SDK MCP tool name.                                        |
| `CLAUDE_AGENT_SDK_TOOL_INPUT_SCHEMA_NOT_WIRED`           | The declared tool input schema is not wired to the detected Claude Agent SDK custom tool.                                 |
| `CLAUDE_AGENT_SDK_HANDOFF_TARGET_AMBIGUOUS`              | The detected Claude Agent SDK subagent target matches more than one registered moldea agent.                              |
| `CLAUDE_AGENT_SDK_HANDOFF_ROUTING_DESCRIPTION_MISSING`   | The detected Claude Agent SDK subagent registration has no supported routing description.                                 |
| `CLAUDE_AGENT_SDK_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED` | The detected Claude Agent SDK subagent routing description does not use the target agent's effective routing description. |

Missing local runtime evidence is not a diagnostic. Dynamic or unsupported forms produce partial or no evidence rather than guessed failures.

## Development

From the monorepo root:

```bash
pnpm --filter @moldea.ai/adapter-claude-agent-sdk test
pnpm --filter @moldea.ai/adapter-claude-agent-sdk typecheck
pnpm --filter @moldea.ai/adapter-claude-agent-sdk lint
pnpm --filter @moldea.ai/adapter-claude-agent-sdk build
```

Unit and integration tests are colocated with their implementation modules. Adapter-specific conformance fixtures live under `/fixtures/adapter-claude-agent-sdk`.
