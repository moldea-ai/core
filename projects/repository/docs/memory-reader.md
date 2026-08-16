---
title: In-memory reader
description: Immutable snapshot construction for deterministic tests, fixtures, and already-fetched repository content.
order: 30
---

# In-memory reader

The `memory` entry point is the reference implementation for deterministic fixtures and content a caller has already fetched.

```typescript
import { parseRepositoryPath } from '@moldea.ai/repository';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

const reader = createMemoryRepositoryReader([
  { path: '/moldea/moldea.yaml', type: 'file', content: 'version: 1\n' },
  { path: '/empty-directory', type: 'directory' },
  { path: '/link', type: 'symlink' },
]);

const bytes = await reader.readFile(parseRepositoryPath('/moldea/moldea.yaml'));
```

Construction validates the complete input, copies file buffers, and synthesizes missing parent directories. Conflicting paths, invalid entry shapes, impossible hierarchies, and duplicate definitions fail atomically with `INVALID_SOURCE_DATA`.

The resulting reader is immutable. It returns detached entries and fresh file buffers, preserves symlinks without following them, and never observes later mutations to the caller's input. This makes it suitable for the shared reader conformance suite and Core tests without introducing filesystem timing or network behavior.
