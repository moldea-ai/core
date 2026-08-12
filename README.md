# packages

The `packages` project is the open-source package monorepo for `moldea`. It develops the first-class public and private packages, shared internal packages, compatibility data, conformance fixtures, and generation tooling that implement the deterministic repository-reading and repository-format ecosystem.

The repository is intentionally separate from the hosted [`platform`](https://github.com/moldea-ai/platform) monorepo. It contains reusable package products and their shared development infrastructure, not Cloud applications, hosted APIs, runtime infrastructure, or deployment configuration.

`@moldea.ai/repository` and `@moldea.ai/core` now provide the source-neutral reader and universal interpretation foundations. `@moldea.ai/repository-fs` now exposes its cohesive immutable reader factory over strict exact-path and recursive-directory inventories, private filesystem fingerprints, creation-time verification, frozen lookup and listing, coordinated lazy file capture, atomic in-flight byte reservations, and permanent invalidation after snapshot loss. The filesystem reader passes the same source-neutral conformance contract as the in-memory reference reader. The canonical Runtime Compatibility Matrix is materialized with every approved adapter marked `planned`; this publishes the inventory without claiming runtime support before adapter implementations and fixtures exist.

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

| Command                       | Purpose                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| `pnpm test:root`              | Run tests for shared repository configuration.                          |
| `pnpm test:unit`              | Run root and package unit-test tasks.                                   |
| `pnpm test:integration`       | Build and run package integration-test tasks.                           |
| `pnpm format`                 | Format repository-maintained files.                                     |
| `pnpm compatibility:generate` | Validate the canonical matrix and regenerate its Markdown presentation. |
| `pnpm compatibility:check`    | Verify matrix validity and exact generated-document synchronization.    |

## Build and test conventions

Public JavaScript artifacts are ESM-only unless a focused specification establishes another format. Vite bundles JavaScript in library mode with explicit entry points, stable output names, source maps, and deliberate dependency externalization. TypeScript performs strict source checking and emits declarations separately so public types remain a first-class package artifact. Package build scripts clean their output directory once, run Vite, and then emit declarations; the shared Vite configuration does not delete output owned by another build step.

Environment-neutral packages extend `configs/typescript/environment-neutral.json`; Node-specific packages extend `configs/typescript/node.json`. Declaration builds use the corresponding `*-library.json` configuration and set package-local `rootDir` and `outDir` values.

Package tests use Vitest without global test APIs. Tests are colocated with the source modules they exercise, and Node and non-React tests follow the established `*.test-unit.ts` and `*.test-integration.ts` naming conventions. Each package exposes separate `test:unit` and `test:integration` commands plus a `test` command that runs both suites. Shared conformance fixtures live at repository level when they represent a contract implemented by multiple packages.

Repository FS runtime compatibility is tested at the packed-consumer boundary. CI builds its public tarball and the Repository dependency on the pinned development runtime, then installs and executes those artifacts on the exact minimum and latest patch of each supported Node.js line. This keeps consumer runtime guarantees independent from the newer runtime required by repository development tooling.

Turborepo derives build order from declared workspace dependencies. Package dependencies must remain explicit and acyclic, and no task may rely on workspace enumeration order or undeclared cross-project state.

## Generated artifacts

Generated files are not edited directly. Runtime compatibility changes begin in [`compatibility/runtimes.yaml`](compatibility/runtimes.yaml); run `pnpm compatibility:generate` to update [`docs/runtime-compatibility.md`](docs/runtime-compatibility.md). CI runs `pnpm compatibility:check` and fails when the matrix is invalid or the committed presentation is stale.

## Initial implementation sequence

The first implementation project was `@moldea.ai/repository`, followed by its in-memory reader and shared conformance suite. Core's universal behavior was then completed through that memory-reader boundary. `@moldea.ai/repository-fs` is now being implemented before the CLI and official adapters are composed from their completed foundational packages and compatibility claims.
