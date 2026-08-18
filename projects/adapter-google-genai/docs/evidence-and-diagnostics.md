---
title: Evidence and diagnostics
description: Evidence kinds, stable diagnostics, conservative ambiguity, and cascade suppression.
order: 20
---

# Evidence and diagnostics

The target may emit `runtime-package`, `language`, `runtime-pattern`, `instruction-loader`, `tool-registration`, and `schema` evidence. Records identify only safe scalar metadata and logical source references.

## Diagnostic catalog

| Code                                               | Stable message                                                                                             |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GOOGLE_GENAI_PACKAGE_MANIFEST_INVALID`            | The owning package manifest is invalid for Google Gen AI dependency detection.                             |
| `GOOGLE_GENAI_SDK_VERSION_UNSUPPORTED`             | The observed Google Gen AI SDK dependency range is disjoint from the supported range.                      |
| `GOOGLE_GENAI_SOURCE_TEXT_INVALID`                 | The referenced Google Gen AI source file is not valid normalized text.                                     |
| `GOOGLE_GENAI_SOURCE_SYNTAX_INVALID`               | The referenced Google Gen AI source file contains invalid TypeScript syntax.                               |
| `GOOGLE_GENAI_RUNTIME_AGENT_SYMBOL_NOT_FOUND`      | The declared runtime-agent symbol was not found.                                                           |
| `GOOGLE_GENAI_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND` | The declared instruction-loader symbol was not found.                                                      |
| `GOOGLE_GENAI_TOOL_REGISTRATION_SYMBOL_NOT_FOUND`  | The declared tool-registration symbol was not found.                                                       |
| `GOOGLE_GENAI_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND`  | The declared tool input-schema symbol was not found.                                                       |
| `GOOGLE_GENAI_INSTRUCTION_LOADER_NOT_WIRED`        | The declared instruction loader is not wired to the detected Google Gen AI generate-content configuration. |
| `GOOGLE_GENAI_TOOL_REGISTRATION_NOT_WIRED`         | The declared tool registration is not wired to the detected Google Gen AI function-declaration collection. |
| `GOOGLE_GENAI_TOOL_NAME_MISMATCH`                  | The declared tool name does not match the detected Google Gen AI function name.                            |
| `GOOGLE_GENAI_TOOL_NAME_INVALID`                   | The detected Google Gen AI function name violates the supported SDK declaration limit.                     |
| `GOOGLE_GENAI_TOOL_INPUT_SCHEMA_NOT_WIRED`         | The declared tool input schema is not wired to the detected function declaration's parameters JSON schema. |
| `GOOGLE_GENAI_FUNCTION_DECLARATION_LIMIT_EXCEEDED` | The detected Google Gen AI function-declaration collection exceeds the supported SDK declaration limit.    |

Invalid text or syntax suppresses derived symbol and relationship diagnostics for that source. Missing symbols suppress their derived wiring diagnostics. Unsupported or dynamic requests, configurations, collections, containers, registrations, or schema values suppress negative relationship diagnostics when they could contain the declared relationship. Independently proved package, name, and collection-limit diagnostics remain observable.
