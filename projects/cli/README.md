![moldea](cover.png)

# `@moldea.ai/cli`

The canonical read-only local command-line composition for deterministic inspection of `moldea` repositories.

The package's version 3 surface provides the `moldea` executable while preserving version 1 command, option, and JSON contracts. It includes deterministic help and version output, resource-limit validation, safe human or JSON errors, Git-owned working-tree discovery, bounded strict tracked/untracked candidate probing, submodule and nested-repository ownership filtering, deterministic stage collapse, no-follow current entry-type normalization, bounded effective `core.symlinks` resolution, portable logical-path normalization with exact Unicode code-point ordering, bounded effective Git content-transformation classification, exact-path Repository FS construction, private immutable reader wrappers for materialized Git symlinks and guarded regular-file reads, bounded whole-operation snapshot stabilization, attempt-local Core execution, safe Repository/Core operational-error translation, operation-scoped process-signal cancellation, deterministic content-minimized `validate` human and JSON results, concise content-free `inspect` human summaries, complete Core-result `inspect` JSON output, generated immutable compatibility and exact package-version metadata, command-wide release-integrity verification, and complete deterministic `compatibility` human and JSON reporting.

Version 3 bundles Anthropic adapter `2.0.1`, whose client-tool names must match `^[A-Za-z0-9_-]{1,64}$`.

Tarball, installed-bin, and cross-repository skill checks remain the release boundary for every published version.

## Commands

The version 1 command names are:

```text
moldea validate
moldea inspect
moldea compatibility
```

The foundation fully supports top-level and command-specific help, `moldea --version`, strict option validation, and usage failures. It discovers a selected working tree, pins its filesystem and Git identity, probes its raw tracked and non-ignored untracked candidates, excludes submodule and nested-repository-only content, collapses index stages by exact path, omits absent paths, classifies every remaining current file or symlink without following the leaf, derives its effective Git content-transformation state, converts the surviving records into deterministically sorted repository logical paths, retries a complete provisional reader operation when the source changes, and runs Core through the accepted reader. `validate` and `inspect` return completed valid and structurally invalid results. `compatibility` reports the installed generated matrix and exact package composition without discovering a repository.

## Package boundary

The package exposes the `moldea` executable and no supported JavaScript or TypeScript import API. Its exact first-class dependencies are:

- `@moldea.ai/repository`
- `@moldea.ai/repository-fs`
- `@moldea.ai/core`
- `@moldea.ai/adapter-anthropic`
- `@moldea.ai/adapter-google-genai`
- `@moldea.ai/adapter-openai`
- `@moldea.ai/adapter-openai-agents-sdk`

The package-backed `anthropic`, `google-genai`, `openai`, and `openai-agents-sdk` runtime adapters are active for their experimental TypeScript SDK targets. The `custom` adapter remains built into Core and requires no separate package.

The package declares `preferUnplugged: true` so Yarn Plug'n'Play materializes the executable on the physical filesystem instead of leaving the bundled ESM entry point inside ZipFS. This package-owned hint preserves root-local Yarn execution without requiring client configuration or a `node_modules` linker.

The executable bundles a generated deeply immutable snapshot of the canonical Runtime Compatibility Matrix, exact first-class package versions, supported Node.js range, minimum Git version, JSON output schema version, Core repository-format support, and active adapter IDs. Repository generation validates this snapshot against the canonical matrix, package manifests, Core adapter inventory, and actual CLI adapter registration before every standalone CLI build.

The executable performs no network requests, telemetry, repository writes, or configured Git content transformations. `validate` and `inspect` use read-only Git operations and no-follow filesystem metadata inspection to discover a working tree, establish and verify its identity, normalize the selected inventory, construct an exact-path guarded filesystem reader, and run Core within at most three complete snapshot attempts. Help, version, and usage failures do not run the release-integrity preflight. `compatibility` and that preflight do not invoke Git, a filesystem repository reader, a client manifest, or Core inspection; the preflight reads only installed package manifests and compares the exact resolved Core release with its separately generated adapter inventory.

## Runtime support

The version 1 consumer runtime range is:

```text
^22.11.0 || ^24.11.0
```

The package is Node.js-specific. `validate` and `inspect` require Git `2.30.0` or later; commands compare the numeric Git version and accept standard platform or vendor suffixes.

## Git working-tree discovery and normalized inventory

