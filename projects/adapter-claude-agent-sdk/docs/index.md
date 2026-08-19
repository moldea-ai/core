---
title: Claude Agent SDK runtime adapter
navigationTitle: Overview
description: Deterministic evidence and diagnostics for the verified Claude Agent SDK TypeScript target.
order: 0
---

# Claude Agent SDK runtime adapter

`@moldea.ai/adapter-claude-agent-sdk` implements the official `claude-agent-sdk` runtime adapter for Core. It statically inspects explicitly bound TypeScript source through Core's source-neutral repository reader and produces deterministic evidence and diagnostics for query wrappers, programmatic subagents, structured output, SDK MCP tools, and routing descriptions.

```typescript
import { claudeAgentSdkAdapter } from '@moldea.ai/adapter-claude-agent-sdk';
import { createCore } from '@moldea.ai/core';

const core = createCore({ adapters: [claudeAgentSdkAdapter] });
```

The local CLI registers the adapter automatically. Applications composing Core directly register the immutable singleton explicitly.

## Current state

The package is available. Its experimental target is TypeScript ESM using npm `@anthropic-ai/claude-agent-sdk >=0.3.234 <0.4.0`, Repository Format version `1`, and compatible Core `^2.0.0`.

The adapter never imports or calls the SDK, requires no API key, executes no repository code, and makes no network request. It proves supported static relationships; it does not verify credentials, settings, provider behavior, model availability, permission decisions, actual delegation, tool execution, or schema semantics.

## Public surface

The package exports only `claudeAgentSdkAdapter`. It has no default export, configuration factory, SDK facade, parser export, public diagnostic registry, or mutable runtime state. The generated [API reference](./api/) derives that surface from the package export.
