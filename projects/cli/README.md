# `@moldea.ai/cli`

The canonical read-only local command-line composition for deterministic inspection of `moldea` repositories.

The current unpublished `0.0.1` foundation provides the `moldea` executable, strict version 1 command and option parsing, deterministic help and version output, resource-limit validation, safe human or JSON errors, Git-owned working-tree discovery, bounded strict tracked/untracked candidate probing, submodule and nested-repository ownership filtering, deterministic stage collapse, no-follow current entry-type normalization, bounded effective `core.symlinks` resolution, portable logical-path normalization with exact Unicode code-point ordering, and the private immutable reader overlay required for materialized Git symlinks. Repository FS construction and composition, Git attribute classification, snapshot retries, Core execution, adapter composition, and compatibility reporting are not implemented yet.

Tarball and installed-bin checks are the release boundary for now. This package is not ready to publish to npm.

## Commands

The version 1 command names are:

```text
moldea validate
moldea inspect
moldea compatibility
```

The foundation fully supports top-level and command-specific help, `moldea --version`, strict option validation, and usage failures. It discovers a selected working tree, probes its raw tracked and non-ignored untracked candidates, excludes submodule and nested-repository-only content, collapses index stages by exact path, omits absent paths, classifies every remaining current file or symlink without following the leaf, and converts the surviving paths into deterministically sorted repository logical paths. It does not complete repository inspection or return successful command results yet.

## Package boundary

The package exposes the `moldea` executable and no supported JavaScript or TypeScript import API. Its exact first-class dependencies are:

- `@moldea.ai/repository`
- `@moldea.ai/repository-fs`
- `@moldea.ai/core`

No package-backed runtime adapter is active yet. The `custom` adapter remains built into Core and requires no separate package.

The executable performs no network requests, telemetry, repository writes, filesystem-reader construction, or Core inspection in this foundation. `validate` and `inspect` use read-only Git operations and no-follow filesystem metadata inspection to discover a working tree, establish selected-repository ownership, collapse candidate stages, and normalize current entry types; help, version, usage failures, and `compatibility` do not invoke Git.

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

Raw tracked and untracked records share `maxEntries` before ownership filtering, stage collapse, or deduplication. Their combined stdout, nested-root validation stdout, and any required effective `core.symlinks` stdout share `maxTotalBytes`, while stderr has a separate fixed 4096-byte diagnostic ceiling per Git command and is never emitted. Exceeding an inventory ceiling discards all candidates and returns the non-retryable `cli:RESOURCE_LIMIT_EXCEEDED` contract with message `A resource limit was exceeded.` Malformed output returns `git:GIT_OUTPUT_INVALID` without a partial inventory.

Every tracked `160000` gitlink establishes an excluded submodule root. The root and every candidate below it are removed without initializing, updating, or recursing into the submodule. Candidate paths containing an exact `.git` segment are also excluded; similarly named ordinary paths such as `.gitignore`, `.gitattributes`, and `.github` remain eligible.

For untracked candidates, the CLI traverses only the required directory prefixes, compares native names by exact bytes, and uses no-follow filesystem observations. An exact `.git` marker is validated through bounded sanitized Git root discovery so both ordinary nested repositories and linked worktrees are recognized without reimplementing Git's control-file format. Nested-root identity follows host path semantics, including case-insensitive Windows path spelling, without altering exact Git logical-path spelling. Untracked candidates owned by those nested working trees are excluded. A selected-repository tracked candidate remains included even when a nested repository was created above it later. Ambiguous ownership, a symlinked boundary, unsafe raw path structure, or contradictory root output fails the complete probe with `GIT_OUTPUT_INVALID`; access failures remain `GIT_ACCESS_DENIED`.

After ownership filtering, the CLI groups exact paths in first-appearance order, retains one immutable mode-and-stage record for every unmerged index stage, and rejects duplicate stages, tracked/untracked collisions, stage-zero/conflict mixtures, or a surviving gitlink. Every remaining candidate is classified with a no-follow leaf stat. Missing paths are omitted; regular files and native symlinks retain their current type; directories, special entries, and unexplained contradictions fail atomically with `GIT_OUTPUT_INVALID`.

The effective `core.symlinks` value is queried at most once and only when a tracked Git symlink is currently a regular host file. With `core.symlinks=false`, a path whose retained stages are all mode `120000` remains a logical symlink and is marked for the immutable reader overlay. With symlink support enabled, the current host file represents an intentional file-type change. Mixed regular-file and symlink stages over a host file are accepted only when symlink support is enabled; the disabled case is ambiguous and fails with `GIT_OUTPUT_INVALID`. Native symlinks never require the overlay.

Every decoded Git candidate path is validated through `@moldea.ai/repository` before ownership filtering or missing-path omission, without case folding or Unicode normalization. Validation prepends exactly one `/`; for an untracked directory-boundary record, it first removes Git's one trailing directory terminator. A path outside the portable logical-path grammar, including a path containing ASCII control characters, invalid segments, backslashes, or a Windows drive prefix, fails the complete probe with `GIT_OUTPUT_INVALID`. Surviving entries are then converted to branded repository logical paths, and the resulting immutable inventory is sorted by exact Unicode code-point order.

The private immutable overlay accepts validated repository logical paths during the later reader-composition step. It maps the underlying regular files to `type: 'symlink'` in exact lookup and listing, rejects their reads with the common non-retryable `ENTRY_NOT_FILE` contract, and never calls the underlying `readFile` for those paths. Missing or contradictory underlying overlay entries fail with `INVALID_SOURCE_DATA`.

The CLI does not expose selected paths, candidate paths, resolved repository roots, raw process errors, or Git diagnostics in failures. A successfully normalized entry set currently reaches the safe `INTERNAL_ERROR` placeholder because Repository FS composition, attribute classification, snapshot stabilization, Core execution, and command result composition belong to later implementation slices.

## Development

From the monorepo root:

```bash
pnpm --filter @moldea.ai/cli typecheck
pnpm --filter @moldea.ai/cli build
pnpm --filter @moldea.ai/cli test:unit
pnpm --filter @moldea.ai/cli test:integration
pnpm --filter @moldea.ai/cli test
```

Unit and integration tests are colocated with their owning modules. Integration tests install real package tarballs and execute the resulting package bin without requiring any `@moldea.ai/*` package to be published.
