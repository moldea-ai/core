# npm releases

Public packages are released automatically after their changes reach `main`. Pull requests invoke `CI` directly, while every `main` push invokes `Publish npm Packages` as its sole verification and release orchestrator; manual `CI` dispatch remains available for branch checks. The publish workflow requires every changed public project manifest to declare a stable version that is strictly greater than its base version when one exists. It selects changed public projects and every current repository version missing from npm, including a release left pending by an earlier failed or interrupted workflow, and calls the reusable CI workflow exactly once for every `main` commit, including successful no-op releases. It then publishes the exact checksummed tarballs in dependency order when releases are selected.

The reusable Linux verification job runs in the official Playwright image pinned to the exact `@playwright/test` version installed by the packages website. The image supplies Chromium and its operating-system dependencies, so CI does not perform an unbounded browser or system-package installation before verification. The Linux job binds the image's `/ms-playwright` browser directory explicitly, and the Turbo E2E task forwards that path through its strict environment allowlist. Package integration and E2E tasks run serially because several packages create real tarballs and isolated consumer installations whose concurrent package-manager and filesystem work is unreliable on shared runners, especially Windows. After checkout, CI explicitly trusts the container-mounted `GITHUB_WORKSPACE` Git path because it differs from the host path configured by the checkout action. Cross-platform macOS and Windows jobs continue installing only the matching Chromium binary required by their native test environments.

Package-owned full documentation under `projects/<project>/docs/**` is repository-owned website source and is not part of the npm package artifact by default. A docs-only change under that exact path does not select the project for release. Standardized `*.test-unit.*`, `*.test-integration.*`, `*.test-e2e.*`, and `*.test-bench.*` files are also excluded because production package builds must not emit them. `README.md`, `LICENSE`, `package.json`, declared package assets, public exports, and non-test source changes remain release-relevant. A change containing excluded documentation or tests together with release-relevant project files selects the project because of the release-relevant files.

## Release identity

| Project                     | Package                                | Tag format                             |
| --------------------------- | -------------------------------------- | -------------------------------------- |
| `repository`                | `@moldea.ai/repository`                | `repository-v<version>`                |
| `repository-fs`             | `@moldea.ai/repository-fs`             | `repository-fs-v<version>`             |
| `core`                      | `@moldea.ai/core`                      | `core-v<version>`                      |
| `adapter-anthropic`         | `@moldea.ai/adapter-anthropic`         | `adapter-anthropic-v<version>`         |
| `adapter-claude-agent-sdk`  | `@moldea.ai/adapter-claude-agent-sdk`  | `adapter-claude-agent-sdk-v<version>`  |
| `adapter-google-genai`      | `@moldea.ai/adapter-google-genai`      | `adapter-google-genai-v<version>`      |
| `adapter-openai`            | `@moldea.ai/adapter-openai`            | `adapter-openai-v<version>`            |
| `adapter-openai-agents-sdk` | `@moldea.ai/adapter-openai-agents-sdk` | `adapter-openai-agents-sdk-v<version>` |
| `adapter-cloudflare-agents` | `@moldea.ai/adapter-cloudflare-agents` | `adapter-cloudflare-agents-v<version>` |
| `adapter-vercel-ai-sdk`     | `@moldea.ai/adapter-vercel-ai-sdk`     | `adapter-vercel-ai-sdk-v<version>`     |
| `cli`                       | `@moldea.ai/cli`                       | `cli-v<version>`                       |
| `website-ui`                | `@moldea.ai/website-ui`                | `website-ui-v<version>`                |

Package versions follow their focused semantic-versioning contracts independently. A coordinated release may place multiple package tags on one commit, but it does not create a lockstep-versioning requirement.

Workflow-created tags are annotated but not cryptographically signed. The repository does not store a long-lived tag-signing key.

## Repository setup

Create a GitHub environment named `npm-release` and restrict deployment to `main`. Configure each existing npm package with this trusted publisher:

- provider: GitHub Actions
- organization: `moldea-ai`
- repository: `packages`
- workflow filename: `publish.yml`
- environment: `npm-release`
- allowed action: `npm publish`

The workflow uses npm OIDC and contains no npm publication token. The publication steps run in the reusable `publish-package.yml` workflow, but npm validates the calling workflow identity, so the trusted-publisher filename remains `publish.yml`. Both workflow boundaries grant the required OIDC permission while the reusable jobs keep tag-writing and package-publishing permissions separate. After a trusted publication succeeds, restrict traditional token-based publication for the package and revoke any temporary automation token.

## Preparing a release

1. Update every changed existing public project's manifest to a stable version strictly greater than the version at the previous `main` commit. A newly introduced project whose manifest is absent from that commit may start at any canonical stable version.
2. Update every directly affected first-class dependency range. The CLI requires exact versions for all first-class dependencies.
3. Regenerate compatibility artifacts when the CLI composition or compatibility claims change.
4. Update directly affected package and release documentation.
5. Complete review and merge the release commit into `main`.

