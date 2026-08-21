# packages

The `packages` project is the open-source package monorepo for `moldea`. It develops the first-class public and private packages, shared internal packages, private applications, compatibility data, conformance fixtures, documentation, and generation tooling that implement and present the deterministic repository-reading and repository-format ecosystem.

The repository is intentionally separate from the hosted [`platform`](https://github.com/moldea-ai/platform) monorepo. It contains reusable package products and their shared development infrastructure, not Cloud applications, hosted APIs, runtime infrastructure, or deployment configuration.

`@moldea.ai/repository`, `@moldea.ai/repository-fs`, `@moldea.ai/core`, `@moldea.ai/adapter-anthropic`, `@moldea.ai/adapter-claude-agent-sdk`, `@moldea.ai/adapter-cloudflare-agents`, `@moldea.ai/adapter-eve`, `@moldea.ai/adapter-google-genai`, `@moldea.ai/adapter-langchain`, `@moldea.ai/adapter-langgraph`, `@moldea.ai/adapter-openai`, `@moldea.ai/adapter-openai-agents-sdk`, `@moldea.ai/adapter-vercel-ai-sdk`, `@moldea.ai/cli`, and `@moldea.ai/website-ui` form the available package set. Repository and Core provide the source-neutral reader and universal interpretation foundations, Repository FS supplies the coherent local-filesystem reader, the provider and agent-SDK adapters contribute static evidence for their experimental targets, the CLI composes them into the complete version `1` read-only executable, and Website UI provides the shared Astro and Tailwind foundations for moldea public websites. The built-in `custom` runtime and package-backed `anthropic`, `claude-agent-sdk`, `cloudflare-agents`, `eve`, `google-genai`, `langchain`, `langgraph`, `openai`, `openai-agents-sdk`, and `vercel-ai-sdk` runtimes are verified as available. Real tarball installation and execution remain the release boundary for every package version.

## Specifications

The product and package specifications are currently maintained in the `platform` repository:

- [`moldea` packages](https://github.com/moldea-ai/platform/blob/main/moldea/context/packages.md): monorepo organization, package catalog, dependencies, distribution, and shared conventions.
- [`@moldea.ai/repository`](https://github.com/moldea-ai/platform/blob/main/moldea/context/repository-package.md): source-neutral repository-reader contract and in-memory reference implementation.
- [`@moldea.ai/repository-fs`](https://github.com/moldea-ai/platform/blob/main/moldea/context/repository-fs-package.md): coherent local filesystem reader.
- [`@moldea.ai/core`](https://github.com/moldea-ai/platform/blob/main/moldea/context/core-package.md): deterministic repository-format interpretation and indexing.
- [`@moldea.ai/cli`](https://github.com/moldea-ai/platform/blob/main/moldea/context/cli-package.md): read-only Git working-tree composition and executable contract.
- [`@moldea.ai/adapter-anthropic`](https://github.com/moldea-ai/platform/blob/main/moldea/context/adapter-anthropic-package.md): experimental TypeScript Anthropic Messages API inspection target.
- [`@moldea.ai/adapter-claude-agent-sdk`](https://github.com/moldea-ai/platform/blob/main/moldea/context/adapter-claude-agent-sdk-package.md): experimental TypeScript Claude Agent SDK query and programmatic-subagent inspection target.
- [`@moldea.ai/adapter-cloudflare-agents`](https://github.com/moldea-ai/platform/blob/main/moldea/context/adapter-cloudflare-agents-package.md): experimental TypeScript Cloudflare Think and AIChatAgent inspection targets.
- [`@moldea.ai/adapter-eve`](https://github.com/moldea-ai/platform/blob/main/moldea/context/adapter-eve-package.md): experimental TypeScript Eve filesystem-agent inspection target.
- [`@moldea.ai/adapter-google-genai`](https://github.com/moldea-ai/platform/blob/main/moldea/context/adapter-google-genai-package.md): experimental TypeScript Google Gen AI SDK inspection target.
- [`@moldea.ai/adapter-langchain`](https://github.com/moldea-ai/platform/blob/main/moldea/context/adapter-langchain-package.md): experimental TypeScript LangChain `createAgent` inspection target.
- [`@moldea.ai/adapter-langgraph`](https://github.com/moldea-ai/platform/blob/main/moldea/context/adapter-langgraph-package.md): experimental TypeScript LangGraph StateGraph and Functional API inspection targets.
- [`@moldea.ai/adapter-openai`](https://github.com/moldea-ai/platform/blob/main/moldea/context/adapter-openai-package.md): experimental TypeScript OpenAI Responses API inspection target.
- [`@moldea.ai/adapter-openai-agents-sdk`](https://github.com/moldea-ai/platform/blob/main/moldea/context/adapter-openai-agents-sdk-package.md): experimental TypeScript OpenAI Agents SDK agent and handoff inspection target.
- [`@moldea.ai/adapter-vercel-ai-sdk`](https://github.com/moldea-ai/platform/blob/main/moldea/context/adapter-vercel-ai-sdk-package.md): experimental TypeScript Vercel AI SDK agent and generation inspection targets.
- [Runtime Adapter Contract](https://github.com/moldea-ai/platform/blob/main/moldea/context/runtime-adapter-contract.md): deterministic extension contract for official adapters.
- [Runtime Compatibility Matrix](https://github.com/moldea-ai/platform/blob/main/moldea/context/runtime-compatibility-matrix.md): canonical compatibility-data contract and initial adapter inventory.

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
  adapter-claude-agent-sdk/    # Claude Agent SDK runtime adapter
  adapter-cloudflare-agents/  # Cloudflare Think and AIChatAgent runtime adapter
  adapter-eve/                # Eve filesystem-agent runtime adapter
  adapter-google-genai/        # Google Gen AI generate-content runtime adapter
  adapter-langchain/           # LangChain createAgent runtime adapter
  adapter-langgraph/           # LangGraph StateGraph and Functional API runtime adapter
  adapter-openai/              # OpenAI Responses API runtime adapter
  adapter-openai-agents-sdk/   # OpenAI Agents SDK runtime adapter
  adapter-vercel-ai-sdk/       # Vercel AI SDK runtime adapter
  cli/                         # Read-only local command-line composition
  core/                        # Deterministic repository-format interpretation
  repository/                  # Source-neutral reader contract and memory reader
  repository-fs/               # Explicit local-filesystem repository reader
  website-ui/                  # Shared Astro and Tailwind website foundations
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
core                → repository
adapter-*           → core
cli                 → repository + repository-fs + core + active adapter packages
packages-website    → website-ui
```

Shared internal packages may support first-class projects but never depend on them. Published packages must bundle private internal implementation or otherwise ensure that private imports and declarations do not leak into the consumer artifact.

## Package catalog

| Project                     | Package                                | Distribution |
| --------------------------- | -------------------------------------- | ------------ |
| `repository`                | `@moldea.ai/repository`                | Public       |
| `repository-fs`             | `@moldea.ai/repository-fs`             | Public       |
| `core`                      | `@moldea.ai/core`                      | Public       |
| `cli`                       | `@moldea.ai/cli`                       | Public       |
| `adapter-anthropic`         | `@moldea.ai/adapter-anthropic`         | Public       |
| `adapter-claude-agent-sdk`  | `@moldea.ai/adapter-claude-agent-sdk`  | Public       |
| `adapter-cloudflare-agents` | `@moldea.ai/adapter-cloudflare-agents` | Public       |
| `adapter-eve`               | `@moldea.ai/adapter-eve`               | Public       |
| `adapter-google-genai`      | `@moldea.ai/adapter-google-genai`      | Public       |
| `adapter-langchain`         | `@moldea.ai/adapter-langchain`         | Public       |
| `adapter-langgraph`         | `@moldea.ai/adapter-langgraph`         | Public       |
| `adapter-openai`            | `@moldea.ai/adapter-openai`            | Public       |
| `adapter-openai-agents-sdk` | `@moldea.ai/adapter-openai-agents-sdk` | Public       |
| `adapter-vercel-ai-sdk`     | `@moldea.ai/adapter-vercel-ai-sdk`     | Public       |
| `website-ui`                | `@moldea.ai/website-ui`                | Public       |

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

Public JavaScript artifacts are ESM-only unless a focused specification establishes another format. Vite bundles JavaScript in library mode with explicit entry points, stable output names, source maps by default, and deliberate dependency externalization. Packages may omit JavaScript source maps when bundling a private workspace implementation would expose private import paths in published artifacts. TypeScript performs strict source checking and emits declarations separately so public types remain a first-class package artifact. Package build scripts clean their output directory once, run Vite, and then emit declarations; the shared Vite configuration does not delete output owned by another build step. Website UI additionally publishes source Astro components and CSS because the consuming Astro application owns their compilation and Tailwind source scan.

Environment-neutral packages extend `configs/typescript/environment-neutral.json`; Node-specific packages extend `configs/typescript/node.json`. Declaration builds use the corresponding `*-library.json` configuration and set package-local `rootDir` and `outDir` values.

Package tests use Vitest without global test APIs. Tests are colocated with the source modules they exercise, and Node and non-React tests use the `*.test-unit.ts`, `*.test-integration.ts`, and `*.test-e2e.ts` names for the categories they own. Each package exposes a granular script for every category it contains, and its `test` command runs unit, integration, then end-to-end correctness suites when present. Shared conformance fixtures live at repository level when they represent a contract implemented by multiple packages.

Repository FS, the Anthropic, Claude Agent SDK, Cloudflare Agents, Eve, Google Gen AI, LangChain, LangGraph, OpenAI, OpenAI Agents SDK, and Vercel AI SDK adapters, and CLI runtime compatibility are tested at packed-consumer boundaries. CI builds the required public tarballs on the pinned development runtime, then installs and executes the artifacts with package scripts disabled and strict engine validation on Node.js `22.11.0`, latest Node.js 22, Node.js `24.11.0`, and latest Node.js 24. The adapter harnesses exercise each installed public export and inspection boundary, while the CLI harness verifies installed package identities and real `version`, `compatibility`, `validate`, and `inspect` commands through the packed composition. This keeps consumer runtime guarantees independent from the newer runtime required by repository development tooling.

Turborepo derives build order from declared workspace dependencies. Package dependencies must remain explicit and acyclic, and no task may rely on workspace enumeration order or undeclared cross-project state.

## Package documentation and generated artifacts

Every implemented public project owns its full documentation under `projects/<project>/docs/**`. Package specifications, implementation, tests, public exports, manifests, compatibility source, and package-owned documentation are authoritative; the website only discovers, validates, renders, searches, and presents them. Concise package READMEs remain the GitHub and npm entry points.

Generated files are not edited directly. Runtime compatibility changes begin in [`compatibility/runtimes.yaml`](compatibility/runtimes.yaml), while exact bundled versions come from the first-class project manifests. A target may link only to its canonical profile on `https://skill.moldea.ai`; qualification execution, fixtures, caches, and results remain owned by the skill repository. Run `pnpm compatibility:generate` to update [`docs/runtime-compatibility.md`](docs/runtime-compatibility.md) and the CLI's generated immutable release-metadata module. The website model, API reference, route manifest, search input, and `llms.txt` are generated during documentation checks and builds from their canonical repository sources; `llms.txt` is never maintained independently. CI reruns the applicable generators and fails when canonical inputs are invalid, routes contradict one another, public exports are omitted, links break, or the static artifact is incomplete.

## Coding-agent maintenance rule

The coding agent that changes a package or compatibility claim is responsible for reconsidering every affected representation and synchronizing only those that actually changed. Depending on the change, this includes implementation, public exports, package manifest, package specification, README, package-owned documentation, generated API reference, examples, tests and fixtures, compatibility source, generated compatibility documentation, CLI release metadata, website pages and navigation, compatibility pages, and `llms.txt`.

Before completing any change, the coding agent must audit the complete diff against its base commit using the npm release project's release-relevance rules. Every changed existing public project selected for publication must receive a greater canonical stable version in the same change, while a newly introduced public project must declare a canonical stable version. The agent must also synchronize directly affected exact workspace dependencies, the lockfile, generated release metadata, package documentation, and version assertions, then run `pnpm release:check-changes <base-commit> <current-commit>` when both commits are available.

> **Reconsider and synchronize when affected. Do not edit unrelated surfaces merely because they exist.**

Generated output changes through its canonical source and generator. Compatibility claims come only from `compatibility/runtimes.yaml`. Package documentation is part of package maintenance. A website-only change does not create an npm release. Full documentation under `projects/<project>/docs/**` is repository-owned website source, is absent from the package tarball by default, and does not select that project for npm release unless the package deliberately publishes those files. `README.md`, `package.json`, `LICENSE`, declared package files, public exports, and source remain release-relevant; combining docs with a release-relevant change still selects the project.

## Packages website and deployment

[`apps/website`](apps/website/) is the private Astro static application for the public packages ecosystem. It consumes `@moldea.ai/website-ui` through the workspace protocol for shared design tokens, interaction states, theme behavior, search behavior, and small components while retaining local ownership of layouts, navigation, content generation, SEO identity, and assets. It uses `SITE_URL` and `BASE_PATH`; the defaults match the established `https://packages.moldea.ai/` custom domain, while explicit inputs continue to support a GitHub project-site base path without component changes. See its [application README](apps/website/README.md) for focused commands and source boundaries.

Pull requests run non-deploying repository verification, including documentation discovery, generated API, route, and local search-index checks, website unit and browser tests, type checking, linting, the complete static build, internal-link validation, and final artifact inspection. Relevant pushes to `main` trigger [the Pages workflow](.github/workflows/pages.yml), read the configured origin and base path from GitHub Pages, rebuild from that exact merged commit, and deploy with GitHub's official Pages artifact flow. npm publication remains a separate workflow and is never triggered merely by website or full-documentation changes.

Repository owners must perform one initial GitHub setting if Pages is not already enabled: open **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**, and save. This is one-time enablement, not a publication step. After it is enabled, relevant merges and direct pushes publish automatically; a failed build never uploads or deploys a partial replacement.

## Package releases

A push to `main` automatically selects every release-relevant changed public project and uses the npm workflow as the commit's sole CI and release orchestrator; pull requests invoke the reusable CI workflow directly without a parallel branch-push run. Full documentation-only changes under `projects/<project>/docs/**` are excluded; README, manifest, source, license, and declared package-artifact changes remain included. An existing selected project must declare a stable version strictly greater than its version at the preceding commit, while a newly introduced project with no base manifest must declare a canonical stable version. The npm workflow verifies every `main` commit exactly once, including successful no-op releases, then creates package-qualified immutable tags and publishes the exact checksummed tarballs in dependency order through trusted publishing. Linux verification uses the official Playwright image pinned to the packages website's installed version instead of downloading Chromium and operating-system dependencies during each run. A project whose version is invalid for its release state fails before publication. Manual CI remains available for branch checks, while manual publication dispatch remains available for new-package bootstrap and release recovery. See [`docs/npm-releases.md`](docs/npm-releases.md).

## Initial implementation sequence

The first implementation project was `@moldea.ai/repository`, followed by its in-memory reader and shared conformance suite. Core's universal behavior was then completed through that memory-reader boundary, followed by Repository FS, the CLI's installed-tarball runtime boundary, and the first official package-backed adapters. The Anthropic, Claude Agent SDK, Cloudflare Agents, Eve, Google Gen AI, LangChain, LangGraph, OpenAI, OpenAI Agents SDK, and Vercel AI SDK adapters now own experimental TypeScript runtime targets with deterministic fixtures, diagnostics, evidence, package metadata, and packed-runtime verification. Their provider-neutral source analysis, relationship classification, and operation-local inspection caches live in the private `@moldea.ai/adapter-static-analysis` package and are bundled into each public adapter artifact. Website UI now owns the reusable public-website foundation independently of the runtime package chain. Package publication remains an explicit independently versioned release operation.
