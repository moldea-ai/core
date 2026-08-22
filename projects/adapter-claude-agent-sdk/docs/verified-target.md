---
title: Verified target
description: Exact query, subagent, instruction, schema, MCP tool, availability, and routing support.
order: 10
---

# Verified target

The canonical Runtime Compatibility Matrix defines the technical target `typescript-query-subagents-0-3`.

## Supported boundary

- TypeScript ESM `.ts`, `.tsx`, and `.mts` files
- a nearest owning package manifest declaring npm `@anthropic-ai/claude-agent-sdk >=0.3.234 <0.4.0`
- named value imports from the package root, including aliases
- directly exported function declarations, arrow functions, or function expressions containing direct `query(...)` calls in their own lexical body
- directly exported immutable object-literal programmatic `AgentDefinition` values
- direct or awaited instruction-loader calls through query `systemPrompt`, `claude_code` preset `append`, and subagent `prompt`
- query JSON Schema output through the exact `outputFormat` shape
- directly exported positional `tool(...)` declarations with direct implementation and input-schema bindings
- module-local `createSdkMcpServer(...)` declarations with closed tool arrays
- closed query `agents` and `mcpServers` maps
- query and subagent tool availability using closed `tools` and `disallowedTools` arrays
- active subagent delegation only when query-configured `Agent` availability is proved available
- exact target mapping by source path and exported symbol
- exact `AgentDefinition.description` comparison with the target's effective handoff description

Bindings must remain lexically visible at each matched use. Supported relative named imports resolve an exact TypeScript path, `.js` to `.ts` or `.tsx`, and `.mjs` to `.mts`. Re-exports, directory indexes, path aliases, CommonJS, and package-export resolution are outside the target.

## Relationship closure

Query inputs, query options, programmatic definitions, SDK MCP servers, and tool definitions are analyzed independently by relationship. Computed or duplicate relationship properties, object spreads, unsupported values, and observable mutation leave only affected relationships unresolved.

Positive evidence is existential across supported query calls. Negative wiring diagnostics require every relevant candidate to be closed and contradictory, with no dynamic or availability-unresolved context that could establish the relationship.

## Availability

The built-in `Agent` tool and SDK MCP tools use `available`, `unavailable`, and `unresolved` states. `allowedTools` does not establish or restore availability. Supported `disallowedTools` entries use exact complete-name matching with `*` as the only wildcard. Query `agent` and `toolAliases` fields make otherwise available delegation and tool relationships unresolved; they cannot restore an already unavailable tool.

## Static strings

Routing descriptions, map keys, tool names, server names and versions, and tool-list entries support literals, no-substitution templates, immutable module-local constants, and directly imported immutable string constants. Values are compiler-parsed and are never trimmed, case-folded, or Unicode-normalized.