The starting directory is the invocation directory unless `--repository <path>` selects another path. Relative selections resolve against the invocation directory. Git determines the absolute top-level working-tree root, so ordinary repositories, unborn repositories, nested starting directories, and linked worktrees share the same discovery path.

Git runs directly without a platform shell, with fixed non-interactive arguments and a sanitized deterministic environment. Version output is limited to 4096 bytes per stream, and each discovery output stream is limited to 262144 bytes. Discovery requires Git `2.30.0` or later and rejects missing or inaccessible paths, nonrepositories, bare repositories, Git-directory paths without a usable work tree, malformed Git output, and sparse checkouts before inventory probing begins.

After discovery, `validate` and `inspect` stream NUL-delimited tracked-index and non-ignored untracked records from fixed `git ls-files` commands. Tracked records accept only full SHA-1 or SHA-256 object IDs, index stages `0` through `3`, and Git modes `100644`, `100755`, `120000`, or `160000`. Paths are decoded as fatal UTF-8 and preserve exact Unicode scalars, case, tabs, newlines, and an initial BOM without normalization.

Raw tracked and untracked records share `maxEntries` before ownership filtering, stage collapse, or deduplication. Their combined stdout, nested-root validation stdout, any required effective `core.symlinks` stdout, and effective Git attribute stdout share `maxTotalBytes`, while stderr has a separate fixed 4096-byte diagnostic ceiling per Git command and is never emitted. Exceeding an inventory ceiling discards all candidates and returns the non-retryable `cli:RESOURCE_LIMIT_EXCEEDED` contract with message `A resource limit was exceeded.` Malformed output returns `git:GIT_OUTPUT_INVALID` without a partial inventory or partial attribute classification.

Every tracked `160000` gitlink establishes an excluded submodule root. The root and every candidate below it are removed without initializing, updating, or recursing into the submodule. Candidate paths containing an exact `.git` segment are also excluded; similarly named ordinary paths such as `.gitignore`, `.gitattributes`, and `.github` remain eligible.

For untracked candidates, the CLI traverses only the required directory prefixes, compares native names by exact bytes, and uses no-follow filesystem observations. An exact `.git` marker is validated through bounded sanitized Git root discovery so both ordinary nested repositories and linked worktrees are recognized without reimplementing Git's control-file format. Nested-root identity follows host path semantics and falls back to stable filesystem identity for aliases such as Windows short and long path spellings, without altering exact Git logical-path spelling. Untracked candidates owned by those nested working trees are excluded. A selected-repository tracked candidate remains included even when a nested repository was created above it later. Ambiguous ownership, a symlinked boundary, unsafe raw path structure, or contradictory root output fails the complete probe with `GIT_OUTPUT_INVALID`; access failures remain `GIT_ACCESS_DENIED`.

After ownership filtering, the CLI groups exact paths in first-appearance order, retains one immutable mode-and-stage record for every unmerged index stage, and rejects duplicate stages, tracked/untracked collisions, stage-zero/conflict mixtures, or a surviving gitlink. Every remaining candidate is classified with a no-follow leaf stat. Missing paths are omitted; regular files and native symlinks retain their current type; directories, special entries, and unexplained contradictions fail atomically with `GIT_OUTPUT_INVALID`.

The effective `core.symlinks` value is queried at most once and only when a tracked Git symlink is currently a regular host file. With `core.symlinks=false`, a path whose retained stages are all mode `120000` remains a logical symlink and is marked for the immutable reader overlay. With symlink support enabled, the current host file represents an intentional file-type change. Mixed regular-file and symlink stages over a host file are accepted only when symlink support is enabled; the disabled case is ambiguous and fails with `GIT_OUTPUT_INVALID`. Native symlinks never require the overlay.

Every decoded Git candidate path is validated through `@moldea.ai/repository` before ownership filtering or missing-path omission, without case folding or Unicode normalization. Validation prepends exactly one `/`; for an untracked directory-boundary record, it first removes Git's one trailing directory terminator. A path outside the portable logical-path grammar, including a path containing ASCII control characters, invalid segments, backslashes, or a Windows drive prefix, fails the complete probe with `GIT_OUTPUT_INVALID`. Surviving entries are then converted to branded repository logical paths, and the resulting immutable inventory is sorted by exact Unicode code-point order.

