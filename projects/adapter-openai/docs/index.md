---
title: OpenAI runtime adapter
navigationTitle: Overview
description: Deterministic evidence and diagnostics for the verified direct OpenAI SDK Responses API target.
order: 0
---

# OpenAI runtime adapter

`@moldea.ai/adapter-openai` implements the official `openai` runtime adapter for Core. It statically inspects explicitly bound TypeScript source through Core's source-neutral repository reader and produces deterministic evidence and diagnostics for one verified direct OpenAI SDK pattern.

```typescript
import { openAiAdapter } from '@moldea.ai/adapter-openai';
import { createCore } from '@moldea.ai/core';

const core = createCore({ adapters: [openAiAdapter] });
```

The local CLI registers the adapter automatically. Applications composing Core directly register the immutable singleton explicitly.

## Current state

The package is available. Its current technical compatibility target covers TypeScript ESM using direct OpenAI Responses API calls with npm `openai >=7.4.0 <8.0.0`, Repository Format version `1`, and compatible Core `^2.0.0`.

The adapter never imports or calls the OpenAI SDK, requires no API key, executes no repository code, and makes no network request. It proves supported static relationships in source; it does not verify provider behavior, credentials, model availability, request execution, streaming, retries, or response semantics.

## Public surface

The package exports only `openAiAdapter`. It has no default export, configuration factory, OpenAI client wrapper, parser export, public diagnostic registry, or mutable runtime state. The generated [API reference](./api/) derives that surface from the package export.
