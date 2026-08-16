---
title: Runtime adapters
description: Built-in custom behavior, the package adapter contract, invocation lifecycle, evidence, and failure semantics.
order: 40
---

# Runtime adapters

Runtime adapters extend deterministic repository interpretation for one approved runtime. They inspect source already exposed by the supplied repository reader; they are not runtime SDK wrappers and do not execute an agent.

```typescript
import { createCore } from '@moldea.ai/core';
import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';

export const createRuntimeAwareCore = (adapter: IRuntimeAdapter) => {
  return createCore({ adapters: [adapter] });
};
```

## Built-in `custom`

`custom` is recognized and validated by Core without a separate package. Project-local runtime guidance is required because no provider-specific adapter can infer a custom integration. It must never be installed or documented as `@moldea.ai/adapter-custom`.

## Invocation lifecycle

Core validates and detaches adapter definitions during `createCore`. During inspection it completes universal validation, checks that declared package-backed adapters are registered and support the repository format, then invokes active adapters in deterministic ID order with the immutable provisional project, matching agents, budget-aware reader, and shared cancellation signal.

An adapter returns evidence plus adapter diagnostics. Core validates every result, enforces output limits, normalizes ordering, and creates the final result. A thrown adapter error or malformed output becomes `ADAPTER_EXECUTION_FAILED`; partial evidence or diagnostics from the failed run are not exposed.

## Evidence

Evidence records source-grounded observations such as a runtime package, language, runtime pattern, instruction-loader wiring, schema wiring, or tool registration. Records identify logical sources and relevant agents or capabilities without including repository content, secrets, model input, tool arguments, or provider payloads.

The [Runtime Compatibility Matrix](/compatibility/) is the only authority for approved adapter IDs, implementation state, target maturity, evidence kinds, binding support, supported patterns, provider limits, and verification dates.
