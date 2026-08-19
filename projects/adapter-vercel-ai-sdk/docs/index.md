---
title: Vercel AI SDK runtime adapter
navigationTitle: Overview
description: Deterministic evidence and diagnostics for the verified Vercel AI SDK TypeScript targets.
order: 0
---

# Vercel AI SDK runtime adapter

`@moldea.ai/adapter-vercel-ai-sdk` implements the official `vercel-ai-sdk` runtime adapter for Core. It statically inspects explicitly bound TypeScript source through Core's source-neutral repository reader and produces deterministic evidence and diagnostics for `ToolLoopAgent` definitions, direct generation wrappers, structured output, and function tools.

```typescript
import { vercelAiSdkAdapter } from '@moldea.ai/adapter-vercel-ai-sdk';
import { createCore } from '@moldea.ai/core';

const core = createCore({ adapters: [vercelAiSdkAdapter] });
```

The local CLI registers the adapter automatically. Applications composing Core directly register the immutable singleton explicitly.

## Current state

The package is available. Its experimental targets use TypeScript ESM and npm `ai >=7.0.66 <8.0.0` with Repository Format version `1` and compatible Core `^2.0.0`.

The adapter never imports or calls the SDK, requires no API key, executes no repository code, and makes no network request. It proves supported static relationships; it does not verify credentials, provider behavior, model availability, tool execution, or schema semantics.

## Public surface

The package exports only `vercelAiSdkAdapter`. It has no default export, configuration factory, SDK facade, parser export, public diagnostic registry, or mutable runtime state. The generated [API reference](./api/) derives that surface from the package export.
