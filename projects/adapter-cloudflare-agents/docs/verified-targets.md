---
title: Verified targets
description: Exact Cloudflare package ranges and statically supported integration patterns.
order: 10
---

# Verified targets

## Think 0.16 with AI SDK 7

The `typescript-think-0-16-ai-sdk-7` target requires `@cloudflare/think >=0.16.0 <0.17.0`, `agents >=0.21.0 <0.22.0`, and `ai >=7.0.0 <8.0.0`.

The runtime agent must be a directly exported class extending an exact named `Think` import. Instructions may come from a direct loader call returned by `getSystemPrompt` or from the supported closed `configureSession` chain. Function tools and handoffs must be active in a closed `getTools` map. This target emits no `runtime-pattern` evidence and supports no agent input or output schema binding.

## AIChatAgent 0.10 with AI SDK 7

The `typescript-ai-chat-agent-0-10-ai-sdk-7` target requires `@cloudflare/ai-chat >=0.10.2 <0.11.0`, `agents >=0.21.0 <0.22.0`, and `ai >=7.0.0 <8.0.0`.

The runtime agent must be a directly exported class extending an exact named `AIChatAgent` import. Its supported `onChatMessage(onFinish, options?)` method contains direct `generateText({ ... })` or `streamText({ ... })` calls in its own lexical body. `instructions` takes precedence over `system`; `prepareStep` makes instructions unresolved. Agent output schemas use `Output.object({ schema })`.

Both targets require closed class initialization, named ESM imports, normalized `.ts`, `.tsx`, or `.mts` text, and exact relative ESM binding resolution.
