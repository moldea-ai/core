import { satisfies as doesVersionSatisfy, valid as isValidVersion, validRange } from 'semver';

import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';

import type { IMoldeaCliRuntimeAdapterEntry } from '../release-metadata/index.js';

import {
  MOLDEA_CLI_ADAPTER_IMPLEMENTATION_STATUSES,
  MOLDEA_CLI_ADAPTER_PACKAGE_PREFIX,
  MOLDEA_CLI_CUSTOM_ADAPTER_ID,
  MOLDEA_CLI_FOUNDATIONAL_PACKAGE_NAMES,
  MOLDEA_CLI_PACKAGE_NAME,
} from './constants.js';
import type { IMoldeaCliCompatibilityStateInput, IMoldeaCliPackageCompatibility } from './types.js';

/** Compares the ASCII package and official-adapter identifiers used by this release. */
const compareIdentifiers = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }

  return left > right ? 1 : 0;
};

/** Checks exact set equality while rejecting duplicate string identities. */
const hasExactStringSet = (left: readonly string[], right: readonly string[]): boolean => {
  if (
    left.length !== right.length ||
    new Set(left).size !== left.length ||
    new Set(right).size !== right.length
  ) {
    return false;
  }

  const normalizedLeft = [...left].sort(compareIdentifiers);
  const normalizedRight = [...right].sort(compareIdentifiers);

  return normalizedLeft.every((entry, index) => entry === normalizedRight[index]);
};

/** Checks one array for unique positive safe integers without imposing order. */
const hasUniquePositiveIntegers = (entries: readonly number[]): boolean =>
  entries.every((entry) => Number.isSafeInteger(entry) && entry > 0) &&
  new Set(entries).size === entries.length;

/** Checks exact set equality for finite positive integer repository-format versions. */
const hasExactNumberSet = (left: readonly number[], right: readonly number[]): boolean => {
  if (
    left.length !== right.length ||
    !hasUniquePositiveIntegers(left) ||
    !hasUniquePositiveIntegers(right)
  ) {
    return false;
  }

  const normalizedLeft = [...left].sort((leftEntry, rightEntry) => leftEntry - rightEntry);
  const normalizedRight = [...right].sort((leftEntry, rightEntry) => leftEntry - rightEntry);

  return normalizedLeft.every((entry, index) => entry === normalizedRight[index]);
};

/** Checks that an already normalized string array remains in deterministic order. */
const isCanonicalStringArray = (entries: readonly string[]): boolean =>
  entries.every(
    (entry, index) => index === 0 || compareIdentifiers(entries[index - 1] ?? '', entry) < 0,
  );

/** Checks that an already normalized number array is unique and ascending. */
const isCanonicalNumberArray = (entries: readonly number[]): boolean =>
  hasUniquePositiveIntegers(entries) &&
  entries.every(
    (entry, index) => index === 0 || (entries[index - 1] ?? Number.NEGATIVE_INFINITY) < entry,
  );

/** Creates a unique package map only when every generated package record is usable. */
const createPackageMap = (
  packages: readonly IMoldeaCliPackageCompatibility[],
): ReadonlyMap<string, IMoldeaCliPackageCompatibility> | null => {
  const packageMap = new Map<string, IMoldeaCliPackageCompatibility>();

  for (const packageMetadata of packages) {
    if (packageMap.has(packageMetadata.name) || isValidVersion(packageMetadata.version) === null) {
      return null;
    }

    packageMap.set(packageMetadata.name, packageMetadata);
  }

  return packageMap;
};

/** Creates a unique active-adapter map with valid deterministic format declarations. */
const createActiveAdapterMap = (
  adapters: readonly IRuntimeAdapter[],
): ReadonlyMap<string, IRuntimeAdapter> | null => {
  const adapterMap = new Map<string, IRuntimeAdapter>();

  for (const adapter of adapters) {
    if (
      adapterMap.has(adapter.id) ||
      adapter.id === MOLDEA_CLI_CUSTOM_ADAPTER_ID ||
      !hasUniquePositiveIntegers(adapter.supportedRepositoryFormatVersions)
    ) {
      return null;
    }

    adapterMap.set(adapter.id, adapter);
  }

  return adapterMap;
};

