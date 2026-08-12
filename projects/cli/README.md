# `@moldea.ai/cli`

The canonical read-only local command-line composition for deterministic inspection of `moldea` repositories.

The current unpublished `0.0.1` foundation provides the `moldea` executable, strict version 1 command and option parsing, deterministic help and version output, resource-limit validation, safe human or JSON errors, Git-owned working-tree discovery, and bounded strict tracked/untracked candidate probing for `validate` and `inspect`. Effective inventory normalization, Repository FS construction, Core execution, adapter composition, and compatibility reporting are not implemented yet.

Tarball and installed-bin checks are the release boundary for now. This package is not ready to publish to npm.

## Commands

The version 1 command names are:

```text
moldea validate
moldea inspect
moldea compatibility
```

The foundation fully supports top-level and command-specific help, `moldea --version`, strict option validation, and usage failures. It discovers a selected working tree and probes its raw tracked and non-ignored untracked candidates, but it does not complete repository inspection or return successful command results yet.

## Package boundary

The package exposes the `moldea` executable and no supported JavaScript or TypeScript import API. Its exact first-class dependencies are:

- `@moldea.ai/repository`
- `@moldea.ai/repository-fs`
- `@moldea.ai/core`

No package-backed runtime adapter is active yet. The `custom` adapter remains built into Core and requires no separate package.

The executable performs no network requests, telemetry, repository writes, filesystem-reader construction, or Core inspection in this foundation. `validate` and `inspect` use read-only Git operations to discover and verify a working tree and probe raw inventory candidates; help, version, usage failures, and `compatibility` do not invoke Git.

## Runtime support

The version 1 consumer runtime range is:

```text
^22.11.0 || ^24.11.0
```

The package is Node.js-specific. `validate` and `inspect` require Git `2.30.0` or later; commands compare the numeric Git version and accept standard platform or vendor suffixes.

## Git working-tree discovery and raw inventory

The starting directory is the invocation directory unless `--repository <path>` selects another path. Relative selections resolve against the invocation directory. Git determines the absolute top-level working-tree root, so ordinary repositories, unborn repositories, nested starting directories, and linked worktrees share the same discovery path.

Git runs directly without a platform shell, with fixed non-interactive arguments and a sanitized deterministic environment. Version output is limited to 4096 bytes per stream, and each discovery output stream is limited to 262144 bytes. Discovery requires Git `2.30.0` or later and rejects missing or inaccessible paths, nonrepositories, bare repositories, Git-directory paths without a usable work tree, malformed Git output, and sparse checkouts before inventory probing begins.

After discovery, `validate` and `inspect` stream NUL-delimited tracked-index and non-ignored untracked records from fixed `git ls-files` commands. Tracked records accept only full SHA-1 or SHA-256 object IDs, index stages `0` through `3`, and Git modes `100644`, `100755`, `120000`, or `160000`. Paths are decoded as fatal UTF-8 and preserve exact Unicode scalars, case, tabs, newlines, and an initial BOM without normalization.

Raw tracked and untracked records share `maxEntries` before any future stage collapse or deduplication. Their combined stdout shares `maxTotalBytes`, while stderr has a separate fixed 4096-byte diagnostic ceiling and is never emitted. Exceeding an inventory ceiling discards all candidates and returns the non-retryable `cli:RESOURCE_LIMIT_EXCEEDED` contract with message `A resource limit was exceeded.` Malformed output returns `git:GIT_OUTPUT_INVALID` without a partial inventory.

The CLI does not expose selected paths, candidate paths, resolved repository roots, raw process errors, or Git diagnostics in failures. A successfully probed candidate set currently reaches the safe `INTERNAL_ERROR` placeholder because selected-repository ownership, `.git` and nested-repository boundaries, entry-type overlay, attribute classification, logical-path conversion, effective deduplication, and command result composition belong to later implementation slices.

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