For every effective inventory entry, the CLI sends the exact Git-relative path through NUL-delimited stdin to one fixed `git check-attr --stdin -z` operation and strictly associates the resulting `filter`, `working-tree-encoding`, and `ident` triples. Exact effective values are retained in the immutable inventory so later snapshot comparison can detect any classification change. `unset` and `unspecified` are unguarded; `set` and every other effective value are guarded. Ordinary `text` and `eol` attributes alone remain supported. Invalid UTF-8, missing or duplicate triples, unknown paths or attributes, successful stderr, and output that cannot be associated exactly fail atomically with `GIT_OUTPUT_INVALID`.

Git attribute inspection never invokes configured filters, Git LFS, clean or smudge commands, or encoding helpers. A guarded path remains visible in lookup and listing and does not fail merely by existing. The outer content-transformation wrapper inspects the already-overlaid logical entry only when its bytes are requested. A guarded logical regular file then raises a CLI-owned non-retryable `RepositorySourceException` on the common `SOURCE_UNAVAILABLE` boundary before `readFile` reaches Repository FS. Native and materialized logical symlinks retain the common `ENTRY_NOT_FILE` behavior even when their host paths are guarded. When Core requests guarded regular-file bytes, the CLI translates its private marker to `git:GIT_CONTENT_TRANSFORM_UNSUPPORTED` and includes only the safe repository logical path.

The CLI passes the complete normalized logical path set to `@moldea.ai/repository-fs` exact-path selection, so the filesystem reader synthesizes required parent directories without admitting unrelated files. `maxEntries` and `maxFileBytes` retain their filesystem meanings, while the CLI's `maxTotalBytes` becomes the reader's `maxCachedBytes` limit. The private immutable overlay then maps materialized Git symlink host files to `type: 'symlink'` in exact lookup and listing, rejects their reads with the common non-retryable `ENTRY_NOT_FILE` contract, and never calls the underlying `readFile` for those paths. The content-transformation guard wraps that logical view so symlink semantics take precedence. Missing or contradictory wrapper entries fail with `INVALID_SOURCE_DATA`.

Before attempting a snapshot, the CLI pins the selected root directory, its worktree-specific Git directory, and its shared Git common directory by absolute host path plus nonzero device and inode identity. Linked worktrees therefore retain distinct worktree identity while sharing the expected common repository identity. Each attempt verifies the complete pin, derives normalized inventories before and after exact-path reader creation, and runs its provisional operation only when both inventories match exactly, including entry type, retained index stages, symlink-overlay state, and content-transformation classification.

The CLI retries the complete provisional attempt for differing inventories, Repository FS `SNAPSHOT_CHANGED` failures, and reader-creation missing-entry or parent-type failures when a fresh inventory proves the source changed. It recreates the inventory, reader, wrappers, operation state, and filesystem resource budget for every retry and never reuses provisional bytes or results. Three total attempts are allowed. Exhaustion or a changed pinned identity returns `cli:WORKING_TREE_UNSTABLE` with message `The working tree did not remain stable.` and `retryable: true`.

The CLI does not expose selected paths, candidate paths, resolved repository roots, raw process errors, or Git diagnostics in failures. Every accepted snapshot operation creates a fresh Core instance with the exact effective limits: `maxEntries`, `maxFileBytes`, `maxManifestBytes`, `maxDiagnostics`, and `maxEvidence` retain their names, while `maxTotalBytes` becomes Core's `maxTotalBytesRead`. The active package-backed adapter set contains the immutable `anthropic`, `google-genai`, `openai`, and `openai-agents-sdk` adapter singletons; Core's built-in `custom` behavior remains available without registration.

Known `RepositorySourceException`, `CoreConfigurationException`, and `CoreOperationException` contracts become safe `repository` or `core` errors with their owning code, documented retryability, logical repository path when applicable, and non-confidential metadata. The private content-transformation marker is translated before the common repository-source case. Unexpected failures, including an internal `RepositoryPathException`, become the generic non-retryable `cli:INTERNAL_ERROR` contract without causes or rejected values.

## Cancellation and process signals

The executable owns one operation-scoped `AbortController`. `validate` and `inspect` pass its signal through every Git child process, working-tree snapshot step, Repository FS creation, repository read, Core inspection, and adapter invocation. `SIGINT` and `SIGTERM` abort the active operation, prevent another snapshot retry, discard an unwritten result, and exit with code `130` and `143`, respectively. The first received signal determines the exit code. A signal received after output has been completely written does not alter the completed result.

Git process cancellation uses the safe retryable `git:GIT_OPERATION_ABORTED` contract with message `The Git operation was aborted.` at internal command boundaries. When cancellation originates from a process signal before output completion, the executable may emit no human or JSON document rather than expose a successful or partial result. Active Git child processes are terminated through the same operation signal; no raw abort reason or process diagnostic is printed.

