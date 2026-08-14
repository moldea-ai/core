import { readFile } from 'node:fs/promises';

import { NPM_RELEASE_PROJECT_ORDER, NPM_RELEASE_PROJECTS } from './constants.ts';
import { hasGitProjectChanges, readGitFile } from './git.ts';
import type { INpmReleaseProjectChange, INpmReleaseWorkflowPlanSources } from './types.ts';

const readManifestVersion = (manifestSource: string, packageName: string): string => {
  const manifest = JSON.parse(manifestSource) as unknown;

  if (
    typeof manifest !== 'object' ||
    manifest === null ||
    Array.isArray(manifest) ||
    !('name' in manifest) ||
    manifest.name !== packageName ||
    !('version' in manifest) ||
    typeof manifest.version !== 'string'
  ) {
    throw new TypeError(`The ${packageName} package manifest is invalid.`);
  }

  return manifest.version;
};

/**
 * Loads every public project's package-version and Git change state.
 * @param repositoryRoot The checked-out repository root.
 * @param baseCommit The optional commit before an automatic release.
 * @param currentCommit The optional commit containing the release candidates.
 * @returns The complete per-project change inventory.
 * @throws
 * - If commit inputs are incomplete or a package manifest cannot be read safely
 */
export const loadNpmReleaseProjectChanges = async (
  repositoryRoot: URL,
  baseCommit: string | null,
  currentCommit: string | null,
): Promise<INpmReleaseWorkflowPlanSources['projectChanges']> => {
  if ((baseCommit === null) !== (currentCommit === null)) {
    throw new TypeError('The npm release comparison commits are incomplete.');
  }

  return Object.fromEntries(
    await Promise.all(
      NPM_RELEASE_PROJECT_ORDER.map(async (project) => {
        const configuration = NPM_RELEASE_PROJECTS[project];
        const manifestPath = `${configuration.projectDirectory}/package.json`;
        const currentManifestSource =
          currentCommit === null
            ? await readFile(new URL(manifestPath, repositoryRoot), 'utf8')
            : readGitFile(repositoryRoot, currentCommit, manifestPath);
        const currentVersion = readManifestVersion(
          currentManifestSource,
          configuration.packageName,
        );
        const previousVersion =
          baseCommit === null
            ? currentVersion
            : readManifestVersion(
                readGitFile(repositoryRoot, baseCommit, manifestPath),
                configuration.packageName,
              );
        const change: INpmReleaseProjectChange = {
          currentVersion,
          isChanged:
            baseCommit !== null && currentCommit !== null
              ? hasGitProjectChanges(
                  repositoryRoot,
                  baseCommit,
                  currentCommit,
                  configuration.projectDirectory,
                )
              : false,
          previousVersion,
        };

        return [project, change] as const;
      }),
    ),
  ) as INpmReleaseWorkflowPlanSources['projectChanges'];
};
