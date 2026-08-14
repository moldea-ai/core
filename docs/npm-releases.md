# npm releases

Public packages are released independently from the `main` branch through the manually dispatched `Publish npm Package` workflow. The workflow creates one immutable package-qualified Git tag and publishes the exact checksummed tarball that passed the complete repository, supported-Node, and cross-platform CI boundary.

## Release identity

| Project         | Package                    | Tag format                 |
| --------------- | -------------------------- | -------------------------- |
| `repository`    | `@moldea.ai/repository`    | `repository-v<version>`    |
| `repository-fs` | `@moldea.ai/repository-fs` | `repository-fs-v<version>` |
| `core`          | `@moldea.ai/core`          | `core-v<version>`          |
| `cli`           | `@moldea.ai/cli`           | `cli-v<version>`           |

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

The workflow uses npm OIDC and contains no npm publication token. After a trusted publication succeeds, restrict traditional token-based publication for the package and revoke any temporary automation token.

## Preparing a release

1. Update the selected package version and every directly affected first-class dependency range.
2. Regenerate compatibility artifacts when the CLI composition or compatibility claims change.
3. Update directly affected package and release documentation.
4. Complete review and merge the release commit into `main` with all CI checks passing.
5. Dispatch `Publish npm Package` from `main`, selecting one project and the appropriate release mode.

The workflow accepts stable semantic versions only. Prerelease versions and alternate npm distribution tags require a separately designed release path.

## First publication bootstrap

npm requires a package to exist before it can be connected to a trusted publisher. For a new package name:

1. Dispatch the workflow in `bootstrap` mode. It verifies the complete release candidate, creates the annotated package tag, and retains `public-package-tarballs` without invoking `npm publish`.
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
   4. `@moldea.ai/cli`

Repository FS and Core require a compatible Repository version to exist on npm. The CLI requires the exact Repository, Repository FS, and Core versions declared by its release.

## Trusted publication

After the selected package has a trusted-publisher connection, dispatch the workflow in `trusted` mode. The workflow verifies the release, creates or confirms the tag, and publishes only the selected tarball through OIDC. npm provenance is generated automatically for the public package.

## Recovery

The workflow never deletes, overwrites, or moves a release tag.

| npm version | Tag state        | Workflow behavior                                      |
| ----------- | ---------------- | ------------------------------------------------------ |
| Absent      | Absent           | Create the tag, then bootstrap or publish.             |
| Absent      | Same commit      | Resume trusted publication without recreating the tag. |
| Present     | Same commit      | Report the release as complete without republishing.   |
| Present     | Absent           | Stop for manual reconciliation.                        |
| Either      | Different commit | Stop without changing the tag or registry.             |

Package-specific concurrency prevents simultaneous releases of one project. Cancellation is disabled so a newer dispatch cannot interrupt an in-progress publication.
