![moldea Cloudflare Agents adapter](cover.png)

# `@moldea.ai/adapter-cloudflare-agents`

Deterministic runtime evidence and diagnostics for Cloudflare `Think` and `AIChatAgent` integrations declared by `moldea` agents.

The package implements the official `cloudflare-agents` runtime adapter for `@moldea.ai/core`. It statically inspects explicitly bound repository source through Core's source-neutral reader. It never imports or executes Cloudflare Agents, requires no Cloudflare account or API key, executes no repository code, and makes no network request.

## Supported targets

Version `1.0.0` experimentally supports:

- Repository Format version `1`
- `@moldea.ai/core ^2.0.0`
- TypeScript ESM `.ts`, `.tsx`, and `.mts` source
- `@cloudflare/think >=0.16.0 <0.17.0`, `agents >=0.21.0 <0.22.0`, and `ai >=7.0.0 <8.0.0`
- `@cloudflare/ai-chat >=0.10.2 <0.11.0`, `agents >=0.21.0 <0.22.0`, and `ai >=7.0.0 <8.0.0`
- directly exported classes extending an exact named `Think` or `AIChatAgent` import
- Think instructions through `getSystemPrompt` and supported `configureSession` chains
- AIChatAgent instructions and structured output through direct `generateText` or `streamText` requests
- AI SDK function tools, closed tools maps, and Cloudflare `agentTool` handoffs

Named value imports and aliases are supported. Default imports, namespace imports, re-export graphs, runtime mutation, and dynamic class or tools-map forms remain outside the verified boundary. The Runtime Compatibility Matrix is authoritative for target maturity, exact versions, evidence, binding support, patterns, and known limitations.

## Usage

```typescript
import { cloudflareAgentsAdapter } from '@moldea.ai/adapter-cloudflare-agents';
import { createCore } from '@moldea.ai/core';

const core = createCore({ adapters: [cloudflareAgentsAdapter] });
```

The local CLI bundles active official adapters automatically. Applications composing Core directly register the immutable singleton explicitly.

## Public exports

The package exports only `cloudflareAgentsAdapter`. It has no default export, configuration factory, diagnostic registry, Cloudflare SDK facade, parser export, tool runtime, or mutable state.

## Evidence

The verified targets may emit `runtime-package`, `language`, `agent-definition`, `runtime-pattern`, `instruction-loader`, `schema`, `tool-registration`, and `handoff-registration` evidence. AIChatAgent direct generation emits `runtime-pattern`; Think does not. Schema details identify the `agent-output`, `tool-input`, or `tool-output` role.

Evidence is source-grounded, references existing repository files, and contains no repository contents, instructions, descriptions, credentials, model identifiers, tool arguments, provider configuration, request or response payloads, or model output.

## Diagnostics

| Code                                                      | Stable message                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `CLOUDFLARE_AGENTS_PACKAGE_MANIFEST_INVALID`              | The owning package manifest is invalid for Cloudflare Agents dependency detection.                                       |
| `CLOUDFLARE_AGENTS_RUNTIME_VERSION_UNSUPPORTED`           | The observed Cloudflare Agents dependency range is disjoint from the supported target.                                   |
| `CLOUDFLARE_AGENTS_SOURCE_TEXT_INVALID`                   | The referenced Cloudflare Agents source file is not valid normalized text.                                               |
| `CLOUDFLARE_AGENTS_SOURCE_SYNTAX_INVALID`                 | The referenced Cloudflare Agents source file contains invalid TypeScript syntax.                                         |
| `CLOUDFLARE_AGENTS_RUNTIME_AGENT_SYMBOL_NOT_FOUND`        | The declared runtime-agent symbol was not found.                                                                         |
| `CLOUDFLARE_AGENTS_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND`   | The declared instruction-loader symbol was not found.                                                                    |
| `CLOUDFLARE_AGENTS_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND`  | The declared agent output-schema symbol was not found.                                                                   |
| `CLOUDFLARE_AGENTS_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND`  | The declared tool-implementation symbol was not found.                                                                   |
| `CLOUDFLARE_AGENTS_TOOL_REGISTRATION_SYMBOL_NOT_FOUND`    | The declared tool-registration symbol was not found.                                                                     |
| `CLOUDFLARE_AGENTS_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND`    | The declared tool input-schema symbol was not found.                                                                     |
| `CLOUDFLARE_AGENTS_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND`   | The declared tool output-schema symbol was not found.                                                                    |
| `CLOUDFLARE_AGENTS_INSTRUCTION_LOADER_NOT_WIRED`          | The declared instruction loader is not wired to a supported configured Cloudflare agent instruction source.              |
| `CLOUDFLARE_AGENTS_AGENT_OUTPUT_SCHEMA_NOT_WIRED`         | The declared agent output schema is not wired to the detected AIChatAgent structured output.                             |
| `CLOUDFLARE_AGENTS_TOOL_IMPLEMENTATION_NOT_WIRED`         | The declared tool implementation is not wired to the detected Cloudflare agent function tool.                            |
| `CLOUDFLARE_AGENTS_TOOL_REGISTRATION_NOT_WIRED`           | The declared tool registration is not wired to the detected Cloudflare agent tools map.                                  |
| `CLOUDFLARE_AGENTS_TOOL_NAME_MISMATCH`                    | The declared tool name does not match the detected Cloudflare agent tools-map key.                                       |
| `CLOUDFLARE_AGENTS_TOOL_INPUT_SCHEMA_NOT_WIRED`           | The declared tool input schema is not wired to the detected Cloudflare agent function tool.                              |
| `CLOUDFLARE_AGENTS_TOOL_OUTPUT_SCHEMA_NOT_WIRED`          | The declared tool output schema is not wired to the detected Cloudflare agent function tool.                             |
| `CLOUDFLARE_AGENTS_HANDOFF_TARGET_AMBIGUOUS`              | The detected Cloudflare agent-tool target maps to more than one registered agent.                                        |
| `CLOUDFLARE_AGENTS_HANDOFF_ROUTING_DESCRIPTION_MISSING`   | The detected Cloudflare agent-tool routing description is missing.                                                       |
| `CLOUDFLARE_AGENTS_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED` | The detected Cloudflare agent-tool routing description is not wired to the target agent's effective routing description. |

## Documentation

- [Adapter contract](docs/index.md)
- [Verified targets](docs/verified-targets.md)
- [Evidence and diagnostics](docs/evidence-and-diagnostics.md)
- [Boundaries and limitations](docs/limitations.md)
