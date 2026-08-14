# `@moldea.ai/core`

Source-neutral, deterministic interpretation of the `moldea` repository format.

The version 1 package surface accepts caller-supplied text documents and source-neutral repository readers. It does not access a filesystem, Git provider, or network independently. Invalid repository content produces stable diagnostics, while invalid configuration and operational failures use typed exceptions. Strict version 1 manifest and decision parsing, complete repository inspection, deterministic project indexing, built-in custom-runtime behavior, and all-or-nothing package-backed runtime-adapter execution are available now. Tarball and consumer-type checks remain the release boundary for every published version.

## Public entry points

- `@moldea.ai/core` exposes Core construction, results, diagnostics, limits, and exceptions.
- `@moldea.ai/core/format` exposes repository-format value types.
- `@moldea.ai/core/adapter` exposes the runtime-adapter inspection contract.

## Text normalization and digests

```typescript
import { createCore } from '@moldea.ai/core';
import { parseRepositoryPath } from '@moldea.ai/repository';

const core = createCore();
const input = {
  content: new TextEncoder().encode('\ufeffline one\r\nline two\r'),
  path: parseRepositoryPath('/moldea/project.md'),
};

const normalized = core.normalizeText(input);
const digested = await core.calculateContentDigest(input);
```

Normalization validates strict UTF-8 or Unicode-scalar string input, removes one leading byte-order
mark, converts CRLF and CR line endings to LF, rejects NUL, performs no Unicode normalization, and
reports normalized UTF-8 byte and scalar lengths. Digests are SHA-256 over the normalized UTF-8
bytes.

## Manifest parsing

```typescript
import { createCore } from '@moldea.ai/core';
import { parseRepositoryPath } from '@moldea.ai/repository';

const result = await createCore().parseManifest({
  content: new TextEncoder().encode('version: 1\n'),
  path: parseRepositoryPath('/moldea/moldea.yaml'),
});
```

Manifest parsing validates the canonical path, strict UTF-8 and normalized text, the supported YAML 1.2 Core Schema subset, and every version 1 rule that can be established from the document alone. It rejects directives, anchors, aliases, merge keys, custom tags, duplicate keys, unknown properties, invalid values, unrecognized runtime IDs, and non-canonical relationships. Recognized official runtime IDs remain valid independently from the active Core instance's configured adapter set. A result includes both the normalized manifest asset and deeply immutable manifest value only when the complete document is valid. It does not read the repository, check adapter availability, or check whether referenced files exist.

## Decision parsing

```typescript
import { createCore } from '@moldea.ai/core';
import { parseRepositoryPath } from '@moldea.ai/repository';

const result = await createCore().parseDecision({
  content: [
    '---',
    'status: accepted',
    'createdAt: "2026-08-07T19:42:03.456Z"',
    '---',
    'Use the accepted implementation.',
    '',
  ].join('\n'),
  path: parseRepositoryPath('/moldea/decisions/1786131723456-use-postgresql.md'),
});
```

Decision parsing validates the canonical timestamp-slug path, exact frontmatter delimiters, strict YAML metadata, status, canonical UTC `createdAt`, filename timestamp equality, supersession IDs, and non-empty Markdown body. A valid result preserves the exact normalized body and complete normalized asset, sorts supersession IDs, and includes a SHA-256 digest. It does not read other decisions or validate reference existence, duplicate IDs across files, supersession graphs, status consistency, or manifest relationships.

## Repository inspection

```typescript
import { createCore } from '@moldea.ai/core';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

const repository = createMemoryRepositoryReader([
  {
    content: 'version: 1\n',
    path: '/moldea/moldea.yaml',
    type: 'file',
  },
  {
    content: '# Project\n',
    path: '/moldea/project.md',
    type: 'file',
  },
]);
const result = await createCore().inspectProject({ repository });
```

Core's repository-level foundation now includes one isolated reader session for each inspection. The session validates detached reader output, applies the shared entry and byte budgets, caches each successfully read source file once, returns a fresh byte array to every consumer, and preserves cancellation and repository-source failures. Its state is never shared across inspections.

Canonical discovery and exact decision reads can compose through this `IRepositoryReader` boundary. Core parses each discovered decision once and deterministically validates project-wide ID uniqueness, missing supersession references, cycles, active and historical status consistency, and orphaned superseded decisions. Invalid or ambiguous decision nodes do not produce dependent graph cascades, while unrelated trustworthy graph rules continue to run.

The internal relationship layer also validates top-level and per-agent context and decision paths against canonical discovery and the parsed decision graph. Context targets must exist, and decision targets must exist and be accepted. Discovery and document diagnostics retain ownership of invalid targets so dependent missing or inactive diagnostics do not cascade.

Repository references, bindings, capability implementations, unresolved-requirement references, and exact `affectedBy` paths are validated through the same inspection reader. Exact targets must resolve to regular files without following symlinks, repeated paths share one exact lookup, and capability implementation failures use their specific tool or skill diagnostic instead of a generic reference diagnostic. Glob `affectedBy` patterns are not enumerated and may match zero entries; adapter-owned symbol resolution remains deferred to adapter inspection.

Core now also contains internal readers for every discovered runtime-guidance file and for convention-owned registered-agent assets. Runtime guidance is normalized, digested, checked for non-whitespace content, and reconciled with each agent's optional runtime guidance path. Registered agents are reconciled with exact directories, mandatory descriptions and instructions, optional handoff descriptions, Unicode-whitespace-trimmed description limits, forbidden runtime-variable delimiters, opening instruction identity, and complete runtime-placeholder grammar and declaration usage. Placeholder diagnostics preserve scalar-aware source ranges and deterministic declaration pointers. Unregistered directories and missing registered assets produce deterministic diagnostics without rereading unregistered content or cascading from discovery-owned failures.

