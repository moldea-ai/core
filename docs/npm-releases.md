# npm releases

Public packages are released automatically after their changes reach `main`. The `Publish npm Packages` workflow selects changed public project directories, requires each selected manifest to declare a stable version that is strictly greater than its base version when one exists, verifies the complete release candidate once, and publishes the exact checksummed tarballs in dependency order. A push without public-package changes is a successful no-op.

Package-owned full documentation under `projects/<project>/docs/**` is repository-owned website source and is not part of the npm package artifact by default. A docs-only change under that exact path does not select the project for release. `README.md`, `LICENSE`, `package.json`, declared package assets, public exports, and source changes remain release-relevant. A change containing both full documentation and release-relevant project files selects the project because of the release-relevant files.

## Release identity

| Project          | Package                     | Tag format                  |
| ---------------- | --------------------------- | --------------------------- |
| `repository`     | `@moldea.ai/repository`     | `repository-v<version>`     |
| `repository-fs`  | `@moldea.ai/repository-fs`  | `repository-fs-v<version>`  |
| `core`           | `@moldea.ai/core`           | `core-v<version>`           |
| `adapter-openai` | `@moldea.ai/adapter-openai` | `adapter-openai-v<version>` |
| `cli`            | `@moldea.ai/cli`            | `cli-v<version>`            |

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

Pull-request CI compares every public project directory with the target commit and rejects a changed existing project with an unchanged, lower, prerelease, or noncanonical version. A new project absent from the target commit is selected with no predecessor version and must still declare a canonical stable version. The resulting push to `main` repeats the comparison against the exact pushed commits before selecting releases. Selected projects pass one complete repository, supported-Node, cross-platform, packed-artifact, checksum, and runtime verification boundary before any tag or publication is attempted.

Repository publishes first, followed by Repository FS, Core, the OpenAI adapter, and the CLI. An unselected package is skipped without blocking later selected packages. A failed package blocks every dependent downstream release, while a rerun or manual trusted dispatch can resume from a matching tag without republishing completed versions.

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
   4. `@moldea.ai/adapter-openai`
   5. `@moldea.ai/cli`

Repository FS and Core require a compatible Repository version to exist on npm. The OpenAI adapter requires compatible Repository and Core versions. The CLI requires the exact Repository, Repository FS, Core, and active adapter versions declared by its release.

## Trusted publication

After each package has a trusted-publisher connection, ordinary releases require no manual dispatch. Merging a valid version-bumped package change into `main` verifies the release, creates or confirms the tag, and publishes only the selected tarball through OIDC. npm provenance is generated automatically for the public package.

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

Queue order is not a release-integrity assumption. Before publishing an automatic candidate, the workflow requires the package version from the preceding `main` commit to exist on npm. Every unpublished candidate must also be greater than all versions already present in the registry. An unexpectedly reordered run therefore stops before tagging or publishing; after the earlier release completes, rerun the stopped workflow to resume the newer release safely.
