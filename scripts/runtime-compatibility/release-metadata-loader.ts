import { readFile } from 'node:fs/promises';

import {
  RECOGNIZED_RUNTIME_ADAPTER_IDS,
  SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
} from '../../projects/core/src/constants/index.ts';
import { ACTIVE_RUNTIME_ADAPTER_RELEASE_DEFINITIONS } from '../../projects/cli/src/core-composition/release-definitions/index.ts';
import { MINIMUM_GIT_VERSION } from '../../projects/cli/src/git-version/constants.ts';
import { MOLDEA_CLI_JSON_SCHEMA_VERSION } from '../../projects/cli/src/json-output-contract/index.ts';

import { createMoldeaCliReleaseMetadata } from './release-metadata-validations.ts';
import type {
  IMoldeaCliGeneratedReleaseMetadata,
  IRuntimeAdapterReleaseDefinition,
  IRuntimeCompatibilityMatrix,
} from './types.ts';

const FOUNDATIONAL_PACKAGE_NAMES = [
  '@moldea.ai/core',
  '@moldea.ai/repository',
  '@moldea.ai/repository-fs',
] as const;
const PACKAGE_NAME_PREFIX = '@moldea.ai/';

const getProjectManifestPath = (packageName: string): string => {
  if (!packageName.startsWith(PACKAGE_NAME_PREFIX)) {
    throw new TypeError(`The ${packageName} package is outside the moldea project catalog.`);
  }

  return `projects/${packageName.slice(PACKAGE_NAME_PREFIX.length)}/package.json`;
};

const readJson = async (url: URL): Promise<unknown> => JSON.parse(await readFile(url, 'utf8'));

/**
 * Loads canonical workspace sources and produces validated CLI release metadata.
 * @param repositoryRoot The repository root containing the canonical project manifests.
 * @param matrix The already validated and normalized compatibility matrix.
 * @returns The exact deterministic metadata to bundle into the CLI executable.
 * @throws
 * - If a source cannot be read or the release composition is inconsistent.
 */
export const loadMoldeaCliReleaseMetadata = async (
  repositoryRoot: URL,
  matrix: IRuntimeCompatibilityMatrix,
): Promise<IMoldeaCliGeneratedReleaseMetadata> => {
  const activeAdapters: readonly IRuntimeAdapterReleaseDefinition[] =
    ACTIVE_RUNTIME_ADAPTER_RELEASE_DEFINITIONS;
  const activePackageNames = activeAdapters.map(({ id }) => {
    const packageName = matrix.adapters[id]?.implementation.package;

    if (packageName === undefined) {
      throw new TypeError(`The active ${id} adapter is absent from the compatibility matrix.`);
    }

    return packageName;
  });
  const packageNames = [...FOUNDATIONAL_PACKAGE_NAMES, ...activePackageNames];
  const [cliManifest, ...packageManifestValues] = await Promise.all([
    readJson(new URL('projects/cli/package.json', repositoryRoot)),
    ...packageNames.map((packageName) =>
      readJson(new URL(getProjectManifestPath(packageName), repositoryRoot)),
    ),
  ]);
  const packageManifests = Object.fromEntries(
    packageNames.map((packageName, index) => [packageName, packageManifestValues[index]]),
  );

  return createMoldeaCliReleaseMetadata({
    activeAdapters,
    cliManifest,
    coreRecognizedAdapterIds: RECOGNIZED_RUNTIME_ADAPTER_IDS,
    coreSupportedRepositoryFormatVersions: SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
    matrix,
    minimumGitVersion: MINIMUM_GIT_VERSION,
    outputSchemaVersion: MOLDEA_CLI_JSON_SCHEMA_VERSION,
    packageManifests,
  });
};
