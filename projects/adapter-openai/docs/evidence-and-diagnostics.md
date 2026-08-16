---
title: Evidence and diagnostics
description: Emitted evidence kinds, deterministic diagnostic contracts, ambiguity, and all-or-nothing integration with Core.
order: 20
---

# Evidence and diagnostics

## Evidence

The verified target may emit `runtime-package`, `language`, `runtime-pattern`, `instruction-loader`, `tool-registration`, and `schema` evidence. Records are grounded in existing logical source references and may identify the relevant agent or capability.

Evidence contains no repository content, agent instructions, credentials, API keys, tool arguments, provider payloads, or model responses. Missing local evidence is not itself a diagnostic.

## Diagnostic catalog

| Code                                         | Meaning                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `OPENAI_PACKAGE_MANIFEST_INVALID`            | The owning package manifest cannot establish valid dependency data.      |
| `OPENAI_SDK_VERSION_UNSUPPORTED`             | The observed OpenAI range is disjoint from the verified range.           |
| `OPENAI_SOURCE_TEXT_INVALID`                 | The source is not valid normalized text.                                 |
| `OPENAI_SOURCE_SYNTAX_INVALID`               | The source contains invalid TypeScript syntax.                           |
| `OPENAI_RUNTIME_AGENT_SYMBOL_NOT_FOUND`      | The bound runtime-agent symbol is absent.                                |
| `OPENAI_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND` | The bound instruction-loader symbol is absent.                           |
| `OPENAI_TOOL_REGISTRATION_SYMBOL_NOT_FOUND`  | The bound tool-registration symbol is absent.                            |
| `OPENAI_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND`  | The bound input-schema symbol is absent.                                 |
| `OPENAI_INSTRUCTION_LOADER_NOT_WIRED`        | Every supported resolved request proves the loader absent.               |
| `OPENAI_TOOL_REGISTRATION_NOT_WIRED`         | Every supported resolved request proves the tool registration absent.    |
| `OPENAI_TOOL_NAME_MISMATCH`                  | A detected OpenAI function-tool name contradicts the declared tool name. |
| `OPENAI_TOOL_INPUT_SCHEMA_NOT_WIRED`         | Resolved parameters do not wire the declared input schema.               |

Diagnostics use the shared Core adapter shape, preserve logical source locations, and remain deterministically ordered. Dynamic or indirect patterns yield partial or no evidence rather than guessed failures. Core validates adapter output and applies all-or-nothing inspection semantics.

## Package detection

Detection stops at the nearest existing `package.json` owning each runtime-agent source. Supported dependency fields are considered collectively. A collectively disjoint range produces the unsupported-version diagnostic without package evidence; an ambiguous range remains evidence rather than being promoted to verified support.
