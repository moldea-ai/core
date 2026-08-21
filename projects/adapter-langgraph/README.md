# `@moldea.ai/adapter-langgraph`

Deterministic runtime evidence and diagnostics for LangGraph `1.4.x` TypeScript Graph API and Functional API workflows declared by `moldea` agents.

## Installation

```bash
pnpm add @moldea.ai/adapter-langgraph @moldea.ai/core @moldea.ai/repository
```

The package exports one immutable adapter:

```typescript
import { langGraphAdapter } from '@moldea.ai/adapter-langgraph';
import { createCore } from '@moldea.ai/core';

const core = createCore({ adapters: [langGraphAdapter] });
```

## Verified targets

Version `1.0.0` supports Repository Format `1`, `@langchain/langgraph >=1.4.12 <1.5.0`, and companion `@langchain/core >=1.2.9 <1.3.0`. The experimental targets recognize:

- directly exported compiled `StateGraph` definitions using supported inline fluent or single-owner module-local builders
- closed modern Graph API schema initialization and direct input/output schema wiring
- supported node, direct-edge, waiting-edge, and conditional-edge operations
- directly exported Functional API `entrypoint(...)` definitions
- direct task, interrupt, previous-state, and final-state patterns in an entrypoint's own lexical body

The adapter reads source through the Repository contract. It does not execute LangGraph, import inspected modules, inspect lockfiles or installed packages, contact LangSmith or model providers, or write to the repository.

## Public API

The package exports only `langGraphAdapter`. It has no default export, configuration factory, LangGraph facade, parser export, or public diagnostic registry.

## Documentation

- [Package overview](docs/index.md)
- [Verified targets](docs/verified-target.md)
- [Evidence and diagnostics](docs/evidence-and-diagnostics.md)
- [Limitations](docs/limitations.md)