/** Checks one optional semantic-version range without normalizing its source text. */
const isValidOptionalRange = (versionRange: string | undefined): boolean =>
  versionRange === undefined || validRange(versionRange) !== null;

/** Checks the implementation identity and optional ranges shared by every matrix entry. */
const hasValidMatrixEntryBase = (
  adapterId: string,
  matrixEntry: IMoldeaCliRuntimeAdapterEntry,
): boolean => {
  if (
    !MOLDEA_CLI_ADAPTER_IMPLEMENTATION_STATUSES.includes(matrixEntry.implementationStatus) ||
    !isValidOptionalRange(matrixEntry.implementation.versionRange) ||
    !isValidOptionalRange(matrixEntry.compatibleCoreRange)
  ) {
    return false;
  }

  if (
    matrixEntry.supportedRepositoryFormatVersions !== undefined &&
    !isCanonicalNumberArray(matrixEntry.supportedRepositoryFormatVersions)
  ) {
    return false;
  }

  if (adapterId === MOLDEA_CLI_CUSTOM_ADAPTER_ID) {
    return (
      matrixEntry.implementation.kind === 'built-in' &&
      matrixEntry.implementation.package === '@moldea.ai/core'
    );
  }

  return (
    matrixEntry.implementation.kind === 'package' &&
    matrixEntry.implementation.package === `${MOLDEA_CLI_ADAPTER_PACKAGE_PREFIX}${adapterId}`
  );
};

/** Checks that an unpublished matrix entry carries no runtime support claim. */
const hasNoPublishedSupport = (matrixEntry: IMoldeaCliRuntimeAdapterEntry): boolean =>
  matrixEntry.implementation.versionRange === undefined &&
  matrixEntry.compatibleCoreRange === undefined &&
  matrixEntry.supportedRepositoryFormatVersions === undefined &&
  matrixEntry.runtimeGuidance === undefined &&
  matrixEntry.targets === undefined &&
  matrixEntry.lastVerifiedAt === undefined &&
  matrixEntry.replacement === undefined;

/** Checks the support fields required by available and deprecated entries. */
const hasCompletePublishedSupport = (matrixEntry: IMoldeaCliRuntimeAdapterEntry): boolean =>
  matrixEntry.compatibleCoreRange !== undefined &&
  matrixEntry.supportedRepositoryFormatVersions !== undefined &&
  matrixEntry.supportedRepositoryFormatVersions.length > 0 &&
  matrixEntry.runtimeGuidance !== undefined &&
  matrixEntry.targets !== undefined &&
  matrixEntry.targets.length > 0 &&
  typeof matrixEntry.lastVerifiedAt === 'string' &&
  matrixEntry.lastVerifiedAt.length > 0;

/** Checks target ownership and current-support requirements for one available entry. */
const hasValidAvailableTargets = (
  adapterId: string,
  matrixEntry: IMoldeaCliRuntimeAdapterEntry,
): boolean => {
  const targets = matrixEntry.targets ?? [];

  if (adapterId === MOLDEA_CLI_CUSTOM_ADAPTER_ID) {
    const customTarget = targets[0];

    return (
      targets.length === 1 &&
      customTarget?.id === MOLDEA_CLI_CUSTOM_ADAPTER_ID &&
      customTarget.kind === 'custom' &&
      customTarget.language === 'any' &&
      customTarget.supportLevel === 'supported'
    );
  }

  return (
    targets.every(({ kind }) => kind === 'package') &&
    targets.some(
      ({ supportLevel }) => supportLevel === 'experimental' || supportLevel === 'supported',
    )
  );
};

