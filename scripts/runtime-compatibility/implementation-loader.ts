import { readFile } from 'node:fs/promises';

import {
  RECOGNIZED_RUNTIME_ADAPTER_IDS,
  SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
} from '../../projects/core/src/constants/index.ts';
import { ACTIVE_RUNTIME_ADAPTERS } from '../../projects/cli/src/core-composition/constants.ts';

import { validateMoldeaCliImplementation } from './implementation-validations.ts';
import type {
  IRuntimeAdapterImplementationDefinition,
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
 * Loads canonical workspace sources and validates the CLI implementation against the matrix.
 * @param repositoryRoot The repository root containing the canonical project manifests.
 * @param matrix The already validated and normalized compatibility matrix.
 * @returns A promise that resolves after every implementation source is consistent.
 * @throws
 * - If a source cannot be read or the implementation composition is inconsistent.
 */
export const validateMoldeaCliImplementationSources = async (
  repositoryRoot: URL,
  matrix: IRuntimeCompatibilityMatrix,
): Promise<void> => {
  const activeAdapters: readonly IRuntimeAdapterImplementationDefinition[] =
    ACTIVE_RUNTIME_ADAPTERS;
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

  validateMoldeaCliImplementation({
    activeAdapters,
    cliManifest,
    coreRecognizedAdapterIds: RECOGNIZED_RUNTIME_ADAPTER_IDS,
    coreSupportedRepositoryFormatVersions: SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
    matrix,
    packageManifests,
  });
};