Declared mirrors are resolved through the same inspection reader and compared with their owning canonical instruction after strict text decoding and repository-format normalization. One leading byte-order mark and CRLF or CR line endings are normalized; all other content differences remain significant. Only exact normalized matches retain mirror and canonical digests. Missing, non-file, symlink, stale, and invalid-text mirrors produce deterministic diagnostics, while an unavailable canonical instruction suppresses mirror lookups and dependent diagnostics.

Universal inspection now reads and parses the manifest, reads the project foundation, and then composes canonical discovery, focused-context reads, decision graphs, runtime guidance, registered-agent assets, manifest relationships, repository references, and mirrors through one coherent reader session. Exact foundation entries and file bytes are reused rather than requested twice. It aggregates diagnostics under one project-inspection limit and produces a deeply immutable, deterministic, JSON-safe provisional project index only when every universal phase succeeds. A supported format version remains available when it is independently trustworthy even if another manifest rule fails. Project and focused-context files must contain non-whitespace text; valid focused context retains its manifest relationship metadata, and all indexed assets retain normalized content, scalar and byte lengths, and SHA-256 digests.

Before any adapter runs, Core verifies that every recognized package-backed runtime ID declared by an agent has a configured adapter and that the adapter supports the active repository-format version. Availability failures retain manifest-derived source ranges, prevent every adapter from running, and return empty evidence. Core then groups agents by runtime ID and invokes each applicable configured adapter exactly once in ascending adapter-ID order. Each adapter receives only its matching agents, the complete frozen project, the shared budget-aware reader, and the active signal. The built-in `custom` behavior requires no configured adapter and produces no runtime evidence by itself.

Core validates adapter evidence and diagnostics before retaining them. Evidence references must identify existing regular files; evidence and diagnostic identity, scope, namespace, ranges, pointers, entities, and JSON-scalar details must satisfy the public adapter contract. One operation-wide diagnostic budget counts raw Core proposals across every universal phase plus raw adapter diagnostics; raw evidence has its own operation-wide budget. Both adapter output budgets apply before validation, deduplication, or sorting. Core normalizes, deduplicates, sorts, and freezes valid output. Adapter diagnostics retain valid evidence but withhold the project index. Any universal diagnostic prevents every adapter from running and returns empty evidence.

The repository entry limit counts distinct non-root logical paths across Core and every adapter. A path counts when first targeted by `getEntry` or `readFile`, used as a non-root listing prefix, or yielded by a listing, including absent exact probes. Repeated and concurrent touches count exactly once. The root `/` never counts.

The public result is all-or-nothing: `valid` is true exactly when diagnostics are empty, and `project` is non-null exactly when `valid` is true. A supported parsed format version may remain available after an unrelated universal diagnostic. Operational failures reject instead of returning a structural result.

### Repository inspection failures

`inspectProject` may reject with these `CoreOperationException` contracts:

| Code                       | Stable message                                     | Trigger and metadata                                                                                                                                                                                                                                                                              | Cause and result behavior                                                                                                   |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_ARGUMENT`         | `The Core operation received an invalid argument.` | The inspection input, reader, or signal violates its runtime contract. `operation` is `inspect-project`; `retryable` is `false`.                                                                                                                                                                  | No structural result is returned.                                                                                           |
| `ABORTED`                  | `The Core operation was aborted.`                  | The shared signal is already aborted or becomes aborted during Core or adapter work. `operation` is `inspect-project`; `retryable` is `true` because a fresh call with a non-aborted signal may succeed.                                                                                          | The signal reason is preserved as `cause` when available; no partial result is returned.                                    |
| `RESOURCE_LIMIT_EXCEEDED`  | `A Core resource limit was exceeded.`              | A distinct-entry, byte, file, manifest, raw-diagnostic, or raw-evidence budget is exceeded. `limit` identifies the budget; `retryable` is `false`.                                                                                                                                                | No partial project, evidence, or diagnostics are returned.                                                                  |
| `ADAPTER_EXECUTION_FAILED` | `A runtime adapter failed during inspection.`      | An adapter throws unexpectedly or returns malformed, unsafe, cyclic, incorrectly namespaced, ungrounded, or out-of-scope output. `adapterId` identifies the adapter; `operation` is `inspect-project` for invocation failures and `validate-adapter` for invalid results; `retryable` is `false`. | Unexpected failures are preserved as `cause`; malformed results use a safe validation cause. No partial result is returned. |

`RepositoryPathException` and `RepositorySourceException` raised by the supplied reader or adapter-facing reader propagate unchanged. Core does not translate source access, snapshot, cancellation, or malformed-source failures into repository diagnostics or adapter failures.

## Development

From the monorepo root:

```bash
pnpm exec turbo run typecheck --filter=@moldea.ai/core
pnpm exec turbo run build --filter=@moldea.ai/core
pnpm exec turbo run test --filter=@moldea.ai/core
```

Unit and integration tests are colocated with their source. Repository-level fixtures use the immutable reader from `@moldea.ai/repository/memory`. Exact conformance goldens cover document diagnostics, context-only repositories, every tool and skill combination, complete project indexes, and the shared runtime-adapter boundary.
