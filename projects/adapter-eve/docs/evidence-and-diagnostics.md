---
title: Evidence and diagnostics
description: Source-grounded Eve observations and stable adapter failures.
order: 20
---

# Evidence and diagnostics

The adapter may emit `runtime-package`, `language`, `agent-definition`, `instruction-loader`, `schema`, `tool-registration`, `skill-registration`, and `handoff-registration` evidence. Dynamic or collided forms suppress optimistic evidence and any negative diagnostic that would require selecting an uncertain source.

## Stable diagnostics

| Code                                        | Message                                                                                   |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `EVE_PACKAGE_MANIFEST_INVALID`              | The owning package manifest is invalid for Eve dependency detection.                      |
| `EVE_SDK_VERSION_UNSUPPORTED`               | The observed Eve dependency range is disjoint from the supported range.                   |
| `EVE_SOURCE_TEXT_INVALID`                   | The referenced Eve source file is not valid normalized text.                              |
| `EVE_SOURCE_SYNTAX_INVALID`                 | The referenced Eve source file contains invalid TypeScript syntax.                        |
| `EVE_RUNTIME_AGENT_SYMBOL_NOT_FOUND`        | The declared Eve runtime-agent symbol was not found.                                      |
| `EVE_INSTRUCTION_LOADER_SYMBOL_NOT_FOUND`   | The declared Eve instruction-loader symbol was not found.                                 |
| `EVE_AGENT_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND`  | The declared Eve agent output-schema symbol was not found.                                |
| `EVE_TOOL_IMPLEMENTATION_SYMBOL_NOT_FOUND`  | The declared Eve tool implementation symbol was not found.                                |
| `EVE_TOOL_REGISTRATION_SYMBOL_NOT_FOUND`    | The declared Eve tool registration symbol was not found.                                  |
| `EVE_TOOL_INPUT_SCHEMA_SYMBOL_NOT_FOUND`    | The declared Eve tool input-schema symbol was not found.                                  |
| `EVE_TOOL_OUTPUT_SCHEMA_SYMBOL_NOT_FOUND`   | The declared Eve tool output-schema symbol was not found.                                 |
| `EVE_SKILL_IMPLEMENTATION_SYMBOL_NOT_FOUND` | The declared Eve skill implementation symbol was not found.                               |
| `EVE_SKILL_REGISTRATION_SYMBOL_NOT_FOUND`   | The declared Eve skill registration symbol was not found.                                 |
| `EVE_INSTRUCTION_ROOT_CONFLICT`             | The Eve instruction slot contains conflicting authored sources.                           |
| `EVE_INSTRUCTION_LOADER_NOT_WIRED`          | The declared instruction loader is not wired to the supported Eve instruction surface.    |
| `EVE_AGENT_OUTPUT_SCHEMA_NOT_WIRED`         | The declared agent output schema is not wired to the Eve agent definition.                |
| `EVE_TOOL_IMPLEMENTATION_NOT_WIRED`         | The declared tool implementation is not wired to the Eve tool definition.                 |
| `EVE_TOOL_REGISTRATION_NOT_WIRED`           | The declared tool registration is not wired to the owning Eve agent.                      |
| `EVE_TOOL_NAME_INVALID`                     | The Eve filesystem tool name is invalid.                                                  |
| `EVE_TOOL_NAME_RESERVED`                    | The Eve filesystem tool name is reserved by the runtime.                                  |
| `EVE_TOOL_RUNTIME_NAME_COLLISION`           | Multiple Eve tool sources resolve to the same runtime tool name.                          |
| `EVE_TOOL_NAME_MISMATCH`                    | The declared tool name does not match the Eve path-derived runtime name.                  |
| `EVE_TOOL_INPUT_SCHEMA_NOT_WIRED`           | The declared tool input schema is not wired to the Eve tool definition.                   |
| `EVE_TOOL_OUTPUT_SCHEMA_NOT_WIRED`          | The declared tool output schema is not wired to the Eve tool definition.                  |
| `EVE_SKILL_IMPLEMENTATION_NOT_WIRED`        | The declared skill implementation is not the discovered Eve skill artifact.               |
| `EVE_SKILL_REGISTRATION_NOT_WIRED`          | The declared skill registration is not wired to the owning Eve agent.                     |
| `EVE_SKILL_NAME_MISMATCH`                   | The declared skill name does not match the Eve path-derived runtime name.                 |
| `EVE_TOOL_SUBAGENT_NAME_COLLISION`          | The Eve tool and local subagent use the same runtime tool name.                           |
| `EVE_SUBAGENT_PARENT_AMBIGUOUS`             | Multiple registered Eve agents map to the local subagent's immediate parent root.         |
| `EVE_ROUTING_DESCRIPTION_MISSING`           | The supported Eve local subagent definition is missing its routing description.           |
| `EVE_ROUTING_DESCRIPTION_NOT_WIRED`         | The Eve local subagent description does not use the target effective routing description. |

Diagnostics never include source snippets, descriptions, instructions, schema contents, credentials, URLs, host paths, or raw TypeScript diagnostic messages.