/** Enforces the matrix's complete status-dependent support-field contract. */
const hasValidMatrixEntryState = (
  adapterId: string,
  matrixEntry: IMoldeaCliRuntimeAdapterEntry,
  matrixAdapters: Readonly<Record<string, IMoldeaCliRuntimeAdapterEntry>>,
): boolean => {
  if (
    matrixEntry.implementationStatus === 'planned' ||
    matrixEntry.implementationStatus === 'in-development'
  ) {
    return hasNoPublishedSupport(matrixEntry);
  }

  if (!hasCompletePublishedSupport(matrixEntry)) {
    return false;
  }

  if (matrixEntry.implementationStatus === 'available') {
    if (
      matrixEntry.replacement !== undefined ||
      !hasValidAvailableTargets(adapterId, matrixEntry)
    ) {
      return false;
    }

    if (adapterId === MOLDEA_CLI_CUSTOM_ADAPTER_ID) {
      return matrixEntry.implementation.versionRange === undefined;
    }

    return matrixEntry.implementation.versionRange !== undefined;
  }

  if (adapterId === MOLDEA_CLI_CUSTOM_ADAPTER_ID) {
    return false;
  }

  const replacementEntry =
    matrixEntry.replacement === undefined ? undefined : matrixAdapters[matrixEntry.replacement];

  return (
    matrixEntry.implementation.versionRange !== undefined &&
    matrixEntry.targets?.every(
      ({ kind, supportLevel }) => kind === 'package' && supportLevel === 'deprecated',
    ) === true &&
    (matrixEntry.replacement === undefined ||
      (matrixEntry.replacement !== adapterId &&
        replacementEntry?.implementationStatus === 'available'))
  );
};

/** Checks the built-in custom entry against the actual bundled Core composition. */
const hasValidCustomCompatibility = (
  matrixEntry: IMoldeaCliRuntimeAdapterEntry,
  coreVersion: string,
  coreRepositoryFormatVersions: readonly number[],
): boolean => {
  if (matrixEntry.implementationStatus !== 'available') {
    return true;
  }

  return (
    matrixEntry.compatibleCoreRange !== undefined &&
    doesVersionSatisfy(coreVersion, matrixEntry.compatibleCoreRange) &&
    hasExactNumberSet(
      matrixEntry.supportedRepositoryFormatVersions ?? [],
      coreRepositoryFormatVersions,
    )
  );
};

/** Checks one package-backed matrix entry against its actual CLI registration. */
const hasValidPackageAdapterCompatibility = (
  matrixEntry: IMoldeaCliRuntimeAdapterEntry,
  adapter: IRuntimeAdapter | undefined,
  bundledPackage: IMoldeaCliPackageCompatibility | undefined,
  coreVersion: string,
  coreRepositoryFormatVersions: readonly number[],
): boolean => {
  const isActive = adapter !== undefined;

  if (matrixEntry.implementationStatus === 'available' && !isActive) {
    return false;
  }

  if (
    isActive &&
    (matrixEntry.implementationStatus === 'planned' ||
      matrixEntry.implementationStatus === 'in-development')
  ) {
    return false;
  }

  if (!isActive) {
    return bundledPackage === undefined;
  }

  if (
    bundledPackage === undefined ||
    matrixEntry.implementation.versionRange === undefined ||
    !doesVersionSatisfy(bundledPackage.version, matrixEntry.implementation.versionRange) ||
    matrixEntry.compatibleCoreRange === undefined ||
    !doesVersionSatisfy(coreVersion, matrixEntry.compatibleCoreRange) ||
    !hasExactNumberSet(
      adapter.supportedRepositoryFormatVersions,
      matrixEntry.supportedRepositoryFormatVersions ?? [],
    )
  ) {
    return false;
  }

  return adapter.supportedRepositoryFormatVersions.every((formatVersion) =>
    coreRepositoryFormatVersions.includes(formatVersion),
  );
};

/** Checks declared and actually resolved packages against exact generated release versions. */
const hasValidInstalledPackageComposition = (
  dependencies: Readonly<Record<string, string>> | null,
  installedPackageVersions: Readonly<Record<string, string>> | null,
  packageMap: ReadonlyMap<string, IMoldeaCliPackageCompatibility>,
): boolean => {
  if (dependencies === null || installedPackageVersions === null) {
    return false;
  }

  const actualPackageNames = Object.keys(dependencies).filter((packageName) =>
    packageName.startsWith('@moldea.ai/'),
  );
  const expectedPackageNames = [...packageMap.keys()];

  if (
    !hasExactStringSet(actualPackageNames, expectedPackageNames) ||
    !hasExactStringSet(Object.keys(installedPackageVersions), expectedPackageNames)
  ) {
    return false;
  }

  return expectedPackageNames.every((packageName) => {
    const expectedVersion = packageMap.get(packageName)?.version;
    const dependencyVersion = dependencies[packageName];

    return (
      expectedVersion !== undefined &&
      installedPackageVersions[packageName] === expectedVersion &&
      (dependencyVersion === expectedVersion ||
        dependencyVersion === `workspace:${expectedVersion}`)
    );
  });
};

