# `@moldea.ai/adapter-anthropic`

Deterministic runtime evidence and diagnostics for direct Anthropic SDK integrations.

Version `1.0.0` experimentally supports:

- TypeScript ESM source in `.ts`, `.tsx`, and `.mts` files
- `@anthropic-ai/sdk >=0.117.1 <0.118.0`
- `@moldea.ai/core ^2.0.0`
- Repository Format version `1`
- direct `client.messages.create(...)` calls
- instruction loaders wired through `system`
- closed client-tool arrays and direct `input_schema` bindings

The adapter performs static inspection only. It does not import or execute the Anthropic SDK, send provider requests, validate model output, or interpret streaming behavior.

## Usage

```ts
import { createCore } from '@moldea.ai/core';
import { anthropicAdapter } from '@moldea.ai/adapter-anthropic';

const core = createCore({ adapters: [anthropicAdapter] });
```

See [`docs/`](./docs/index.md) for the verified target, evidence, diagnostics, and limitations.
