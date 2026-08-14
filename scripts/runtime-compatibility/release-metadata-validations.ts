import { satisfies as doesVersionSatisfy, valid as isValidVersion, validRange } from 'semver';

import type {
  IMoldeaCliGeneratedReleaseMetadata,
  IMoldeaCliReleaseMetadataSources,
  IMoldeaPackageManifestSource,
  IRuntimeAdapterEntry,
  IRuntimeAdapterReleaseDefinition,
} from './types.ts';
import { compareExactStrings, isRecord, isStrictSingleLine } from './utilities.ts';

const MOLDEA_CLI_PACKAGE_NAME = '@moldea.ai/cli';
const FOUNDATIONAL_PACKAGE_NAMES = [
  '@moldea.ai/core',
  '@moldea.ai/repository',
  '@moldea.ai/repository-fs',
] as const;
const MOLDEA_ADAPTER_PACKAGE_PREFIX = '@moldea.ai/adapter-';

/** Validates the package identity and version fields used by release generation. */
const requireManifest = (value: unknown, expectedName: string): IMoldeaPackageManifestSource => {
  if (
    !isRecord(value) ||
    value['name'] !== expectedName ||
    typeof value['version'] !== 'string' ||
    isValidVersion(value['version']) === null
  ) {
    throw new TypeError(`The ${expectedName} package manifest is invalid.`);
  }

  const dependencies = value['dependencies'];
  const engines = value['engines'];

  if (dependencies !== undefined && !isRecord(dependencies)) {
    throw new TypeError(`The ${expectedName} package dependencies are invalid.`);
  }

  if (engines !== undefined && !isRecord(engines)) {
    throw new TypeError(`The ${expectedName} package engines are invalid.`);
  }

  return {
    ...(dependencies === undefined
      ? {}
      : {
          dependencies: Object.fromEntries(
            Object.entries(dependencies).map(([name, version]) => {
              if (typeof version !== 'string') {
                throw new TypeError(`The ${expectedName} package dependencies are invalid.`);
              }

              return [name, version];
            }),
          ),
        }),
    ...(engines === undefined
      ? {}
      : {
          engines: Object.fromEntries(
            Object.entries(engines).map(([name, version]) => {
              if (typeof version !== 'string') {
                throw new TypeError(`The ${expectedName} package engines are invalid.`);
              }

              return [name, version];
            }),
          ),
        }),
    name: expectedName,
    version: value['version'],
  };
};

const requireExactStringSet = (
  actualValues: readonly string[],
  expectedValues: readonly string[],
  description: string,
): void => {
  const actual = [...actualValues].sort(compareExactStrings);
  const expected = [...expectedValues].sort(compareExactStrings);

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${description} is inconsistent.`);
  }
};

const requireExactNumberSet = (
  actualValues: readonly number[],
  expectedValues: readonly number[],
  description: string,
): void => {
  const actual = [...actualValues].sort((left, right) => left - right);
  const expected = [...expectedValues].sort((left, right) => left - right);

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${description} is inconsistent.`);
  }
};

const getActiveAdapter = (
  adapters: readonly IRuntimeAdapterReleaseDefinition[],
  adapterId: string,
): IRuntimeAdapterReleaseDefinition | undefined => {
  return adapters.find(({ id }) => id === adapterId);
};

const validatePublishedAdapter = (
  adapterId: string,
  matrixEntry: IRuntimeAdapterEntry,
  sources: IMoldeaCliReleaseMetadataSources,
  coreVersion: string,
  cliDependencies: Readonly<Record<string, string>>,
): void => {
  if (adapterId === 'custom') {
    if (
      matrixEntry.implementationStatus === 'available' &&
      (matrixEntry.compatibleCoreRange === undefined ||
        !doesVersionSatisfy(coreVersion, matrixEntry.compatibleCoreRange))
    ) {
      throw new TypeError('The custom adapter Core compatibility range is inconsistent.');
    }

    if (matrixEntry.implementationStatus === 'available') {
      requireExactNumberSet(
        matrixEntry.supportedRepositoryFormatVersions ?? [],
        sources.coreSupportedRepositoryFormatVersions,
        'The custom adapter repository-format support',
      );
    }

    return;
  }

  const activeAdapter = getActiveAdapter(sources.activeAdapters, adapterId);

  if (matrixEntry.implementationStatus === 'available' && activeAdapter === undefined) {
    throw new TypeError(`The available ${adapterId} adapter is not active in the CLI release.`);
  }

  if (activeAdapter === undefined) {
    return;
  }

  if (
    matrixEntry.implementationStatus !== 'available' &&
    matrixEntry.implementationStatus !== 'deprecated'
  ) {
    throw new TypeError(`The ${adapterId} adapter cannot be active while unpublished.`);
  }

  const packageName = matrixEntry.implementation.package;
  const packageManifest = requireManifest(sources.packageManifests[packageName], packageName);
  const dependencyVersion = cliDependencies[packageName];

  if (dependencyVersion !== `workspace:${packageManifest.version}`) {
    throw new TypeError(`The ${packageName} CLI dependency is not pinned to its exact version.`);
  }

  if (
    matrixEntry.implementation.versionRange === undefined ||
    !doesVersionSatisfy(packageManifest.version, matrixEntry.implementation.versionRange)
  ) {
    throw new TypeError(`The ${packageName} version is outside its matrix implementation range.`);
  }

  if (
    matrixEntry.compatibleCoreRange === undefined ||
    !doesVersionSatisfy(coreVersion, matrixEntry.compatibleCoreRange)
  ) {
    throw new TypeError(`The ${packageName} Core compatibility range is inconsistent.`);
  }

  requireExactNumberSet(
    activeAdapter.supportedRepositoryFormatVersions,
    matrixEntry.supportedRepositoryFormatVersions ?? [],
    `The ${adapterId} adapter repository-format support`,
  );

  if (
    activeAdapter.supportedRepositoryFormatVersions.some(
      (version) => !sources.coreSupportedRepositoryFormatVersions.includes(version),
    )
  ) {
    throw new TypeError(`The ${adapterId} adapter declares a Core-unsupported format version.`);
  }
};

