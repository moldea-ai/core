# `@moldea.ai/cli`

The canonical read-only local command-line composition for deterministic inspection of `moldea` repositories.

The current unpublished `0.0.1` foundation provides the `moldea` executable, strict version 1 command and option parsing, deterministic help and version output, resource-limit validation, and safe human or JSON usage errors. Valid `validate`, `inspect`, and `compatibility` invocations reach a private command-dispatch boundary, but their Git, Repository FS, Core, adapter, and compatibility behavior is not implemented yet.

Tarball and installed-bin checks are the release boundary for now. This package is not ready to publish to npm.

## Commands

The version 1 command names are:

```text
moldea validate
moldea inspect
moldea compatibility
```

The foundation fully supports top-level and command-specific help, `moldea --version`, strict option validation, and usage failures. It does not inspect a repository or return successful command results yet.

## Package boundary

The package exposes the `moldea` executable and no supported JavaScript or TypeScript import API. Its exact first-class dependencies are:

- `@moldea.ai/repository`
- `@moldea.ai/repository-fs`
- `@moldea.ai/core`

No package-backed runtime adapter is active yet. The `custom` adapter remains built into Core and requires no separate package.

The executable performs no network requests, telemetry, repository writes, Git operations, repository discovery, filesystem-reader construction, or Core inspection in this foundation.

## Runtime support

The version 1 consumer runtime range is:

```text
^22.11.0 || ^24.11.0
```

The package is Node.js-specific and requires Git `2.30.0` or later once Git-backed commands are implemented.

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
