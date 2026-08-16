---
title: Diagnostics
description: Navigable diagnostic taxonomy, normalized shape, stable ordering, limits, and operational exceptions.
order: 30
---

# Diagnostics

Diagnostics describe repository content that Core successfully inspected and found invalid. Operational exceptions instead mean that configuration was invalid or inspection could not be completed reliably.

Every diagnostic has a stable `source` and `code`, a human message, a logical path or `null`, optional JSON Pointer and scalar-based normalized source range, optional entity identity, and JSON-safe details. Consumers should branch on `source` and `code`, not message text.

## Diagnostic catalog

The public `ICoreDiagnosticCode` union is the machine-readable catalog. The groups below make that catalog navigable without changing its exact exported values.

### [Discovery and text](#discovery-and-text)

Manifest presence, canonical paths, entry types, UTF-8 or Unicode validity, NUL, and empty text use `MOLDEA_MANIFEST_*`, `MOLDEA_PROJECT_FILE_*`, `MOLDEA_ENTRY_TYPE_INVALID`, `MOLDEA_CANONICAL_*`, and `MOLDEA_TEXT_*` codes.

### [YAML and manifest values](#yaml-and-manifest-values)

Malformed or unsupported YAML and invalid Repository Format fields use `MOLDEA_YAML_*`, `MOLDEA_MANIFEST_*`, `MOLDEA_ID_*`, `MOLDEA_VARIABLE_ID_INVALID`, `MOLDEA_PATH_*`, `MOLDEA_GLOB_INVALID`, and `MOLDEA_PATTERN_DUPLICATE` codes.

### [References, context, and decisions](#references-context-and-decisions)

Missing or invalid references, context relationships, runtime guidance, and decision files or graphs use `MOLDEA_IMPACT_*`, `MOLDEA_REFERENCE_*`, `MOLDEA_SYMBOL_*`, `MOLDEA_CONTEXT_*`, `MOLDEA_RUNTIME_GUIDANCE_*`, and `MOLDEA_DECISION_*` codes.

### [Agents and capabilities](#agents-and-capabilities)

Agent directories, identity, descriptions, instructions, variables, runtime availability, tools, and skills use `MOLDEA_AGENT_*`, `MOLDEA_RUNTIME_*`, `MOLDEA_VARIABLE_*`, `MOLDEA_CAPABILITY_*`, `MOLDEA_TOOL_*`, and `MOLDEA_SKILL_*` codes.

### [Mirrors](#mirrors)

Mirror path validity, presence, type, and digest coherence use `MOLDEA_MIRROR_*` codes.

## Ordering and limits

Core normalizes diagnostics into deterministic order using their source location and identity fields rather than discovery or adapter completion timing. `maxDiagnostics` bounds raw diagnostic production; exceeding it raises `RESOURCE_LIMIT_EXCEEDED` instead of silently truncating the invalid state.

Adapter diagnostics use the same normalized shape but retain the adapter ID as `source` and adapter-owned string codes. Their exact catalogs belong to the adapter packages, such as the [OpenAI adapter diagnostics](/adapters/openai/evidence-and-diagnostics/).

## Operational exceptions

`CoreConfigurationException` reports invalid limits or adapter registration. `CoreOperationException` reports invalid operation arguments, resource exhaustion, cancellation, or adapter execution failure. Repository reader exceptions propagate through the inspection boundary. None of these are converted into content diagnostics.
