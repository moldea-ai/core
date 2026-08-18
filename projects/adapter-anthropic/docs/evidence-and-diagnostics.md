---
title: Evidence and diagnostics
description: Emitted evidence kinds, stable diagnostic contracts, ambiguity, and Core integration.
order: 20
---

# Evidence and diagnostics

## Evidence

The verified target may emit `runtime-package`, `language`, `runtime-pattern`, `instruction-loader`, `tool-registration`, and `schema` evidence. Records are grounded in existing logical source references and may identify the relevant agent or tool capability.

Evidence contains no repository content, instructions, system prompts, credentials, API keys, tool arguments, provider payloads, or model messages. Missing local evidence is not itself a diagnostic.

## Diagnostic catalog

| Code                                            | Stable message                                                                                  |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `ANTHROPIC_PACKAGE_MANIFEST_INVALID`            | The owning package manifest is invalid for Anthropic dependency detection.                      |
| `ANTHROPIC_SDK_VERSION_UNSUPPORTED`             | The observed Anthropic SDK dependency range is disjoint from the supported range.               |
| `ANTHROPIC_SOURCE_TEXT_INVALID`                 | The referenced Anthropic source file is not valid normalized text.                              |
| `ANTHROPIC_SOURCE_SYNTAX_INVALID`               | The referenced Anthropic source file contains invalid TypeScript syntax.                        |
| `ANTHROPIC_RUNTIME_AGENT_SYMBOL_NOT_FOUND`      | The declared runtime-agent symbol was not found.                                                |
| `ANTHROPIC_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND` | The declared instruction-loader symbol was not found.                                           |
| `ANTHROPIC_TOOL_REGISTRATION_SYMBOL_NOT_FOUND`  | The declared tool-registration symbol was not found.                                            |
| `ANTHROPIC_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND`  | The declared tool input-schema symbol was not found.                                            |
| `ANTHROPIC_INSTRUCTION_LOADER_NOT_WIRED`        | The declared instruction loader is not wired to the detected Anthropic Messages API call.       |
| `ANTHROPIC_TOOL_REGISTRATION_NOT_WIRED`         | The declared tool registration is not wired to the detected Anthropic Messages API call.        |
| `ANTHROPIC_TOOL_NAME_MISMATCH`                  | The declared tool name does not match the detected Anthropic client-tool name.                  |
| `ANTHROPIC_TOOL_NAME_INVALID`                   | The detected Anthropic client-tool name violates the supported provider limit.                  |
| `ANTHROPIC_TOOL_INPUT_SCHEMA_NOT_WIRED`         | The declared tool input schema is not wired to the detected Anthropic client-tool input schema. |

Diagnostics use Core's adapter shape, preserve logical source locations, identify the scoped agent or tool when applicable, and remain deterministically ordered. Dynamic or indirect patterns yield partial or no evidence instead of guessed failures.

## Package detection

Detection stops at the nearest existing `package.json` owning each runtime-agent source. Dependency declarations across `dependencies`, `optionalDependencies`, `peerDependencies`, and `devDependencies` are considered collectively. A collectively disjoint range produces the unsupported-version diagnostic; an ambiguous range remains observational evidence. Invalid UTF-8 or NUL in the owning manifest produces only `ANTHROPIC_PACKAGE_MANIFEST_INVALID`; `ANTHROPIC_SOURCE_TEXT_INVALID` is reserved for referenced TypeScript source files.