Pull-request CI compares every public project directory with the target commit and rejects a changed existing project with an unchanged, lower, prerelease, or noncanonical version. A new project absent from the target commit is selected with no predecessor version and must still declare a canonical stable version. The resulting push to `main` repeats the comparison against the exact pushed commits, loads the published versions for every public package, and selects changed projects plus each current repository version absent from npm. An unpublished candidate uses the latest published version as its predecessor, so a safe skipped version can recover automatically while downgrades remain prohibited. A changed version already present on npm retains its base-commit predecessor so the reusable release boundary still validates its tag identity. The publish orchestrator verifies that commit once rather than starting a parallel standalone CI run. Selected projects pass one complete repository, supported-Node, cross-platform, packed-artifact, checksum, and runtime verification boundary before any tag or publication is attempted.

Repository publishes first, followed by Repository FS, Core, the Anthropic adapter, the Google Gen AI adapter, the OpenAI adapter, the OpenAI Agents SDK adapter, the Claude Agent SDK adapter, the Vercel AI SDK adapter, and the CLI. Website UI is independent of that runtime dependency chain and may publish after the shared verification boundary without waiting for those package jobs. An unselected package is skipped without blocking later selected packages. A failed package blocks every dependent downstream release, while a rerun or manual trusted dispatch can resume from a matching tag without republishing completed versions.

The workflow accepts stable semantic versions only. Prerelease versions and alternate npm distribution tags require a separately designed release path.

## First publication bootstrap

npm requires a package to exist before it can be connected to a trusted publisher. For a new package name:

1. Manually dispatch `Publish npm Packages` from `main` for the selected project in `bootstrap` mode. It verifies the complete release candidate, creates the annotated package tag, and retains `public-package-tarballs` without invoking `npm publish`.
2. Download the workflow artifact and verify its `SHA256SUMS` entries from the repository root:

   ```bash
   pnpm release:checksums verify ./public-package-tarballs
   ```

3. Publish the selected `.tgz` through an npm account protected by two-factor authentication:

   ```bash
   npm publish ./public-package-tarballs/moldea.ai-repository-1.0.0.tgz \
     --access public \
     --registry https://registry.npmjs.org/
   ```

4. Configure the trusted publisher through the package settings on npmjs.com using the fields under [Repository setup](#repository-setup). Explicitly select `npm publish` as an allowed action. The npm CLI bundled with the pinned Node.js version does not expose allowed-action selection, so it is not used for this setup step.

5. Repeat for the remaining initial packages in dependency order:
   1. `@moldea.ai/repository`
   2. `@moldea.ai/repository-fs`
   3. `@moldea.ai/core`
   4. `@moldea.ai/adapter-anthropic`
   5. `@moldea.ai/adapter-google-genai`
   6. `@moldea.ai/adapter-openai`
   7. `@moldea.ai/adapter-openai-agents-sdk`
   8. `@moldea.ai/adapter-claude-agent-sdk`
   9. `@moldea.ai/adapter-cloudflare-agents`
   10. `@moldea.ai/adapter-vercel-ai-sdk`
   11. `@moldea.ai/cli`
   12. `@moldea.ai/website-ui`

Repository FS and Core require a compatible Repository version to exist on npm. Every package-backed runtime adapter requires compatible Repository and Core versions. The CLI requires the exact Repository, Repository FS, Core, and active adapter versions declared by its release.

Website UI has no dependency on the runtime package chain, so its first publication may be bootstrapped independently after its own artifact passes the shared release verification boundary.

## Trusted publication

After each package has a trusted-publisher connection, ordinary releases require no manual dispatch. Merging a valid version-bumped package change into `main` verifies the release, creates or confirms the tag, and publishes only the selected tarball through OIDC. A later `main` push automatically retries any safe current package version still missing from npm. npm provenance is generated automatically for the public package.

Manual `trusted` mode remains available from `main` for explicit recovery when an automatic run must resume a package whose version is still unpublished.

## Recovery

The workflow never deletes, overwrites, or moves a release tag.

| npm version | Tag state        | Workflow behavior                                      |
| ----------- | ---------------- | ------------------------------------------------------ |
| Absent      | Absent           | Create the tag, then bootstrap or publish.             |
| Absent      | Same commit      | Resume trusted publication without recreating the tag. |
| Present     | Same commit      | Report the release as complete without republishing.   |
| Present     | Absent           | Stop for manual reconciliation.                        |
| Either      | Different commit | Stop without changing the tag or registry.             |

Repository-wide release concurrency serializes automatic and manual publication workflows and uses GitHub's maximum pending queue. Cancellation is disabled so newer pushes and dispatches neither interrupt an active release sequence nor replace an earlier pending release.

Queue order is not a release-integrity assumption. Before publishing an unpublished automatic candidate, the workflow identifies its latest published registry version as the predecessor and requires the candidate to be greater than every version already present in the registry. A changed version already present in the registry still reaches release preparation, where its tag must resolve to the candidate commit before the release is treated as complete. An unpublished current version is selected again by the next `main` push. An unexpectedly reordered run therefore stops before tagging or publishing; after the earlier release completes, rerun the stopped workflow or allow the next `main` push to resume the newer release safely.
