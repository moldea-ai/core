---
title: Evidence and diagnostics
description: Emitted evidence, stable diagnostics, availability, and all-or-nothing Core integration.
order: 20
---

# Evidence and diagnostics

## Evidence

The target may emit `runtime-package`, `language`, `runtime-pattern`, `agent-definition`, `instruction-loader`, `schema`, `tool-registration`, and `handoff-registration` evidence.

`runtime-pattern` identifies a direct query wrapper. `agent-definition` identifies a supported immutable programmatic definition. `handoff-registration` requires an active query context whose built-in `Agent` tool is available. `tool-registration` requires a canonical server key, an exact fully qualified runtime name, and available query or subagent tool state.

Evidence contains no repository content, prompts, descriptions, credentials, API keys, tool arguments, provider payloads, MCP results, session transcripts, or model responses. Missing local evidence is not itself a diagnostic.

## Diagnostic catalog

The package owns the stable codes documented in its package README. They cover invalid package or source state, missing bound symbols, unwired instruction/schema/tool relationships, unsupported MCP server keys, tool-name mismatches, ambiguous subagent targets, and missing or mismatched routing descriptions.

Diagnostics use Core's shared adapter shape, preserve logical source locations, and remain deterministically ordered. Dynamic or indirect patterns yield partial or no evidence rather than guessed failures. Core validates adapter output and applies all-or-nothing inspection semantics.

`CLAUDE_AGENT_SDK_TOOL_NAME_MISMATCH` and `CLAUDE_AGENT_SDK_TOOL_REGISTRATION_NOT_WIRED` are mutually exclusive for one closed registration analysis: an exact tool mounted only under the wrong runtime name produces the mismatch, while complete absence produces not wired.

## Package detection

Detection stops at the nearest existing `package.json` owning each runtime-agent source. Supported dependency fields are considered collectively. A collectively disjoint range produces the unsupported-version diagnostic without package evidence; an ambiguous range remains evidence rather than being promoted to verified support. Invalid UTF-8 or NUL in the owning manifest produces only `CLAUDE_AGENT_SDK_PACKAGE_MANIFEST_INVALID`; source text failures remain source diagnostics.
