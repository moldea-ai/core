# `@moldea.ai/repository-fs`

Node.js-specific foundations for exposing one explicitly selected local directory through the source-neutral repository contract.

The current unpublished `0.0.1` foundation defines the complete version 1 option, selection, and resource-limit contracts. It validates and detaches caller options, internally canonicalizes an explicit filesystem root, constructs and verifies strict private exact-path and recursive-directory inventories, provides frozen lookup and recursive listing, and captures verified file bytes into a private immutable cache. The public reader factory is intentionally withheld until permanent invalidation and operation coordination can be published with these completed internal behaviors.

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

## Internal inventories

### Exact-path inventory

Exact-path construction expands selected paths into a deterministic set of selected entries and required directory parents. The root does not count against `maxEntries`; every other selected or synthesized entry does. Entry limits are checked before filesystem traversal, and no partial inventory is returned on failure.

Required directory names are read as native bytes and matched against the exact UTF-8 encoding of each requested logical segment. Matched names are decoded with fatal UTF-8 handling and without Unicode normalization. This preserves exact case and spelling, rejects unrepresentable selected names, and allows unrelated invalid sibling names to remain outside a narrow exact selection. An exact `.git` segment is prohibited, while `.gitignore`, `.gitattributes`, and `.github` remain ordinary names.

Entries are classified with no-follow `lstat` behavior as regular files, directories, or symlinks. Selected directories are not expanded recursively. Symlinks and junctions may be selected as entries but are never traversed for descendants, and unsupported filesystem entry types fail the complete construction operation.

### Recursive directory inventory

Directory construction recursively includes every representable regular file, directory, and symlink beneath the resolved root. Empty directories, hidden names, ignored-looking content, dependencies, caches, and nested repository content remain ordinary entries. An entry named exactly `.git` is omitted at every depth before decoding or traversal, while `.GIT`, `.gitignore`, `.gitattributes`, and `.github` remain visible.

Each directory's native names are decoded strictly and ordered by exact logical path before traversal. Directory identities are tracked to reject physical aliases or cycles. Symlinks and junctions remain entries without recursion, unsupported entry types fail the complete operation, and `maxEntries` is enforced without truncating the inventory.

### Fingerprints and creation-time verification

Every regular-file entry retains a private creation-time fingerprint containing stable identity, size, mode, and nanosecond modification metadata. Root and directory entries retain stable identities without membership timestamps, so unrelated sibling activity does not invalidate an exact-path selection.

Exact-path verification rechecks required raw segment spellings, selected entry types, regular-file fingerprints, and required directory-component identities while continuing to ignore unrelated sibling content. Recursive verification rechecks every entry type, file fingerprint, traversed directory identity, and complete eligible child-name set after `.git` exclusion. A detected mismatch fails the complete operation with `SNAPSHOT_CHANGED`; partial verified inventories are never returned.

Verified inventories feed private frozen lookup and recursive-listing operations. These operations validate logical paths at runtime, return detached common entries without private filesystem metadata, honor operation cancellation, preserve exact prefix boundaries, and perform no additional host access. Missing lookup paths return `null`; missing and non-directory listing prefixes use the common `ENTRY_NOT_FOUND` and `ENTRY_NOT_DIRECTORY` contracts.

### Verified file capture and caching

Private file-read operations classify paths from the frozen inventory before host access. Missing paths use `ENTRY_NOT_FOUND`, while the root, directories, and symlinks use `ENTRY_NOT_FILE`. An already captured file is served entirely from the private cache.

The first read of a regular file revalidates the resolved root and every frozen directory component with no-follow metadata, opens the selected file with the strongest no-follow behavior exposed by the runtime, and compares both the open handle and current path with the creation-time fingerprint. It enforces `maxFileBytes` and the remaining `maxCachedBytes` budget before allocating the exact expected length, reads in bounded chunks, and repeats handle and path-chain verification before committing bytes.

Only a complete verified capture enters the cache. Failed, cancelled, oversized, truncated, replaced, redirected, or otherwise changed captures commit no bytes and consume no cache budget. Each captured path counts once, repeated reads perform no host access, and every result is a fresh `Uint8Array` detached from both the cache and every other caller result. Later host modification or deletion therefore cannot alter successfully cached bytes.

Permanent invalidation, coordinated concurrent first reads, atomic concurrent reservations, the shared reader conformance boundary, and the public factory remain subsequent implementation phases.

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
