---
title: Evidence and diagnostics
description: Emitted evidence, stable diagnostic contracts, ambiguity, and all-or-nothing Core integration.
order: 20
---

# Evidence and diagnostics

## Evidence

The verified target may emit `agent-definition`, `handoff-registration`, `instruction-loader`, `language`, `runtime-package`, `schema`, and `tool-registration` evidence. Records are grounded in existing logical source references and may identify the relevant agent, capability, target agent, configuration property, schema role, or routing-description source.

Agent-definition evidence uses the exact supported static Agent name only when it satisfies Core's non-empty, single-line, NUL-free, Unicode-scalar machine-string contract without surrounding Repository Format whitespace. Otherwise it uses the bound runtime-agent symbol. A target Agent name that cannot satisfy the same contract is omitted from handoff details.

Handoff evidence maps a target only when exactly one registered `moldea` agent has the detected runtime binding. It reports a runtime name only for a supported static, non-empty `toolNameOverride` representable as a Core machine string. The adapter does not invent a manifest handoff graph or SDK-generated default name.

Evidence contains no repository content, instructions, descriptions, credentials, API keys, tool arguments, provider payloads, or model responses. Missing local evidence is not itself a diagnostic.

## Diagnostic catalog

| Code                                                      | Meaning                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `OPENAI_AGENTS_SDK_PACKAGE_MANIFEST_INVALID`              | The owning manifest cannot establish valid dependency data.                              |
| `OPENAI_AGENTS_SDK_VERSION_UNSUPPORTED`                   | The observed SDK range is disjoint from the verified range.                              |
| `OPENAI_AGENTS_SDK_SOURCE_TEXT_INVALID`                   | Referenced source is not valid normalized text.                                          |
| `OPENAI_AGENTS_SDK_SOURCE_SYNTAX_INVALID`                 | Referenced source contains invalid TypeScript syntax.                                    |
| `OPENAI_AGENTS_SDK_RUNTIME_AGENT_SYMBOL_NOT_FOUND`        | The bound runtime-agent symbol is absent.                                                |
| `OPENAI_AGENTS_SDK_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND`   | The bound instruction-loader symbol is absent.                                           |
| `OPENAI_AGENTS_SDK_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND`  | The bound agent output-schema symbol is absent.                                          |
| `OPENAI_AGENTS_SDK_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND`  | The bound tool-implementation symbol is absent.                                          |
| `OPENAI_AGENTS_SDK_TOOL_REGISTRATION_SYMBOL_NOT_FOUND`    | The bound tool-registration symbol is absent.                                            |
| `OPENAI_AGENTS_SDK_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND`    | The bound tool input-schema symbol is absent.                                            |
| `OPENAI_AGENTS_SDK_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND`   | The bound tool output-schema symbol is absent.                                           |
| `OPENAI_AGENTS_SDK_INSTRUCTION_LOADER_NOT_WIRED`          | Closed source proves that the declared loader is not used.                               |
| `OPENAI_AGENTS_SDK_AGENT_OUTPUT_SCHEMA_NOT_WIRED`         | Closed source proves that the declared agent output schema is not used.                  |
| `OPENAI_AGENTS_SDK_TOOL_IMPLEMENTATION_NOT_WIRED`         | Closed source proves that the declared tool implementation is not used.                  |
| `OPENAI_AGENTS_SDK_TOOL_REGISTRATION_NOT_WIRED`           | Closed source proves that the declared function tool is not registered on the agent.     |
| `OPENAI_AGENTS_SDK_TOOL_NAME_MISMATCH`                    | A static function-tool name contradicts the declared capability name.                    |
| `OPENAI_AGENTS_SDK_TOOL_INPUT_SCHEMA_NOT_WIRED`           | Closed source proves that the declared tool input schema is not used.                    |
| `OPENAI_AGENTS_SDK_TOOL_OUTPUT_SCHEMA_NOT_WIRED`          | Closed source proves that the declared tool output schema is not used.                   |
| `OPENAI_AGENTS_SDK_HANDOFF_TARGET_AMBIGUOUS`              | A target runtime binding maps to multiple registered agents.                             |
| `OPENAI_AGENTS_SDK_HANDOFF_ROUTING_DESCRIPTION_MISSING`   | A proved handoff registration has no effective canonical routing description.            |
| `OPENAI_AGENTS_SDK_HANDOFF_ROUTING_DESCRIPTION_NOT_WIRED` | A proved handoff uses routing text that differs from its target's effective description. |

Diagnostics use Core's shared adapter shape, preserve logical source locations, and remain deterministically ordered. Dynamic or indirect patterns yield partial or no evidence rather than guessed failures. Core validates adapter output and applies all-or-nothing inspection semantics.

## Package detection

Detection stops at the nearest existing `package.json` owning each runtime-agent source. Supported dependency fields are considered collectively. A collectively disjoint range produces the unsupported-version diagnostic without package evidence; an ambiguous range remains evidence rather than being promoted to verified support. Invalid UTF-8 or NUL in the owning manifest produces only `OPENAI_AGENTS_SDK_PACKAGE_MANIFEST_INVALID`; source text failures remain source diagnostics.
