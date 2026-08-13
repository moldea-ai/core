# packages

The `packages` project is the open-source package monorepo for `moldea`. It develops the first-class public and private packages, shared internal packages, compatibility data, conformance fixtures, and generation tooling that implement the deterministic repository-reading and repository-format ecosystem.

The repository is intentionally separate from the hosted [`platform`](https://github.com/moldea-ai/platform) monorepo. It contains reusable package products and their shared development infrastructure, not Cloud applications, hosted APIs, runtime infrastructure, or deployment configuration.

`@moldea.ai/repository`, `@moldea.ai/repository-fs`, `@moldea.ai/core`, and `@moldea.ai/cli` now form the unpublished `1.0.0` release candidate. Repository and Core provide the source-neutral reader and universal interpretation foundations, Repository FS supplies the coherent local-filesystem reader, and the CLI composes them into the complete version `1` read-only executable. The built-in `custom` runtime is verified as available through Core's universal repository behavior; every package-backed adapter remains `planned`. Real tarball installation and execution, including cross-repository skill conformance, are the release boundary until a separately authorized npm publication and immutable tag exist.

## Specifications

The product and package specifications are currently maintained in the `platform` repository:

- [`moldea` packages](https://github.com/moldea-ai/platform/blob/main/moldea/context/packages.md) — monorepo organization, package catalog, dependencies, distribution, and shared conventions.
- [`@moldea.ai/repository`](https://github.com/moldea-ai/platform/blob/main/moldea/context/repository-package.md) — source-neutral repository-reader contract and in-memory reference implementation.
- [`@moldea.ai/repository-fs`](https://github.com/moldea-ai/platform/blob/main/moldea/context/repository-fs-package.md) — coherent local filesystem reader.
- [`@moldea.ai/core`](https://github.com/moldea-ai/platform/blob/main/moldea/context/core-package.md) — deterministic repository-format interpretation and indexing.
- [`@moldea.ai/cli`](https://github.com/moldea-ai/platform/blob/main/moldea/context/cli-package.md) — read-only Git working-tree composition and executable contract.
- [Runtime Adapter Contract](https://github.com/moldea-ai/platform/blob/main/moldea/context/runtime-adapter-contract.md) — deterministic extension contract for official adapters.
- [Runtime Compatibility Matrix](https://github.com/moldea-ai/platform/blob/main/moldea/context/runtime-compatibility-matrix.md) — canonical compatibility-data contract and initial adapter inventory.

The specification documents remain the design authority. Compatibility artifacts are introduced in their specified implementation phase, after their foundational packages and conformance requirements are in place.

## Project structure

```text
.github/
  workflows/                   # Repository verification
compatibility/
  runtimes.yaml                # Canonical runtime support inventory and claims
configs/
  typescript/                  # Shared environment and declaration configs
  vite/                        # Shared ESM library build configuration
  vitest/                      # Shared package test configuration
fixtures/                      # Repository-wide conformance fixtures
docs/
  runtime-compatibility.md     # Generated compatibility presentation
packages/                      # Private shared implementation packages
projects/
  cli/                         # Read-only local command-line composition
  core/                        # Deterministic repository-format interpretation
  repository/                  # Source-neutral reader contract and memory reader
  repository-fs/               # Explicit local-filesystem repository reader
scripts/
  runtime-compatibility/       # Matrix validation and deterministic generation
eslint.config.js
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
tsconfig.json
turbo.json
vitest.config.ts
```

Every immediate child of [`projects/`](projects/) is an independently meaningful first-class package. Every immediate child of [`packages/`](packages/) is a private shared implementation package. Repository-wide fixtures and other non-package assets remain outside both workspace layers.

## Dependency architecture

An arrow means that the package on the left depends on the package on the right.

```text
repository-fs       → repository
repository-github   → repository
core                → repository
adapter-*           → core
cli                 → repository + repository-fs + core + active adapter packages
```

Shared internal packages may support first-class projects but never depend on them. Published packages must bundle private internal implementation or otherwise ensure that private imports and declarations do not leak into the consumer artifact.

## Package catalog

| Project                     | Package                                | Distribution      |
| --------------------------- | -------------------------------------- | ----------------- |
| `repository`                | `@moldea.ai/repository`                | Public            |
| `repository-fs`             | `@moldea.ai/repository-fs`             | Public            |
| `repository-github`         | `@moldea.ai/repository-github`         | Private initially |
| `core`                      | `@moldea.ai/core`                      | Public            |
| `cli`                       | `@moldea.ai/cli`                       | Public            |
| `adapter-anthropic`         | `@moldea.ai/adapter-anthropic`         | Public            |
| `adapter-claude-agent-sdk`  | `@moldea.ai/adapter-claude-agent-sdk`  | Public            |
| `adapter-cloudflare-agents` | `@moldea.ai/adapter-cloudflare-agents` | Public            |
| `adapter-eve`               | `@moldea.ai/adapter-eve`               | Public            |
| `adapter-google-genai`      | `@moldea.ai/adapter-google-genai`      | Public            |
| `adapter-langchain`         | `@moldea.ai/adapter-langchain`         | Public            |
| `adapter-langgraph`         | `@moldea.ai/adapter-langgraph`         | Public            |
| `adapter-openai`            | `@moldea.ai/adapter-openai`            | Public            |
| `adapter-openai-agents-sdk` | `@moldea.ai/adapter-openai-agents-sdk` | Public            |
| `adapter-pydantic-ai`       | `@moldea.ai/adapter-pydantic-ai`       | Public            |
| `adapter-vercel-ai-sdk`     | `@moldea.ai/adapter-vercel-ai-sdk`     | Public            |

The catalog records approved architecture, not implementation or release status. The `custom` adapter remains built into `@moldea.ai/core` and has no separate package project.

## Requirements

- Node.js `24.15.0` or newer within Node.js 24 for repository development
- pnpm `11.9.0`

Development-tool requirements are intentionally separate from consumer runtime guarantees. Node-specific version `1` packages declare and verify the runtime ranges defined by their focused specifications. Environment-neutral packages must not import Node.js modules or inherit Node globals.

## Getting started

Install the pinned workspace dependencies:

```bash
pnpm install
```

Run the complete repository verification workflow:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Useful focused commands:

| Command                       | Purpose                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ |
| `pnpm test:root`              | Run tests for shared repository configuration.                           |
| `pnpm test:unit`              | Run root and package unit-test tasks.                                    |
| `pnpm test:integration`       | Build and run package integration-test tasks.                            |
| `pnpm test:e2e`               | Build and run installed-package end-to-end test tasks.                   |
| `pnpm format`                 | Format repository-maintained files.                                      |
| `pnpm compatibility:generate` | Regenerate compatibility documentation and bundled CLI release metadata. |
| `pnpm compatibility:check`    | Verify matrix, package, and generated-artifact synchronization.          |

## Build and test conventions

Public JavaScript artifacts are ESM-only unless a focused specification establishes another format. Vite bundles JavaScript in library mode with explicit entry points, stable output names, source maps, and deliberate dependency externalization. TypeScript performs strict source checking and emits declarations separately so public types remain a first-class package artifact. Package build scripts clean their output directory once, run Vite, and then emit declarations; the shared Vite configuration does not delete output owned by another build step.

Environment-neutral packages extend `configs/typescript/environment-neutral.json`; Node-specific packages extend `configs/typescript/node.json`. Declaration builds use the corresponding `*-library.json` configuration and set package-local `rootDir` and `outDir` values.

Package tests use Vitest without global test APIs. Tests are colocated with the source modules they exercise, and Node and non-React tests use the `*.test-unit.ts`, `*.test-integration.ts`, and `*.test-e2e.ts` names for the categories they own. Each package exposes a granular script for every category it contains, and its `test` command runs unit, integration, then end-to-end correctness suites when present. Shared conformance fixtures live at repository level when they represent a contract implemented by multiple packages.

Repository FS and CLI runtime compatibility are tested at packed-consumer boundaries. CI builds the required public tarballs on the pinned development runtime, then installs and executes the artifacts with package scripts disabled and strict engine validation on Node.js `22.11.0`, latest Node.js 22, Node.js `24.11.0`, and latest Node.js 24. The CLI runtime harness verifies the installed package identities and runs real `version`, `compatibility`, `validate`, and `inspect` commands through the packed composition. This keeps consumer runtime guarantees independent from the newer runtime required by repository development tooling.

Turborepo derives build order from declared workspace dependencies. Package dependencies must remain explicit and acyclic, and no task may rely on workspace enumeration order or undeclared cross-project state.

## Generated artifacts

Generated files are not edited directly. Runtime compatibility changes begin in [`compatibility/runtimes.yaml`](compatibility/runtimes.yaml), while exact bundled versions come from the first-class project manifests. Run `pnpm compatibility:generate` to update [`docs/runtime-compatibility.md`](docs/runtime-compatibility.md) and the CLI's generated immutable release-metadata module. CI runs `pnpm compatibility:check` and fails when the matrix, package composition, documentation, or bundled metadata is invalid or stale.

## Initial implementation sequence

The first implementation project was `@moldea.ai/repository`, followed by its in-memory reader and shared conformance suite. Core's universal behavior was then completed through that memory-reader boundary, followed by the coherent Repository FS implementation and the CLI's installed-tarball runtime boundary. The `1.0.0` release candidate now includes verified built-in `custom` compatibility and real cross-repository skill conformance over deterministic `compatibility --json` and `inspect --json`. Npm publication and immutable release tags remain a separate release operation; official package-backed adapters remain later slices and stay `planned` until their implementations and fixtures support verified compatibility claims.
