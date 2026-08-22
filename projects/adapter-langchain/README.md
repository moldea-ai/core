# `@moldea.ai/adapter-langchain`

Deterministic runtime evidence and diagnostics for LangChain `1.5.x` TypeScript `createAgent` applications declared by `moldea` agents.

## Installation

```bash
pnpm add @moldea.ai/adapter-langchain @moldea.ai/core @moldea.ai/repository
```

The package exports one immutable adapter:

```typescript
import { langChainAdapter } from '@moldea.ai/adapter-langchain';
import { createCore } from '@moldea.ai/core';

const core = createCore({ adapters: [langChainAdapter] });
```

## Verified target

Version `1.0.2` supports Repository Format `1`, `langchain >=1.5.9 <1.6.0`, and companion `@langchain/core >=1.2.8 <1.3.0`. The verified target recognizes:

- directly exported package-root `createAgent(...)` definitions
- direct instruction-loader calls and `SystemMessage` construction
- direct, `toolStrategy(...)`, and `providerStrategy(...)` output-schema relationships
- normal two-argument `tool(implementation, fields)` declarations
- closed inline, module-local, and relative-imported tool arrays

The adapter reads source through the Repository contract. It does not execute LangChain, import inspected modules, inspect lockfiles or installed packages, contact LangSmith or model providers, or write to the repository.

## Public API

The package exports only `langChainAdapter`. It has no default export, configuration factory, LangChain or LangGraph facade, parser export, or public diagnostic registry.

## Documentation

- [Package overview](docs/index.md)
- [Verified target](docs/verified-target.md)
- [Evidence and diagnostics](docs/evidence-and-diagnostics.md)
- [Limitations](docs/limitations.md)
