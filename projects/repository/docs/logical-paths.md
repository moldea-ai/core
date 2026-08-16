---
title: Logical paths and entries
navigationTitle: Paths and entries
description: Portable path grammar, exact entry classification, and symlink boundaries for repository snapshots.
order: 10
---

# Logical paths and entries

Repository paths are absolute inside one logical snapshot. `/` is the repository root; `/moldea/moldea.yaml` identifies one exact entry. These values are not host paths or URLs.

```typescript
import { REPOSITORY_ROOT, isRepositoryPath, parseRepositoryPath } from '@moldea.ai/repository';

const manifestPath = parseRepositoryPath('/moldea/moldea.yaml');

isRepositoryPath(manifestPath); // true
REPOSITORY_ROOT; // '/'
```

Parsing rejects empty, relative, dot-segment, trailing-separator, control-character, backslash, drive-letter, URL, and unpaired-surrogate forms. Paths preserve exact case and Unicode scalar values. The package performs no Unicode normalization, case folding, percent decoding, or host-path conversion.

## Entry classification

`IRepositoryEntry` classifies an exact logical path as `file`, `directory`, or `symlink`. The common contract does not expose host paths, permissions, timestamps, inode identities, symlink targets, or source-specific metadata.

Symlinks are entries, not transparent redirections. Readers return their type but do not follow them through the common contract. Reading a symlink as a file fails with `ENTRY_NOT_FILE`.

## Exact bytes

`readFile` returns a fresh, caller-owned `Uint8Array`. A reader must not return a mutable view of its internal cache, and a caller's mutation must not affect future reads. The repository package does not decode or normalize those bytes; text interpretation belongs to Core.