/**
 * Validates canonical sources and creates one normalized CLI release-metadata value.
 * @param sources The package, Core, adapter-registration, and compatibility-matrix sources.
 * @returns The exact deterministic metadata to bundle into the CLI executable.
 * @throws
 * - If the canonical sources are malformed, incomplete, or mutually inconsistent.
 */
export const createMoldeaCliReleaseMetadata = (
  sources: IMoldeaCliReleaseMetadataSources,
): IMoldeaCliGeneratedReleaseMetadata => {
  const cliManifest = requireManifest(sources.cliManifest, MOLDEA_CLI_PACKAGE_NAME);
  const supportedNodeRange = cliManifest.engines?.['node'];

  if (
    supportedNodeRange === undefined ||
    !isStrictSingleLine(supportedNodeRange) ||
    validRange(supportedNodeRange) === null
  ) {
    throw new TypeError('The CLI Node.js engine range is invalid.');
  }

  if (isValidVersion(sources.minimumGitVersion) === null) {
    throw new TypeError('The minimum Git version is invalid.');
  }

  const matrixAdapterIds = Object.keys(sources.matrix.adapters).sort(compareExactStrings);
  requireExactStringSet(
    sources.coreRecognizedAdapterIds,
    matrixAdapterIds,
    'The Core and matrix adapter inventory',
  );

  const activeAdapterIds = sources.activeAdapters.map(({ id }) => id);
  if (new Set(activeAdapterIds).size !== activeAdapterIds.length) {
    throw new TypeError('The active CLI adapter IDs contain duplicates.');
  }

  if (activeAdapterIds.includes('custom')) {
    throw new TypeError('The built-in custom adapter cannot be registered by the CLI.');
  }

  const packageManifests = FOUNDATIONAL_PACKAGE_NAMES.map((packageName) =>
    requireManifest(sources.packageManifests[packageName], packageName),
  );
  const coreManifest = packageManifests.find(({ name }) => name === '@moldea.ai/core');
  const cliDependencies = cliManifest.dependencies;

  if (coreManifest === undefined || cliDependencies === undefined) {
    throw new TypeError('The CLI release package composition is incomplete.');
  }

  const expectedMoldeaDependencies = new Set<string>(FOUNDATIONAL_PACKAGE_NAMES);
  for (const [adapterId, matrixEntry] of Object.entries(sources.matrix.adapters)) {
    validatePublishedAdapter(
      adapterId,
      matrixEntry,
      sources,
      coreManifest.version,
      cliDependencies,
    );

    if (getActiveAdapter(sources.activeAdapters, adapterId) !== undefined) {
      expectedMoldeaDependencies.add(matrixEntry.implementation.package);
      packageManifests.push(
        requireManifest(
          sources.packageManifests[matrixEntry.implementation.package],
          matrixEntry.implementation.package,
        ),
      );
    }
  }

  const actualMoldeaDependencies = Object.keys(cliDependencies).filter((packageName) =>
    packageName.startsWith('@moldea.ai/'),
  );
  requireExactStringSet(
    actualMoldeaDependencies,
    [...expectedMoldeaDependencies],
    'The CLI first-class dependency set',
  );

  const dependencyAdapterIds = actualMoldeaDependencies
    .filter((packageName) => packageName.startsWith(MOLDEA_ADAPTER_PACKAGE_PREFIX))
    .map((packageName) => packageName.slice(MOLDEA_ADAPTER_PACKAGE_PREFIX.length));
  requireExactStringSet(
    activeAdapterIds,
    dependencyAdapterIds,
    'The CLI active adapter registration',
  );

  for (const packageManifest of packageManifests) {
    if (cliDependencies[packageManifest.name] !== `workspace:${packageManifest.version}`) {
      throw new TypeError(
        `The ${packageManifest.name} CLI dependency is not pinned to its exact version.`,
      );
    }
  }

  return {
    activeAdapterIds: [...activeAdapterIds].sort(compareExactStrings),
    cliPackage: {
      name: cliManifest.name,
      supportedNodeRange,
      version: cliManifest.version,
    },
    coreRecognizedAdapterIds: [...sources.coreRecognizedAdapterIds].sort(compareExactStrings),
    matrix: sources.matrix,
    minimumGitVersion: sources.minimumGitVersion,
    outputSchemaVersion: sources.outputSchemaVersion,
    packages: packageManifests
      .map(({ name, version }) => ({ name, version }))
      .sort((left, right) => compareExactStrings(left.name, right.name)),
    repositoryFormatVersions: [...sources.coreSupportedRepositoryFormatVersions].sort(
      (left, right) => left - right,
    ),
  };
};
