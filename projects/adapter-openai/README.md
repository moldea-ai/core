![moldea OpenAI adapter](cover.png)

# `@moldea.ai/adapter-openai`

Deterministic runtime evidence and diagnostics for direct OpenAI SDK integrations declared by `moldea` agents.

The package implements the official `openai` runtime adapter for `@moldea.ai/core`. It statically inspects explicitly bound repository source through Core's source-neutral reader. It never imports or calls the OpenAI SDK, requires no API key, executes no repository code, and makes no network request.

Its behavior is intentionally uneventful: the same repository snapshot and resource limits produce the same normalized result.

## Supported target

Version `2.0.4` experimentally supports:

- Repository Format version `1`
- `@moldea.ai/core ^2.0.0`
- TypeScript ESM source
- npm `openai >=7.4.0 <8.0.0`
- a default `openai` import and module-local client
- a bound exported runtime-agent function containing one or more direct `client.responses.create({ ... })` object-literal calls
- direct instruction-loader wiring through `instructions`, with optional direct `await`
- static OpenAI function-tool registrations through a closed inline or immutable module-local `tools` array
- direct tool input-schema wiring through `parameters`

Module bindings must remain lexically visible at each matched use. Parameters and local declarations that shadow an OpenAI client, instruction loader, tool registration, or input schema do not establish evidence.

Request closure is evaluated independently for `instructions` and `tools`. Unrelated statically named properties are ignored even when their values are dynamic, while exact shorthand relationship properties are treated as direct identifier values. Relationship-affecting computed members, spreads, duplicate effective properties, methods, getters, and setters leave only the affected relationship unresolved. Positive evidence is existential across supported calls; a negative wiring diagnostic requires every relevant supported call to prove the relationship absent with no unresolved candidate.

Supported function-tool objects require exact `type`, `name`, `parameters`, and `strict` properties and may include a supported static or `null` `description`. Statically named `allowed_callers`, `defer_loading`, and `output_schema` properties are tolerated without interpreting their values. Unknown properties and unsupported object-member forms leave the registration unestablished. Inline schema values support recursive static strings, no-substitution templates, signed numbers, booleans, `null`, arrays without holes or spreads, and objects with exact identifier or string-literal property assignments; the adapter proves wiring, not OpenAI schema validity.

The Runtime Compatibility Matrix is authoritative for current target maturity, exact versions, evidence, binding support, patterns, and known limitations.

## Usage

```typescript
import { createCore } from '@moldea.ai/core';
import { openAiAdapter } from '@moldea.ai/adapter-openai';

const core = createCore({ adapters: [openAiAdapter] });
```

The local CLI bundles active official adapters automatically. Applications composing Core directly register the immutable singleton explicitly.

## Public exports

The package exports only the immutable `openAiAdapter` singleton. It has no default export, configuration factory, diagnostic registry, OpenAI client wrapper, parser export, or mutable runtime state.

## Evidence

The initial target may emit `runtime-package`, `language`, `runtime-pattern`, `instruction-loader`, `tool-registration`, and `schema` evidence. Evidence is source-grounded, references existing regular files, and contains no repository contents, instructions, credentials, tool arguments, or provider payloads.

## Diagnostics

| Code                                         | Stable message                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `OPENAI_PACKAGE_MANIFEST_INVALID`            | The owning package manifest is invalid for OpenAI dependency detection.                      |
| `OPENAI_SDK_VERSION_UNSUPPORTED`             | The observed OpenAI SDK dependency range is disjoint from the supported range.               |
| `OPENAI_SOURCE_TEXT_INVALID`                 | The referenced OpenAI source file is not valid normalized text.                              |
| `OPENAI_SOURCE_SYNTAX_INVALID`               | The referenced OpenAI source file contains invalid TypeScript syntax.                        |
| `OPENAI_RUNTIME_AGENT_SYMBOL_NOT_FOUND`      | The declared runtime-agent symbol was not found.                                             |
| `OPENAI_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND` | The declared instruction-loader symbol was not found.                                        |
| `OPENAI_TOOL_REGISTRATION_SYMBOL_NOT_FOUND`  | The declared tool-registration symbol was not found.                                         |
| `OPENAI_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND`  | The declared tool input-schema symbol was not found.                                         |
| `OPENAI_INSTRUCTION_LOADER_NOT_WIRED`        | The declared instruction loader is not wired to the detected Responses API call.             |
| `OPENAI_TOOL_REGISTRATION_NOT_WIRED`         | The declared tool registration is not wired to the detected Responses API call.              |
| `OPENAI_TOOL_NAME_MISMATCH`                  | The declared tool name does not match the detected OpenAI function-tool name.                |
| `OPENAI_TOOL_INPUT_SCHEMA_NOT_WIRED`         | The declared tool input schema is not wired to the detected OpenAI function-tool parameters. |

Missing local runtime evidence is not a diagnostic. Dynamic or indirect patterns that cannot be resolved without execution produce partial or no evidence rather than guessed failures. Chat Completions and other OpenAI APIs are not rejected merely because the initial verified target uses Responses.

Package detection stops at the nearest existing `package.json` that owns each runtime-agent source. Every `openai` declaration in its supported dependency fields is retained as agent-scoped evidence when the collective range is supported or ambiguous; a collectively disjoint range emits the unsupported-version diagnostic without package evidence. Invalid UTF-8 or NUL in the owning manifest produces only `OPENAI_PACKAGE_MANIFEST_INVALID`; `OPENAI_SOURCE_TEXT_INVALID` is reserved for referenced TypeScript source files.

## Development

From the monorepo root:

```bash
pnpm --filter @moldea.ai/adapter-openai test
pnpm --filter @moldea.ai/adapter-openai typecheck
pnpm --filter @moldea.ai/adapter-openai lint
pnpm --filter @moldea.ai/adapter-openai build
```

Unit and integration tests are colocated with their implementation modules. Adapter-specific conformance fixtures live under `/fixtures/adapter-openai`.
