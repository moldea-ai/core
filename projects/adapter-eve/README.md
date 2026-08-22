# `@moldea.ai/adapter-eve`

Deterministic runtime evidence and diagnostics for Eve `0.39.x` TypeScript filesystem agents declared by `moldea` agents.

## Installation

```bash
pnpm add @moldea.ai/adapter-eve @moldea.ai/core @moldea.ai/repository
```

The package exports one immutable adapter:

```typescript
import { eveAdapter } from '@moldea.ai/adapter-eve';
import { createCore } from '@moldea.ai/core';

const core = createCore({ adapters: [eveAdapter] });
```

## Verified target

Version `1.0.2` supports Repository Format `1` and direct TypeScript Eve filesystem agents using `eve >=0.39.1 <0.40.0`. The verified target recognizes:

- flat and nested root `agent.ts` definitions
- recursive directory-backed local subagents
- exclusive modern Markdown or TypeScript instructions
- recursive `defineTool(...)` modules
- TypeScript `defineSkill(...)` modules
- direct output, input, and output-schema relationships

The adapter reads source through the Repository contract. It does not execute Eve, import inspected modules, resolve installed packages, read lockfiles, or write to the repository.

## Public API

The package exports only `eveAdapter`. It has no default export, configuration factory, Eve SDK facade, parser export, or public diagnostic registry.

## Documentation

- [Package overview](docs/index.md)
- [Verified target](docs/verified-target.md)
- [Evidence and diagnostics](docs/evidence-and-diagnostics.md)
- [Limitations](docs/limitations.md)
