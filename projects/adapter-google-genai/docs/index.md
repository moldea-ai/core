---
title: Google Gen AI runtime adapter
navigationTitle: Overview
description: Deterministic evidence and diagnostics for the verified direct Google Gen AI models.generateContent target.
order: 0
---

# Google Gen AI runtime adapter

`@moldea.ai/adapter-google-genai` implements the official `google-genai` runtime adapter for Core. It statically inspects explicitly bound TypeScript source through Core's source-neutral repository reader.

```typescript
import { googleGenAiAdapter } from '@moldea.ai/adapter-google-genai';
import { createCore } from '@moldea.ai/core';

const core = createCore({ adapters: [googleGenAiAdapter] });
```

The package is available with one technical target covering TypeScript ESM using direct `models.generateContent` calls with npm `@google/genai >=2.17.1 <3.0.0`, Repository Format version `1`, and Core `^2.0.0`.

The adapter never imports or calls the Google Gen AI SDK, executes no repository code, requires no credentials, and makes no network request. Its only public export is the immutable `googleGenAiAdapter` singleton.