/**
 * Verifies that generated release metadata and the installed runtime composition agree exactly.
 * @param input The generated, installed, Core, adapter, Git, and JSON-schema state.
 * @returns Whether every runtime compatibility invariant is satisfied.
 */
export const isMoldeaCliCompatibilityStateValid = (
  input: IMoldeaCliCompatibilityStateInput,
): boolean => {
  const { releaseMetadata } = input;

  if (
    releaseMetadata.cliPackage.name !== MOLDEA_CLI_PACKAGE_NAME ||
    isValidVersion(releaseMetadata.cliPackage.version) === null ||
    releaseMetadata.cliPackage.version !== input.packageMetadata.version ||
    validRange(releaseMetadata.cliPackage.supportedNodeRange) === null ||
    releaseMetadata.cliPackage.supportedNodeRange !== input.packageMetadata.supportedNodeRange ||
    releaseMetadata.minimumGitVersion !== input.minimumGitVersion ||
    isValidVersion(releaseMetadata.minimumGitVersion) === null ||
    releaseMetadata.outputSchemaVersion !== input.outputSchemaVersion ||
    releaseMetadata.matrix.version !== 1 ||
    !isCanonicalStringArray(releaseMetadata.activeAdapterIds) ||
    !isCanonicalNumberArray(releaseMetadata.repositoryFormatVersions) ||
    !hasExactNumberSet(
      releaseMetadata.repositoryFormatVersions,
      input.coreSupportedRepositoryFormatVersions,
    )
  ) {
    return false;
  }

  const matrixAdapterIds = Object.keys(releaseMetadata.matrix.adapters);
  if (
    !isCanonicalStringArray(matrixAdapterIds) ||
    !hasExactStringSet(matrixAdapterIds, input.coreRecognizedAdapterIds)
  ) {
    return false;
  }

  const packageMap = createPackageMap(releaseMetadata.packages);
  const activeAdapterMap = createActiveAdapterMap(input.activeAdapters);

  if (
    packageMap === null ||
    activeAdapterMap === null ||
    !isCanonicalStringArray(releaseMetadata.packages.map(({ name }) => name)) ||
    !hasExactStringSet(releaseMetadata.activeAdapterIds, [...activeAdapterMap.keys()])
  ) {
    return false;
  }

  const corePackage = packageMap.get('@moldea.ai/core');
  if (corePackage === undefined) {
    return false;
  }

  const expectedPackageNames = new Set<string>(MOLDEA_CLI_FOUNDATIONAL_PACKAGE_NAMES);
  for (const adapterId of matrixAdapterIds) {
    const matrixEntry = releaseMetadata.matrix.adapters[adapterId];

    if (
      matrixEntry === undefined ||
      !hasValidMatrixEntryBase(adapterId, matrixEntry) ||
      !hasValidMatrixEntryState(adapterId, matrixEntry, releaseMetadata.matrix.adapters)
    ) {
      return false;
    }

    if (adapterId === MOLDEA_CLI_CUSTOM_ADAPTER_ID) {
      if (
        !hasValidCustomCompatibility(
          matrixEntry,
          corePackage.version,
          input.coreSupportedRepositoryFormatVersions,
        )
      ) {
        return false;
      }

      continue;
    }

    const activeAdapter = activeAdapterMap.get(adapterId);
    const bundledPackage = packageMap.get(matrixEntry.implementation.package);

    if (activeAdapter !== undefined) {
      expectedPackageNames.add(matrixEntry.implementation.package);
    }

    if (
      !hasValidPackageAdapterCompatibility(
        matrixEntry,
        activeAdapter,
        bundledPackage,
        corePackage.version,
        input.coreSupportedRepositoryFormatVersions,
      )
    ) {
      return false;
    }
  }

  return (
    hasExactStringSet([...packageMap.keys()], [...expectedPackageNames]) &&
    hasValidInstalledPackageComposition(
      input.packageMetadata.dependencies,
      input.packageMetadata.installedPackageVersions,
      packageMap,
    )
  );
};
