# `@moldea.ai/repository-fs`

Node.js-specific foundations for exposing one explicitly selected local directory through the source-neutral repository contract.

The current unpublished `0.0.1` foundation defines the complete version 1 option, selection, and resource-limit contracts. It also validates and detaches caller options and internally canonicalizes an explicit filesystem root with safe common repository exceptions. The public reader factory is intentionally withheld until exact path inventory and coherent reader behavior can be published together.

Tarball and consumer-type checks are the release boundary for now. This package is not ready to publish to npm.

## Responsibility

The completed reader will be read-only and Git-agnostic. Callers provide one absolute host root and explicitly choose either exact logical paths or a recursive raw-directory selection. The package will not discover a Git root, parse ignore rules, decide tracked state, interpret repository content, follow below-root symlinks, or expose host paths through the common reader contract.

Raw directory selection can include ignored files, credentials, caches, dependencies, and generated output. Callers that own a narrower trust policy should derive an exact logical-path inventory outside this package.

## Public foundation

```typescript
import { parseRepositoryPath } from '@moldea.ai/repository';
import {
  DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS,
  type IFilesystemRepositoryReaderOptions,
} from '@moldea.ai/repository-fs';

const options: IFilesystemRepositoryReaderOptions = {
  rootDirectory: '/absolute/path/to/repository',
  selection: {
    kind: 'paths',
    paths: [parseRepositoryPath('/moldea/moldea.yaml')],
  },
};

DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS;
void options;
```

The selection strategy is required. Exact-path arrays are sets with no semantic input order; `/` and exact duplicates are invalid. Directory selection is deliberately explicit because it requests the complete eligible raw tree.

## Default limits

| Limit            |           Default |
| ---------------- | ----------------: |
| `maxEntries`     |          `100000` |
| `maxFileBytes`   |   `8388608` bytes |
| `maxCachedBytes` | `134217728` bytes |

The exported default object is frozen. Configured limits must be positive safe integers, and omitted values inherit these defaults.

## Validation and root behavior

Options, selection objects, and limit objects are closed version 1 contracts. Reader construction will snapshot caller-owned configuration before asynchronous work while retaining the supplied `AbortSignal` as a live reference.

The host root must be non-empty absolute Unicode-scalar text without NUL. Internal root preparation resolves that explicitly selected root once, requires a directory, captures its stable identity, and revalidates it before later inventory phases can use it. A caller-selected symlink or junction root is allowed; the resolved target becomes the fixed boundary.

Malformed logical paths use `RepositoryPathException`. Other invalid configuration and filesystem failures use `RepositorySourceException` from `@moldea.ai/repository`, with `operation: 'create-reader'` and no exposed host path. Root preparation currently maps absence, non-directory targets, access denial, source failure, cancellation, and detected replacement to their corresponding common codes.

## Runtime support

The version 1 consumer runtime range is:

```text
^22.11.0 || ^24.11.0
```

The package uses Node.js filesystem and path facilities and is not browser-compatible.

## Development

From the monorepo root:

```bash
pnpm --filter @moldea.ai/repository-fs typecheck
pnpm --filter @moldea.ai/repository-fs build
pnpm --filter @moldea.ai/repository-fs test:unit
pnpm --filter @moldea.ai/repository-fs test:integration
pnpm --filter @moldea.ai/repository-fs test
```

Unit and integration tests are colocated with their owning modules. Integration tests use isolated temporary directories and validate real package tarballs together with `@moldea.ai/repository`.
