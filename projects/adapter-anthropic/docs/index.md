---
title: Anthropic runtime adapter
navigationTitle: Overview
description: Deterministic evidence and diagnostics for the verified direct Anthropic SDK Messages API target.
order: 0
---

# Anthropic runtime adapter

`@moldea.ai/adapter-anthropic` implements the official `anthropic` runtime adapter for Core. It statically inspects explicitly bound TypeScript source through Core's source-neutral repository reader and produces deterministic evidence and diagnostics for one verified direct Anthropic SDK pattern.

```typescript
import { anthropicAdapter } from '@moldea.ai/adapter-anthropic';
import { createCore } from '@moldea.ai/core';

const core = createCore({ adapters: [anthropicAdapter] });
```

The local CLI registers the adapter automatically. Applications composing Core directly register the immutable singleton explicitly.

## Current state

The package is available. Its current technical compatibility target covers TypeScript ESM using direct Anthropic Messages API calls with npm `@anthropic-ai/sdk >=0.117.1 <0.118.0`, Repository Format version `1`, and compatible Core `^2.0.0`.

The adapter never imports or calls the Anthropic SDK, requires no API key, executes no repository code, and makes no network request. It proves supported static relationships in source; it does not verify provider behavior, credentials, model availability, request execution, streaming, retries, or response semantics.

## Public surface

The package exports only `anthropicAdapter`. It has no default export, configuration factory, Anthropic client wrapper, parser export, public diagnostic registry, or mutable runtime state. The generated [API reference](./api/) derives that surface from the package export.
