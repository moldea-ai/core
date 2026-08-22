![moldea Vercel AI SDK adapter](cover.png)

# `@moldea.ai/adapter-vercel-ai-sdk`

Deterministic runtime evidence and diagnostics for Vercel AI SDK `ToolLoopAgent`, `generateText`, and `streamText` integrations declared by `moldea` agents.

The package implements the official `vercel-ai-sdk` runtime adapter for `@moldea.ai/core`. It statically inspects explicitly bound repository source through Core's source-neutral reader. It never imports or calls the Vercel AI SDK, requires no API key, executes no repository code, and makes no network request.

## Supported targets

Version `1.0.2` supports:

- Repository Format version `1`
- `@moldea.ai/core ^2.0.0`
- TypeScript ESM `.ts`, `.tsx`, and `.mts` source
- npm `ai >=7.0.66 <8.0.0`
- directly exported `ToolLoopAgent` definitions
- directly exported functions containing direct `generateText({ ... })` or `streamText({ ... })` calls
- direct instruction-loader wiring through `instructions` and the closed direct-generation `system` fallback
- ToolLoopAgent input schemas through `callOptionsSchema`
- agent output schemas through `Output.object({ schema })`
- repository-local function tools declared through `tool({ ... })`
- closed object-map tool registration with runtime identity derived from each map key
- direct tool implementation, input-schema, and output-schema relationships

Named value imports from the `ai` package root and their aliases are supported. Relative ESM named imports resolve exact TypeScript paths plus `.js` to `.ts` or `.tsx` and `.mjs` to `.mts`. Relationship closure is independent: a dynamic relationship does not erase another relationship proved from the same configuration.

The Runtime Compatibility Matrix is authoritative for exact versions, evidence, binding support, patterns, and known limitations.

## Usage

```typescript
import { vercelAiSdkAdapter } from '@moldea.ai/adapter-vercel-ai-sdk';
import { createCore } from '@moldea.ai/core';

const core = createCore({ adapters: [vercelAiSdkAdapter] });
```

The local CLI bundles active official adapters automatically. Applications composing Core directly register the immutable singleton explicitly.

## Public exports

The package exports only `vercelAiSdkAdapter`. It has no default export, configuration factory, diagnostic registry, SDK facade, parser export, provider registry, tool runtime, or mutable state.

## Evidence

The verified targets may emit `runtime-package`, `language`, `agent-definition`, `runtime-pattern`, `instruction-loader`, `schema`, and `tool-registration` evidence. Schema details identify the `agent-input`, `agent-output`, `tool-input`, or `tool-output` role. Tool runtime names come from exact supported tools-map keys.

Evidence is source-grounded, references existing regular files, and contains no repository contents, instructions, descriptions, credentials, model identifiers, tool arguments, provider configuration, request or response payloads, or model output.

## Diagnostics

| Code                                                 | Stable message                                                                                  |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `VERCEL_AI_SDK_PACKAGE_MANIFEST_INVALID`             | The owning package manifest is invalid for Vercel AI SDK dependency detection.                  |
| `VERCEL_AI_SDK_VERSION_UNSUPPORTED`                  | The observed Vercel AI SDK dependency range is disjoint from the supported range.               |
| `VERCEL_AI_SDK_SOURCE_TEXT_INVALID`                  | The referenced Vercel AI SDK source file is not valid normalized text.                          |
| `VERCEL_AI_SDK_SOURCE_SYNTAX_INVALID`                | The referenced Vercel AI SDK source file contains invalid TypeScript syntax.                    |
| `VERCEL_AI_SDK_RUNTIME_AGENT_SYMBOL_NOT_FOUND`       | The declared runtime-agent symbol was not found.                                                |
| `VERCEL_AI_SDK_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND`  | The declared instruction-loader symbol was not found.                                           |
| `VERCEL_AI_SDK_AGENT_INPUT_SCHEMA_SYMBOL_NOT_FOUND`  | The declared agent input-schema symbol was not found.                                           |
| `VERCEL_AI_SDK_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND` | The declared agent output-schema symbol was not found.                                          |
| `VERCEL_AI_SDK_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND` | The declared tool-implementation symbol was not found.                                          |
| `VERCEL_AI_SDK_TOOL_REGISTRATION_SYMBOL_NOT_FOUND`   | The declared tool-registration symbol was not found.                                            |
| `VERCEL_AI_SDK_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND`   | The declared tool input-schema symbol was not found.                                            |
| `VERCEL_AI_SDK_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND`  | The declared tool output-schema symbol was not found.                                           |
| `VERCEL_AI_SDK_INSTRUCTION_LOADER_NOT_WIRED`         | The declared instruction loader is not wired to the detected Vercel AI SDK instructions.        |
| `VERCEL_AI_SDK_AGENT_INPUT_SCHEMA_NOT_WIRED`         | The declared agent input schema is not wired to the detected ToolLoopAgent call-options schema. |
| `VERCEL_AI_SDK_AGENT_OUTPUT_SCHEMA_NOT_WIRED`        | The declared agent output schema is not wired to the detected Vercel AI SDK structured output.  |
| `VERCEL_AI_SDK_TOOL_IMPLEMENTATION_NOT_WIRED`        | The declared tool implementation is not wired to the detected Vercel AI SDK function tool.      |
| `VERCEL_AI_SDK_TOOL_REGISTRATION_NOT_WIRED`          | The declared tool registration is not wired to the detected Vercel AI SDK tools map.            |
| `VERCEL_AI_SDK_TOOL_NAME_MISMATCH`                   | The declared tool name does not match the detected Vercel AI SDK tools-map key.                 |
| `VERCEL_AI_SDK_TOOL_INPUT_SCHEMA_NOT_WIRED`          | The declared tool input schema is not wired to the detected Vercel AI SDK function tool.        |
| `VERCEL_AI_SDK_TOOL_OUTPUT_SCHEMA_NOT_WIRED`         | The declared tool output schema is not wired to the detected Vercel AI SDK function tool.       |

Missing local runtime evidence is not a diagnostic. Dynamic, prepared, mutated, unsupported, or otherwise unresolved forms produce partial or no evidence rather than guessed failures.

## Development

From the monorepo root:

```bash
pnpm --filter @moldea.ai/adapter-vercel-ai-sdk test
pnpm --filter @moldea.ai/adapter-vercel-ai-sdk typecheck
pnpm --filter @moldea.ai/adapter-vercel-ai-sdk lint
pnpm --filter @moldea.ai/adapter-vercel-ai-sdk build
```

Unit and integration tests are colocated with their implementation modules. Adapter conformance fixtures live under `/fixtures/adapter-vercel-ai-sdk`.
