---
title: Reader contract
description: Snapshot consistency, operations, cancellation, concurrency, and the source-neutral exception model.
order: 20
---

# Reader contract

One `IRepositoryReader` represents one coherent repository snapshot for its complete lifetime.

```typescript
import { parseRepositoryPath, type IRepositoryReader } from '@moldea.ai/repository';

export const readManifest = async (reader: IRepositoryReader): Promise<Uint8Array> => {
  return reader.readFile(parseRepositoryPath('/moldea/moldea.yaml'));
};
```

## Operations

- `getEntry(path, options?)` performs exact lookup and returns `null` when the path is absent.
- `listEntries(path, options?)` recursively lists descendants of a directory. Enumeration order has no contract meaning.
- `readFile(path, options?)` returns the exact bytes of one regular file.

Every operation accepts its own `AbortSignal`. Aborting one call does not alter the reader's snapshot contract or implicitly cancel another caller. A concrete reader may coordinate concurrent work internally, but each caller observes only the public operation result.

## Snapshot consistency

A reader never combines observations from incompatible source states. Source implementations must either preserve the snapshot or fail. The common `SNAPSHOT_CHANGED` code tells consumers that coherence was lost and a fresh reader is required; it does not authorize returning partial or mixed data.

## Exceptions

Malformed logical paths raise `RepositoryPathException`. Operational source failures raise `RepositorySourceException` with a stable code, operation, safe logical path when applicable, and retryability. Codes distinguish missing entries, type mismatches, access denial, source unavailability, invalid source data, resource exhaustion, cancellation, and snapshot loss.

These exceptions do not expose host paths, credentials, provider responses, or raw source causes as public data. Consumers should catch the concrete repository exception classes rather than depend on their shared base implementation.
