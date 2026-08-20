---
title: Evidence and diagnostics
description: Source-grounded LangChain observations and stable adapter failures.
order: 20
---

# Evidence and diagnostics

The adapter may emit `runtime-package`, `language`, `agent-definition`, `instruction-loader`, `schema`, and `tool-registration` evidence. Dynamic, middleware-influenced, multi-schema, or otherwise unresolved forms suppress optimistic evidence and contradiction diagnostics that would require guessing runtime behavior.

## Stable diagnostics

| Code                                             | Message                                                                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `LANGCHAIN_PACKAGE_MANIFEST_INVALID`             | The owning package manifest is invalid for LangChain dependency detection.                               |
| `LANGCHAIN_VERSION_UNSUPPORTED`                  | The observed LangChain package ranges are disjoint from the supported target.                            |
| `LANGCHAIN_SOURCE_TEXT_INVALID`                  | The referenced LangChain source file is not valid normalized text.                                       |
| `LANGCHAIN_SOURCE_SYNTAX_INVALID`                | The referenced LangChain source file contains invalid TypeScript syntax.                                 |
| `LANGCHAIN_RUNTIME_AGENT_SYMBOL_NOT_FOUND`       | The declared runtime-agent symbol was not found.                                                         |
| `LANGCHAIN_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND`  | The declared instruction-loader symbol was not found.                                                    |
| `LANGCHAIN_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND` | The declared agent output-schema symbol was not found.                                                   |
| `LANGCHAIN_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND` | The declared tool-implementation symbol was not found.                                                   |
| `LANGCHAIN_TOOL_REGISTRATION_SYMBOL_NOT_FOUND`   | The declared tool-registration symbol was not found.                                                     |
| `LANGCHAIN_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND`   | The declared tool input-schema symbol was not found.                                                     |
| `LANGCHAIN_INSTRUCTION_LOADER_NOT_WIRED`         | The declared instruction loader is not wired to the detected LangChain agent.                            |
| `LANGCHAIN_AGENT_OUTPUT_SCHEMA_NOT_WIRED`        | The declared agent output schema is not wired to the detected LangChain structured-output configuration. |
| `LANGCHAIN_TOOL_IMPLEMENTATION_NOT_WIRED`        | The declared tool implementation is not wired to the detected LangChain function tool.                   |
| `LANGCHAIN_TOOL_REGISTRATION_NOT_WIRED`          | The declared tool registration is not available to the detected LangChain agent.                         |
| `LANGCHAIN_TOOL_NAME_MISMATCH`                   | The declared tool name does not match the detected LangChain tool name.                                  |
| `LANGCHAIN_TOOL_INPUT_SCHEMA_NOT_WIRED`          | The declared tool input schema is not wired to the detected LangChain function tool.                     |

Diagnostics never include source snippets, descriptions, instructions, schema contents, credentials, URLs, host paths, package declarations that are not valid SemVer ranges, or raw TypeScript diagnostic messages.
