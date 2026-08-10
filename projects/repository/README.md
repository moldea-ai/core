# `@moldea.ai/repository`

Source-neutral, read-only repository contracts for the `moldea` ecosystem.

One reader represents one coherent repository snapshot through portable logical paths. The package
does not access a filesystem or network, interpret the `moldea` format, follow symlinks, decode file
content, or expose write operations.

## Install

```bash
pnpm add @moldea.ai/repository
```

## Logical paths

Repository paths are root-absolute within a logical snapshot. They are not host-machine paths.
Validate arbitrary strings before passing them to a reader:

```typescript
import { REPOSITORY_ROOT, isRepositoryPath, parseRepositoryPath } from '@moldea.ai/repository';

const manifestPath = parseRepositoryPath('/moldea/moldea.yaml');

isRepositoryPath(manifestPath); // true
REPOSITORY_ROOT; // '/'
```

Paths use `/`, preserve exact case and Unicode, and reject empty, dot, control-character, backslash,
drive-letter, URL, trailing-separator, and unpaired-surrogate forms. No Unicode normalization or URL
decoding is performed.

## Reader contract

```typescript
import type { IRepositoryReader } from '@moldea.ai/repository';
import { parseRepositoryPath } from '@moldea.ai/repository';

const readManifest = async (reader: IRepositoryReader): Promise<Uint8Array> => {
  return reader.readFile(parseRepositoryPath('/moldea/moldea.yaml'));
};
```

`getEntry` performs exact lookup, `readFile` returns caller-owned exact bytes, and `listEntries`
recursively enumerates directory descendants. All operations accept `AbortSignal`. Enumeration order
has no contract meaning.

Operational failures use `RepositorySourceException`; malformed logical paths use
`RepositoryPathException`. These exception classes extend `Exception` from `error-message-utils`,
but consumers only need to catch the concrete repository exceptions.

## Immutable memory reader

The `memory` subpath provides the baseline implementation for fixtures and already-fetched content:

```typescript
import { parseRepositoryPath } from '@moldea.ai/repository';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

const reader = createMemoryRepositoryReader([
  {
    path: '/moldea/moldea.yaml',
    type: 'file',
    content: 'format: 1\n',
  },
  {
    path: '/empty-directory',
    type: 'directory',
  },
  {
    path: '/link',
    type: 'symlink',
  },
]);

const bytes = await reader.readFile(parseRepositoryPath('/moldea/moldea.yaml'));
```

The reader copies input buffers, synthesizes missing parent directories, returns fresh output
buffers, preserves symlinks without following them, and remains immutable for its complete lifetime.

## Development

From the monorepo root:

```bash
pnpm --filter @moldea.ai/repository typecheck
pnpm --filter @moldea.ai/repository build
pnpm --filter @moldea.ai/repository test:unit
pnpm --filter @moldea.ai/repository test:integration
pnpm --filter @moldea.ai/repository test
```

Unit and integration tests are colocated with the source modules they exercise. The `test` command
runs both suites. The shared reader conformance suite is owned by this project. Repository-format
fixtures and diagnostics belong to `@moldea.ai/core`, not this package.
