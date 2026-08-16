---
title: Core
navigationTitle: Overview
description: Source-neutral, deterministic parsing, inspection, indexing, and runtime-adapter composition for moldea repositories.
order: 0
---

# Deterministic repository interpretation

`@moldea.ai/core` is the source-neutral interpretation layer for the `moldea` repository format. It accepts caller-supplied text or an `IRepositoryReader`, validates the universal repository contract, creates an immutable project index, and invokes explicitly configured runtime adapters only after universal validation succeeds.

Core never discovers or reads a filesystem, Git provider, or network on its own. This boundary keeps repository acquisition in reader packages and local composition in the CLI.

## Available now

- strict text normalization and normalized SHA-256 content digests
- all-or-nothing Repository Format version 1 manifest and decision parsing
- canonical repository discovery and complete project inspection
- immutable project indexes and deterministic diagnostic ordering
- built-in `custom` runtime validation
- all-or-nothing invocation of configured package-backed runtime adapters
- bounded repository reads, diagnostics, and adapter evidence

## Entry points

- `@moldea.ai/core` exposes Core construction, results, diagnostics, limits, and exceptions.
- `@moldea.ai/core/format` exposes Repository Format value contracts.
- `@moldea.ai/core/adapter` exposes the runtime-adapter extension contract.

Core does not own source discovery, repository writes, Git behavior, runtime execution, provider API calls, model calls, or semantic Assurance judgments. Use the generated [API reference](./api/) for the exact public surface.
