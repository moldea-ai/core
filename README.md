# packages

The `packages` project is the open-source package monorepo for `moldea`. It develops the first-class public and private packages, shared internal packages, private applications, compatibility data, conformance fixtures, documentation, and generation tooling that implement and present the deterministic repository-reading and repository-format ecosystem.

The repository is intentionally separate from the hosted [`platform`](https://github.com/moldea-ai/platform) monorepo. It contains reusable package products and their shared development infrastructure, not Cloud applications, hosted APIs, runtime infrastructure, or deployment configuration.

`@moldea.ai/repository`, `@moldea.ai/repository-fs`, `@moldea.ai/core`, `@moldea.ai/adapter-anthropic`, `@moldea.ai/adapter-openai`, and `@moldea.ai/cli` form the available package set. Repository and Core provide the source-neutral reader and universal interpretation foundations, Repository FS supplies the coherent local-filesystem reader, the Anthropic and OpenAI adapters contribute static evidence for their experimental direct SDK targets, and the CLI composes them into the complete version `1` read-only executable. The built-in `custom` runtime and package-backed `anthropic` and `openai` runtimes are verified as available; the remaining package-backed adapters stay `planned`. Real tarball installation and execution remain the release boundary for every package version.

## Specifications

The product and package specifications are currently maintained in the `platform` repository:

- [`moldea` packages](https://github.com/moldea-ai/platform/blob/main/moldea/context/packages.md) — monorepo organization, package catalog, dependencies, distribution, and shared conventions.
- [`@moldea.ai/repository`](https://github.com/moldea-ai/platform/blob/main/moldea/context/repository-package.md) — source-neutral repository-reader contract and in-memory reference implementation.
- [`@moldea.ai/repository-fs`](https://github.com/moldea-ai/platform/blob/main/moldea/context/repository-fs-package.md) — coherent local filesystem reader.
- [`@moldea.ai/core`](https://github.com/moldea-ai/platform/blob/main/moldea/context/core-package.md) — deterministic repository-format interpretation and indexing.
- [`@moldea.ai/cli`](https://github.com/moldea-ai/platform/blob/main/moldea/context/cli-package.md) — read-only Git working-tree composition and executable contract.
- [`@moldea.ai/adapter-anthropic`](https://github.com/moldea-ai/platform/blob/main/moldea/context/adapter-anthropic-package.md) — experimental TypeScript Anthropic Messages API inspection target.
- [`@moldea.ai/adapter-google-genai`](https://github.com/moldea-ai/platform/blob/main/moldea/context/adapter-google-genai-package.md) — proposed TypeScript Google Gen AI SDK inspection target.
- [`@moldea.ai/adapter-openai`](https://github.com/moldea-ai/platform/blob/main/moldea/context/adapter-openai-package.md) — experimental TypeScript OpenAI Responses API inspection target.
- [Runtime Adapter Contract](https://github.com/moldea-ai/platform/blob/main/moldea/context/runtime-adapter-contract.md) — deterministic extension contract for official adapters.
- [Runtime Compatibility Matrix](https://github.com/moldea-ai/platform/blob/main/moldea/context/runtime-compatibility-matrix.md) — canonical compatibility-data contract and initial adapter inventory.

The specification documents remain the design authority. Compatibility artifacts are introduced in their specified implementation phase, after their foundational packages and conformance requirements are in place.

## Project structure

```text
.github/
  workflows/                   # Verification, npm publication, and GitHub Pages deployment
apps/
  website/                     # Private Astro packages-documentation application
compatibility/
  runtimes.yaml                # Canonical runtime support inventory and claims
configs/
  typescript/                  # Shared environment and declaration configs
  vite/                        # Shared ESM library build configuration
  vitest/                      # Shared package test configuration
fixtures/                      # Repository-wide conformance fixtures
docs/
  npm-releases.md             # Trusted npm publication and bootstrap process
  runtime-compatibility.md     # Generated compatibility presentation
packages/                      # Private shared implementation packages
  adapter-static-analysis/    # Provider-neutral adapter source-analysis primitives
projects/
  adapter-anthropic/           # Anthropic Messages API runtime adapter
  adapter-openai/              # OpenAI Responses API runtime adapter
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
vitest-integration.config.ts
```

Every immediate child of [`projects/`](projects/) is an independently meaningful first-class package. Every immediate child of [`packages/`](packages/) is a private shared implementation package. Every immediate child of [`apps/`](apps/) is a private application built from or around the ecosystem. Applications do not appear in the package catalog, carry no independent public package compatibility promise, and may depend on projects or internal packages; projects and internal packages never depend on applications.

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
| `adapter-vercel-ai-sdk`     | `@moldea.ai/adapter-vercel-ai-sdk`     | Public            |

The catalog records approved architecture, not implementation or release status. The `custom` adapter remains built into `@moldea.ai/core` and has no separate package project.

The initial public tooling, instruction-consumption, and package-backed adapter phase is limited to the Node.js ecosystem. Runtime Compatibility Matrix version `1` therefore records npm packages only and interprets every package range with node-semver semantics.

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
| `pnpm test:root`              | Run root unit and integration tests.                                     |
| `pnpm test:unit`              | Run root and package unit-test tasks.                                    |
| `pnpm test:integration`       | Run root and package integration-test tasks.                             |
| `pnpm test:e2e`               | Build and run installed-package end-to-end test tasks.                   |
| `pnpm format`                 | Format repository-maintained files.                                      |
| `pnpm compatibility:generate` | Regenerate compatibility documentation and bundled CLI release metadata. |
| `pnpm compatibility:check`    | Verify matrix, package, and generated-artifact synchronization.          |
| `pnpm docs:generate`          | Generate the ignored deterministic website content model.                |
| `pnpm docs:check`             | Validate package discovery, docs, exports, routes, and compatibility.    |
| `pnpm website:dev`            | Generate content and run the local Astro development server.             |
| `pnpm website:build`          | Build, index, and validate the complete static production website.       |
| `pnpm website:check`          | Run website docs, tests, types, lint, build, and artifact checks.        |

## Build and test conventions

Public JavaScript artifacts are ESM-only unless a focused specification establishes another format. Vite bundles JavaScript in library mode with explicit entry points, stable output names, source maps by default, and deliberate dependency externalization. Packages may omit JavaScript source maps when bundling a private workspace implementation would expose private import paths in published artifacts. TypeScript performs strict source checking and emits declarations separately so public types remain a first-class package artifact. Package build scripts clean their output directory once, run Vite, and then emit declarations; the shared Vite configuration does not delete output owned by another build step.

Environment-neutral packages extend `configs/typescript/environment-neutral.json`; Node-specific packages extend `configs/typescript/node.json`. Declaration builds use the corresponding `*-library.json` configuration and set package-local `rootDir` and `outDir` values.

Package tests use Vitest without global test APIs. Tests are colocated with the source modules they exercise, and Node and non-React tests use the `*.test-unit.ts`, `*.test-integration.ts`, and `*.test-e2e.ts` names for the categories they own. Each package exposes a granular script for every category it contains, and its `test` command runs unit, integration, then end-to-end correctness suites when present. Shared conformance fixtures live at repository level when they represent a contract implemented by multiple packages.

Repository FS, the Anthropic and OpenAI adapters, and CLI runtime compatibility are tested at packed-consumer boundaries. CI builds the required public tarballs on the pinned development runtime, then installs and executes the artifacts with package scripts disabled and strict engine validation on Node.js `22.11.0`, latest Node.js 22, Node.js `24.11.0`, and latest Node.js 24. The adapter harnesses exercise each installed public export and inspection boundary, while the CLI harness verifies installed package identities and real `version`, `compatibility`, `validate`, and `inspect` commands through the packed composition. This keeps consumer runtime guarantees independent from the newer runtime required by repository development tooling.

Turborepo derives build order from declared workspace dependencies. Package dependencies must remain explicit and acyclic, and no task may rely on workspace enumeration order or undeclared cross-project state.

## Package documentation and generated artifacts

Every implemented public project owns its full documentation under `projects/<project>/docs/**`. Package specifications, implementation, tests, public exports, manifests, compatibility source, and package-owned documentation are authoritative; the website only discovers, validates, renders, searches, and presents them. Concise package READMEs remain the GitHub and npm entry points.

Generated files are not edited directly. Runtime compatibility changes begin in [`compatibility/runtimes.yaml`](compatibility/runtimes.yaml), while exact bundled versions come from the first-class project manifests. Run `pnpm compatibility:generate` to update [`docs/runtime-compatibility.md`](docs/runtime-compatibility.md) and the CLI's generated immutable release-metadata module. The website model, API reference, route manifest, search input, and `llms.txt` are generated during documentation checks and builds from their canonical repository sources; `llms.txt` is never maintained independently. CI reruns the applicable generators and fails when canonical inputs are invalid, routes contradict one another, public exports are omitted, links break, or the static artifact is incomplete.

## Coding-agent maintenance rule

The coding agent that changes a package or compatibility claim is responsible for reconsidering every affected representation and synchronizing only those that actually changed. Depending on the change, this includes implementation, public exports, package manifest, package specification, README, package-owned documentation, generated API reference, examples, tests and fixtures, compatibility source, generated compatibility documentation, CLI release metadata, website pages and navigation, compatibility pages, and `llms.txt`.

> **Reconsider and synchronize when affected. Do not edit unrelated surfaces merely because they exist.**

Generated output changes through its canonical source and generator. Compatibility claims come only from `compatibility/runtimes.yaml`. Package documentation is part of package maintenance. A website-only change does not create an npm release. Full documentation under `projects/<project>/docs/**` is repository-owned website source, is absent from the package tarball by default, and does not select that project for npm release unless the package deliberately publishes those files. `README.md`, `package.json`, `LICENSE`, declared package files, public exports, and source remain release-relevant; combining docs with a release-relevant change still selects the project.

## Packages website and deployment

[`apps/website`](apps/website/) is the private Astro static application for the public packages ecosystem. It uses `SITE_URL` and `BASE_PATH`; the defaults match the established `https://packages.moldea.ai/` custom domain, while explicit inputs continue to support a GitHub project-site base path without component changes. See its [application README](apps/website/README.md) for focused commands and source boundaries.

Pull requests run non-deploying repository verification, including documentation discovery, generated API, route, and local search-index checks, website unit and browser tests, type checking, linting, the complete static build, internal-link validation, and final artifact inspection. Relevant pushes to `main` trigger [the Pages workflow](.github/workflows/pages.yml), read the configured origin and base path from GitHub Pages, rebuild from that exact merged commit, and deploy with GitHub's official Pages artifact flow. npm publication remains a separate workflow and is never triggered merely by website or full-documentation changes.

Repository owners must perform one initial GitHub setting if Pages is not already enabled: open **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**, and save. This is one-time enablement, not a publication step. After it is enabled, relevant merges and direct pushes publish automatically; a failed build never uploads or deploys a partial replacement.

## Package releases

A push to `main` automatically selects every release-relevant changed public project. Full documentation-only changes under `projects/<project>/docs/**` are excluded; README, manifest, source, license, and declared package-artifact changes remain included. An existing selected project must declare a stable version strictly greater than its version at the preceding commit, while a newly introduced project with no base manifest must declare a canonical stable version. The npm workflow verifies the complete release candidate once, then creates package-qualified immutable tags and publishes the exact checksummed tarballs in dependency order through trusted publishing. A project whose version is invalid for its release state fails before publication. Manual dispatch remains available for new-package bootstrap and release recovery. See [`docs/npm-releases.md`](docs/npm-releases.md).

## Initial implementation sequence

The first implementation project was `@moldea.ai/repository`, followed by its in-memory reader and shared conformance suite. Core's universal behavior was then completed through that memory-reader boundary, followed by Repository FS, the CLI's installed-tarball runtime boundary, and the first official package-backed adapters. The Anthropic and OpenAI adapters now own experimental TypeScript Messages and Responses API targets with deterministic fixtures, diagnostics, evidence, package metadata, and packed-runtime verification. Their provider-neutral source analysis, relationship classification, and operation-local inspection caches live in the private `@moldea.ai/adapter-static-analysis` package and are bundled into each public adapter artifact. Package publication remains an explicit independently versioned release operation; other official package-backed adapters stay `planned` until their implementations and fixtures support verified compatibility claims.
