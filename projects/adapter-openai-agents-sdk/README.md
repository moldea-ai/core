![moldea OpenAI Agents SDK adapter](cover.png)

# `@moldea.ai/adapter-openai-agents-sdk`

Deterministic runtime evidence and diagnostics for OpenAI Agents SDK integrations declared by `moldea` agents.

The package implements the official `openai-agents-sdk` runtime adapter for `@moldea.ai/core`. It statically inspects explicitly bound repository source through Core's source-neutral reader. It never imports or calls the OpenAI Agents SDK, requires no API key, executes no repository code, and makes no network request.

## Supported target

Version `1.0.4` supports:

- Repository Format version `1`
- `@moldea.ai/core ^2.0.0`
- TypeScript ESM source
- npm `@openai/agents >=0.16.1 <0.17.0`
- directly exported `const` agents constructed through `new Agent({ ... })` or `Agent.create({ ... })`
- direct, awaited, referenced, or single-return-wrapper instruction loaders
- direct agent output-schema relationships through `outputType`
- closed function tools created through `tool({ ... })`
- direct tool implementation, input-schema, and output-schema relationships
- closed inline or immutable module-local agent tool arrays
- direct agent handoffs and configured `handoff(...)` registrations
- effective routing descriptions from `toolDescriptionOverride`, `handoffDescription`, or the canonical agent-description fallback

Named root-package imports and aliases of `Agent`, `tool`, and `handoff` are supported. Relationship closure is independent: a dynamic or mutated relationship does not erase other relationships proved from the same definition. Relative ESM named imports resolve exact paths plus `.js` to `.ts` or `.tsx` and `.mjs` to `.mts` substitutions.

The Runtime Compatibility Matrix is authoritative for exact versions, evidence, binding support, patterns, and known limitations.

## Usage

```typescript
import { createCore } from '@moldea.ai/core';
import { openAiAgentsSdkAdapter } from '@moldea.ai/adapter-openai-agents-sdk';

const core = createCore({ adapters: [openAiAgentsSdkAdapter] });
```

The local CLI bundles active official adapters automatically. Applications composing Core directly register the immutable singleton explicitly.

## Public exports

The package exports only the immutable `openAiAgentsSdkAdapter` singleton. It has no default export, configuration factory, diagnostic registry, SDK facade, parser export, or mutable runtime state.

## Evidence

The verified target may emit `agent-definition`, `handoff-registration`, `instruction-loader`, `language`, `runtime-package`, `schema`, and `tool-registration` evidence. Evidence is source-grounded, references existing regular files, and contains no repository contents, instructions, credentials, tool arguments, or provider payloads.

Agent-definition evidence uses a supported static Agent name only when it satisfies Core's machine-string contract; otherwise it uses the bound runtime-agent symbol. Handoff target names and explicit handoff runtime names are omitted when they cannot satisfy that contract.

## Diagnostics

| Code                                                      | Stable message                                                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `OPENAI_AGENTS_SDK_PACKAGE_MANIFEST_INVALID`              | The owning package manifest is invalid for OpenAI Agents SDK dependency detection.                                 |
| `OPENAI_AGENTS_SDK_VERSION_UNSUPPORTED`                   | The observed OpenAI Agents SDK dependency range is disjoint from the supported range.                              |
| `OPENAI_AGENTS_SDK_SOURCE_TEXT_INVALID`                   | The referenced OpenAI Agents SDK source file is not valid normalized text.                                         |
| `OPENAI_AGENTS_SDK_SOURCE_SYNTAX_INVALID`                 | The referenced OpenAI Agents SDK source file contains invalid TypeScript syntax.                                   |
| `OPENAI_AGENTS_SDK_RUNTIME_AGENT_SYMBOL_NOT_FOUND`        | The declared runtime-agent symbol was not found.                                                                   |
| `OPENAI_AGENTS_SDK_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND`   | The declared instruction-loader symbol was not found.                                                              |
| `OPENAI_AGENTS_SDK_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND`  | The declared agent output-schema symbol was not found.                                                             |
| `OPENAI_AGENTS_SDK_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND`  | The declared tool-implementation symbol was not found.                                                             |
| `OPENAI_AGENTS_SDK_TOOL_REGISTRATION_SYMBOL_NOT_FOUND`    | The declared tool-registration symbol was not found.                                                               |
| `OPENAI_AGENTS_SDK_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND`    | The declared tool input-schema symbol was not found.                                                               |
| `OPENAI_AGENTS_SDK_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND`   | The declared tool output-schema symbol was not found.                                                              |
| `OPENAI_AGENTS_SDK_INSTRUCTION_LOADER_NOT_WIRED`          | The declared instruction loader is not wired to the detected OpenAI Agents SDK agent.                              |
| `OPENAI_AGENTS_SDK_AGENT_OUTPUT_SCHEMA_NOT_WIRED`         | The declared agent output schema is not wired to the detected OpenAI Agents SDK agent output type.                 |
| `OPENAI_AGENTS_SDK_TOOL_IMPLEMENTATION_NOT_WIRED`         | The declared tool implementation is not wired to the detected OpenAI Agents SDK function tool.                     |
| `OPENAI_AGENTS_SDK_TOOL_REGISTRATION_NOT_WIRED`           | The declared tool registration is not wired to the detected OpenAI Agents SDK agent.                               |
| `OPENAI_AGENTS_SDK_TOOL_NAME_MISMATCH`                    | The declared tool name does not match the detected OpenAI Agents SDK function-tool name.                           |
| `OPENAI_AGENTS_SDK_TOOL_INPUT_SCHEMA_NOT_WIRED`           | The declared tool input schema is not wired to the detected OpenAI Agents SDK function tool.                       |
| `OPENAI_AGENTS_SDK_TOOL_OUTPUT_SCHEMA_NOT_WIRED`          | The declared tool output schema is not wired to the detected OpenAI Agents SDK function tool.                      |
| `OPENAI_AGENTS_SDK_HANDOFF_TARGET_AMBIGUOUS`              | The detected OpenAI Agents SDK handoff target matches more than one registered moldea agent.                       |
| `OPENAI_AGENTS_SDK_HANDOFF_ROUTING_DESCRIPTION_MISSING`   | The detected OpenAI Agents SDK handoff registration is missing its effective routing description.                  |
| `OPENAI_AGENTS_SDK_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED` | The detected OpenAI Agents SDK handoff registration does not use the target agent's effective routing description. |

Missing local runtime evidence is not a diagnostic. Dynamic or unsupported forms produce partial or no evidence rather than guessed failures.

## Development

From the monorepo root:

```bash
pnpm --filter @moldea.ai/adapter-openai-agents-sdk test
pnpm --filter @moldea.ai/adapter-openai-agents-sdk typecheck
pnpm --filter @moldea.ai/adapter-openai-agents-sdk lint
pnpm --filter @moldea.ai/adapter-openai-agents-sdk build
```

Unit and integration tests are colocated with their implementation modules. Adapter-specific conformance fixtures live under `/fixtures/adapter-openai-agents-sdk`.
