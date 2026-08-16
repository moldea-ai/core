---
title: Repository inspection
description: Canonical discovery, project indexes, relationship validation, security boundaries, and all-or-nothing results.
order: 20
---

# Repository inspection

`inspectProject` consumes one coherent `IRepositoryReader`. Core discovers canonical `moldea/**` assets, reads only paths required by the format and configured adapters, validates structural relationships, and returns one deeply immutable result.

```typescript
import { createCore } from '@moldea.ai/core';
import type { IRepositoryReader } from '@moldea.ai/repository';

export const inspect = async (repository: IRepositoryReader) => {
  return createCore().inspectProject({ repository });
};
```

## Project index

A valid `IMoldeaProjectIndex` contains the normalized manifest and project description, context assets, decisions, runtime guidance, agents, unresolved requirements, mirrors, relationships, and content digests needed to reason about one repository state. Canonical normalized content is intentionally present in the index; callers must protect serialized inspection output.

Core checks exact canonical paths, regular-file requirements, reference targets, decision graphs, active relationships, agent identity and descriptions, instruction variables, capability declarations, mirror consistency, and runtime availability. It does not fetch missing content or infer relationships that are absent from the repository contract.

## All-or-nothing semantics

Universal validation completes before package-backed adapter invocation. If universal diagnostics exist, `project` is `null`, evidence is empty, and adapters are not called. Adapter diagnostics likewise make the final result invalid and remove the project index rather than returning a partially trusted index.

Operational failures—reader access, snapshot loss, cancellation, resource exhaustion, or an invalid adapter result—throw typed exceptions instead of becoming repository diagnostics. This separates malformed repository content from an operation that could not be completed reliably.

## Security and source neutrality

Core treats repository bytes as untrusted, executes no repository code, follows no symlink, receives no host path or source credential, and performs no network access. Its results and diagnostics use logical repository paths only.
