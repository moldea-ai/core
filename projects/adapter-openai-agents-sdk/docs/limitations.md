---
title: Boundaries and limitations
description: Unsupported SDK surfaces, source forms, dynamic behavior, and the adapter security boundary.
order: 30
---

# Boundaries and limitations

The current verified target does not claim support for:

- JavaScript, Python, CommonJS, or source outside the verified TypeScript ESM boundary
- `@openai/agents-core`, `@openai/agents-realtime`, sandbox agents, or subpath imports
- custom `Handoff` construction, dynamically assembled agent graphs, or manager-style agents as tools
- hosted, MCP-generated, namespaced, or tool-search tools
- arbitrary compiler resolution, `tsconfig` path aliases, directory indexes, package exports, or re-export graphs
- runtime-generated or transformed routing descriptions
- omitted function-tool names or names requiring SDK normalization
- schema-content validation
- handoff input schemas, callbacks, filters, enablement, runtime variables, guardrails, prompt templates, sessions, tracing, approvals, models, or provider behavior

Package detection uses nearest manifests, not lockfiles or installed `node_modules`. Static dependency ranges are observations; the adapter does not prove which package build executes at runtime.

The adapter sees only repository entries Core supplies through `IRepositoryReader`. It receives no host path, OpenAI credential, environment variable, network client, or runtime process. It does not execute TypeScript, dynamically import source, load the inspected SDK, or follow source symlinks. These constraints preserve deterministic, source-grounded behavior while deliberately leaving dynamic runtime semantics unresolved.

The [Runtime Compatibility Matrix](/compatibility/) remains authoritative. A focused specification or future design does not broaden this page until the canonical matrix and released implementation do.
