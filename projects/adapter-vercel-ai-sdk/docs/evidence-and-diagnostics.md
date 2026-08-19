---
title: Evidence and diagnostics
description: Emitted evidence, stable diagnostics, package detection, and conservative uncertainty.
order: 20
---

# Evidence and diagnostics

## Evidence

The targets may emit `runtime-package`, `language`, `agent-definition`, `runtime-pattern`, `instruction-loader`, `schema`, and `tool-registration` evidence.

`agent-definition` identifies a supported immutable `ToolLoopAgent`. `runtime-pattern` identifies a supported direct `generateText` or `streamText` wrapper. Schema evidence identifies `agent-input`, `agent-output`, `tool-input`, or `tool-output`. Tool registration requires an exact bound function-tool value under a tools-map key matching the manifest tool name.

Evidence contains no repository content, instructions, descriptions, credentials, model values, tool arguments, provider payloads, request data, response data, or model output. Missing local evidence is not itself a diagnostic.

## Diagnostic catalog

The package owns the stable codes documented in its package README. They cover invalid package or source state, missing bound symbols, unwired instruction/schema/tool relationships, and tool-name mismatches.

Diagnostics use Core's shared adapter shape, preserve logical source locations, and remain deterministically ordered. Dynamic or indirect patterns yield partial or no evidence rather than guessed failures. Core validates adapter output and applies all-or-nothing inspection semantics.

`VERCEL_AI_SDK_TOOL_NAME_MISMATCH` and `VERCEL_AI_SDK_TOOL_REGISTRATION_NOT_WIRED` are mutually exclusive for one closed analysis: an exact registration found only under another key produces the mismatch, while complete absence produces not wired.

## Package detection

Detection stops at the nearest existing `package.json` owning each runtime-agent source. Supported dependency fields are considered collectively. A collectively disjoint range produces the unsupported-version diagnostic without package evidence; an ambiguous range remains evidence rather than being promoted to verified support. Invalid UTF-8 or NUL in the owning manifest produces only `VERCEL_AI_SDK_PACKAGE_MANIFEST_INVALID`; source text failures remain source diagnostics.