A successfully completed Core inspection produces `validate` human or JSON output without exposing the project index, canonical content, or adapter evidence. Zero diagnostics return status `valid` and exit code `0`; one or more diagnostics preserve Core order, return status `invalid`, and exit with code `1`.

`inspect` uses the same completion status and exit codes. Valid human output reports the repository format and counts for context assets, decisions, runtime-guidance assets, agents, mirrors, and adapter evidence items without printing canonical content. Invalid human output uses the same ordered diagnostic presentation as `validate` and reports non-empty adapter evidence counts without exposing evidence details. `inspect --json` preserves the complete Core `IProjectInspectionResult`, including the deeply immutable project index and its canonical normalized content when valid, and writes it only to stdout inside the deterministic version 1 envelope. This JSON output may contain confidential project context, decisions, runtime guidance, descriptions, and instructions; callers must protect captured output.

## Compatibility reporting and integrity

Before `validate`, `inspect`, or `compatibility` produces a result, the executable compares its installed package metadata, actually resolved first-class package identities and versions, generated release snapshot, exact first-class dependency declarations, active package-backed adapter registration, separately generated Core adapter inventory, Core repository-format support, minimum Git constant, and JSON output schema constant. Source-workspace dependencies must use exact `workspace:<version>` declarations; packed dependencies must use the same exact published version. Loose ranges, package-manager overrides, missing or additional first-class dependencies, mismatched package identities or versions, invalid matrix states, invalid adapter activation, unsupported adapter formats, incompatible version ranges, stale constants, and contradictory matrix inventory fail before Git discovery or repository inspection.

`compatibility` reports the installed CLI version, supported Node.js range, JSON schema version, matrix version, minimum Git version, sorted package versions, Core repository-format versions, and every sorted matrix adapter. Each adapter record includes its active state, bundled version when applicable, complete normalized matrix entry, implementation identity and status, and any published ranges, runtime guidance, formats, verification date, and targets. Core's built-in `custom` adapter is active and available with bundled Core `2.0.0`, repository format `1`, required project-local runtime guidance, and full support for explicit repository relationships. The bundled Anthropic adapter `2.0.1`, Google Gen AI adapter `1.0.3`, OpenAI adapter `2.0.4`, and OpenAI Agents SDK adapter `1.0.1` are active and available with experimental support for their TypeScript Messages, generate-content, Responses API, and agent-handoff targets. The remaining package-backed adapters stay planned and inactive.

Successful human and JSON reports use exit code `0`; JSON uses status `valid` and the version 1 deterministic envelope. The command never uses status `invalid`. A contradictory installed release returns the non-retryable `cli:COMPATIBILITY_STATE_INVALID` error with message `The installed compatibility state is invalid.` and exit code `3`, without a partial result. The command accesses no Git executable, repository filesystem, client manifest, network, or Cloud service.

## Development

From the monorepo root:

```bash
pnpm --filter @moldea.ai/cli typecheck
pnpm --filter @moldea.ai/cli build
pnpm --filter @moldea.ai/cli test:unit
pnpm --filter @moldea.ai/cli test:integration
pnpm --filter @moldea.ai/cli test:e2e
pnpm --filter @moldea.ai/cli test
```

Unit, integration, and end-to-end tests are colocated with their owning modules. The end-to-end suite installs real package tarballs and executes the resulting package bin without requiring any `@moldea.ai/*` package to be published. It verifies command, output, exit, security, package-content, process-signal, and repository-immutability behavior at the consumer boundary.

CI separately packs Repository, Repository FS, Core, the Anthropic, Google Gen AI, OpenAI, and OpenAI Agents SDK adapters, and CLI and installs them with npm scripts disabled and strict engine validation on Node.js `22.11.0`, latest Node.js 22, Node.js `24.11.0`, and latest Node.js 24. Dedicated runtime harnesses verify each adapter's installed inspection boundary and the CLI's installed identities plus real `version`, `compatibility`, `validate`, and `inspect` execution. Linux owns this consumer-runtime matrix, while the complete repository tests continue to run on Linux, macOS, and Windows.

The Anthropic, Google Gen AI, OpenAI, and OpenAI Agents SDK adapters have their own repository fixtures, package tests, packed-runtime consumer checks, and verified compatibility claims. Cross-repository skill conformance for package-backed adapters remains outside this implementation slice.
