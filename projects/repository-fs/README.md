# `@moldea.ai/repository-fs`

Node.js-specific implementation for exposing one explicitly selected local directory through the source-neutral repository contract.

The current unpublished `0.0.1` package exposes the complete version 1 option, selection, resource-limit, and immutable reader contracts. Its public factory validates and detaches caller options, canonicalizes an explicit filesystem root, constructs and verifies strict private exact-path or recursive-directory inventories, provides frozen lookup and recursive listing, coordinates verified file capture into a private immutable cache, and permanently invalidates that shared state after snapshot loss. The filesystem implementation passes the same source-neutral reader conformance contract as `@moldea.ai/repository/memory`.

Tarball and consumer-type checks are the release boundary for now. This package is not ready to publish to npm.

## Responsibility

The completed reader will be read-only and Git-agnostic. Callers provide one absolute host root and explicitly choose either exact logical paths or a recursive raw-directory selection. The package will not discover a Git root, parse ignore rules, decide tracked state, interpret repository content, follow below-root symlinks, or expose host paths through the common reader contract.

Raw directory selection can include ignored files, credentials, caches, dependencies, and generated output. Callers that own a narrower trust policy should derive an exact logical-path inventory outside this package.

## Public reader

```typescript
import { parseRepositoryPath } from '@moldea.ai/repository';
import {
  DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS,
  createFilesystemRepositoryReader,
  type IFilesystemRepositoryReaderOptions,
} from '@moldea.ai/repository-fs';

const options: IFilesystemRepositoryReaderOptions = {
  rootDirectory: '/absolute/path/to/repository',
  selection: {
    kind: 'paths',
    paths: [parseRepositoryPath('/moldea/moldea.yaml')],
  },
};

const reader = await createFilesystemRepositoryReader(options);
const entry = await reader.getEntry(parseRepositoryPath('/moldea/moldea.yaml'));

DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS;
void entry;
```

The returned reader is frozen and exposes only `getEntry`, `listEntries`, and `readFile`. The selection strategy is required. Exact-path arrays are sets with no semantic input order; `/` and exact duplicates are invalid. Directory selection is deliberately explicit because it requests the complete eligible raw tree.

## Default limits

| Limit            |           Default |
| ---------------- | ----------------: |
| `maxEntries`     |          `100000` |
| `maxFileBytes`   |   `8388608` bytes |
| `maxCachedBytes` | `134217728` bytes |

The exported default object is frozen. Configured limits must be positive safe integers, and omitted values inherit these defaults.

## Validation and root behavior

Options, selection objects, and limit objects are closed version 1 contracts. Reader construction snapshots caller-owned configuration before asynchronous work while retaining the supplied creation `AbortSignal` as a live reference. That signal governs construction only; later operations use only their own explicitly supplied signals.

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

The first read of a regular file revalidates the resolved root and every frozen directory component with no-follow metadata, opens the selected file with the strongest no-follow behavior exposed by the runtime, and compares both the open handle and current path with the creation-time fingerprint. It enforces `maxFileBytes` and the atomically reserved `maxCachedBytes` budget before allocating the exact expected length, reads in bounded chunks, and repeats handle and path-chain verification before committing bytes.

Only a complete verified capture enters the cache. Failed, cancelled, oversized, truncated, replaced, redirected, or otherwise changed captures commit no bytes and consume no cache budget. Each captured path counts once, repeated reads perform no host access, and every result is a fresh `Uint8Array` detached from both the cache and every other caller result. Later host modification or deletion therefore cannot alter successfully cached bytes.

Concurrent first reads of the same path share one authoritative physical capture while every caller remains independently cancellable. Cancelling one waiter does not cancel work still required by another; cancelling the final waiter abandons the capture, waits for coherence-aware cleanup, and releases its reservation without caching partial bytes. A new read waits for an abandoned capture to finish cleanup before retrying. Different paths can capture concurrently.

Every new path reserves its exact frozen length synchronously before asynchronous host work. Reservation registration order therefore determines capacity ownership independently of filesystem completion order, and committed plus in-flight bytes can never exceed `maxCachedBytes`. A denied reservation still performs the required coherence preflight before returning `RESOURCE_LIMIT_EXCEEDED`, so snapshot loss retains precedence. Failed, cancelled, and invalidated captures release all reservations.

### Permanent invalidation and operation failures

One private reader state now owns the verified inventory, exact-path index, detached limits, immutable byte cache, active capture registry, reserved-byte accounting, and permanent lifecycle. The first detected `SNAPSHOT_CHANGED` failure atomically marks that state invalid, preserves its private cause, aborts every pending capture, clears all reservations and cached bytes, and prevents any active or later lookup, listing, or read from returning repository data. Later failures retain the first invalidation cause while reporting the current operation and safe logical path. Constructing a fresh state from a newly verified inventory is the only recovery path.

File capture distinguishes a stable host access denial (`ACCESS_DENIED`) or other stable I/O failure (`SOURCE_UNAVAILABLE`) from a coherence loss (`SNAPSHOT_CHANGED`). It revalidates the open handle and complete root-to-file path before exposing an observed read failure. A failure that prevents coherence from being proved is treated as snapshot loss. Cancellation becomes `ABORTED` only while the capture remains coherent, failed captures never enter the cache, and a close-only failure does not invalidate an otherwise coherent state.

The public factory is the only reader-construction boundary. It composes root preparation, verified inventory construction, and private state creation without exposing host paths, inventory metadata, cache state, capture coordination, or lifecycle mutation. Its frozen closures delegate the common reader operations to that private state.

## Runtime support

The version 1 consumer runtime range is:

```text
^22.11.0 || ^24.11.0
```

The package uses Node.js filesystem and path facilities and is not browser-compatible.

CI builds the public tarballs on the repository development baseline, then installs and executes them through isolated consumers on Node.js `22.11.0`, the latest Node.js `22.x`, Node.js `24.11.0`, and the latest Node.js `24.x`. The complete filesystem suite also runs on Linux, macOS, and Windows. Consumer runtime compatibility is therefore validated independently from the newer Node.js version used by the repository development toolchain.

## Development

From the monorepo root:

```bash
pnpm --filter @moldea.ai/repository-fs typecheck
pnpm --filter @moldea.ai/repository-fs build
pnpm --filter @moldea.ai/repository-fs test:unit
pnpm --filter @moldea.ai/repository-fs test:integration
pnpm --filter @moldea.ai/repository-fs test
```

Unit and integration tests are colocated with their owning modules. Integration tests materialize the canonical repository-reader fixture in isolated temporary directories, run the shared reader conformance contract, and validate real package tarballs together with `@moldea.ai/repository`.
