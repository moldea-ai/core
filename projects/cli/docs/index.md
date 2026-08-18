---
title: Command-line interface
navigationTitle: Overview
description: The canonical read-only local composition for deterministic validation, inspection, and compatibility reporting.
order: 0
---

# The local package composition

`@moldea.ai/cli` provides the `moldea` executable. It discovers a selected Git working tree, derives an exact portable inventory, constructs a guarded filesystem snapshot, runs Core with active official adapters, and emits deterministic human or JSON results.

```bash
pnpm add --global @moldea.ai/cli
moldea validate
```

The package exposes no supported JavaScript or TypeScript import API. Its public contract is the executable, command grammar, output envelopes, status and exit semantics, safe operational errors, and runtime requirements.

## Composition

The CLI composes `@moldea.ai/repository`, `@moldea.ai/repository-fs`, `@moldea.ai/core`, and the currently active package-backed adapters. The `custom` runtime remains built into Core. The Anthropic, Google Gen AI, and OpenAI adapters are active for the matrix's experimental TypeScript Messages, generate-content, and Responses API targets.

The Agent Skill consumes this local executable as its deterministic package layer. Complete skill installation, workflows, and tutorials belong to the separate Agent Skill experience; this documentation covers only the CLI contract.

## Boundaries

The executable performs no network requests, telemetry, repository writes, configured Git content transforms, runtime SDK calls, or model calls. It uses read-only Git operations and no-follow filesystem observations. Core and adapter results preserve their owning contracts rather than being reinterpreted by the CLI.
