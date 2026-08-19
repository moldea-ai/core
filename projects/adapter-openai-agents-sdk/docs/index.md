---
title: OpenAI Agents SDK runtime adapter
navigationTitle: Overview
description: Deterministic evidence and diagnostics for the verified OpenAI Agents SDK TypeScript target.
order: 0
---

# OpenAI Agents SDK runtime adapter

`@moldea.ai/adapter-openai-agents-sdk` implements the official `openai-agents-sdk` runtime adapter for Core. It statically inspects explicitly bound TypeScript source through Core's source-neutral repository reader and produces deterministic evidence and diagnostics for one verified SDK target.

```typescript
import { openAiAgentsSdkAdapter } from '@moldea.ai/adapter-openai-agents-sdk';
import { createCore } from '@moldea.ai/core';

const core = createCore({ adapters: [openAiAgentsSdkAdapter] });
```

The local CLI registers the adapter automatically. Applications composing Core directly register the immutable singleton explicitly.

## Current state

The package is available. Its only current compatibility target is **experimental**: TypeScript ESM using direct OpenAI Agents SDK agent, instruction, function-tool, schema, handoff, and routing-description patterns with npm `@openai/agents >=0.16.1 <0.17.0`, Repository Format version `1`, and compatible Core `^2.0.0`.

The adapter never imports or calls the SDK, requires no API key, executes no repository code, and makes no network request. It proves supported static relationships in source; it does not verify credentials, provider behavior, runtime handoff decisions, model availability, prompts, tool execution, or schema semantics.

## Public surface

The package exports only `openAiAgentsSdkAdapter`. It has no default export, configuration factory, SDK facade, parser export, public diagnostic registry, or mutable runtime state. The generated [API reference](./api/) derives that surface from the package export.
