---
title: Selection and snapshots
description: Exact-path and recursive inventory rules, host-to-logical mapping, symlinks, and coherent capture.
order: 10
---

# Selection and snapshots

Reader creation requires an absolute `rootDirectory` and one explicit selection strategy.

```typescript
import { parseRepositoryPath } from '@moldea.ai/repository';
import { createFilesystemRepositoryReader } from '@moldea.ai/repository-fs';

const reader = await createFilesystemRepositoryReader({
  rootDirectory: '/absolute/path/to/repository',
  selection: {
    kind: 'paths',
    paths: [parseRepositoryPath('/moldea/moldea.yaml')],
  },
});
```

## Exact-path selection

Exact selection includes the requested entries and the directory parents needed to represent them. Input order has no semantic meaning. `/`, duplicates, an exact `.git` segment, missing selected entries, and unsupported entry types fail creation rather than producing a partial reader.

Native directory names are matched against the exact UTF-8 bytes of each requested segment. The reader does not case-fold or normalize Unicode. Unrelated sibling activity does not invalidate an exact selection because membership outside the selected tree is not part of that snapshot.

## Recursive-directory selection

Recursive selection includes every representable regular file, directory, and symlink under the root. Hidden and ignored-looking names are ordinary entries. A name exactly equal to `.git` is omitted at every depth before traversal; `.GIT`, `.gitignore`, `.gitattributes`, and `.github` remain visible.

Directory identities and complete eligible child-name sets are verified. Physical aliases, cycles, unsupported types, undecodable names, entry-limit overflow, or membership changes fail the complete operation.

## Symlinks and redirection

The caller-selected root may itself be a symlink or junction; its resolved target becomes the fixed boundary. Descendant symlinks and junctions remain logical symlink entries and are never traversed. Regular-file capture revalidates the complete root-to-file path and uses no-follow observations so replacement or redirection becomes `SNAPSHOT_CHANGED` rather than silently reading another file.
