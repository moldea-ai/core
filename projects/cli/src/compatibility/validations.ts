import { valid as isValidVersion, validRange } from 'semver';

import type { IRuntimeAdapter } from '@moldea.ai/core/adapter';

import {
  MOLDEA_CLI_ADAPTER_PACKAGE_PREFIX,
  MOLDEA_CLI_CUSTOM_ADAPTER_ID,
  MOLDEA_CLI_FOUNDATIONAL_PACKAGE_NAMES,
} from './constants.js';
import type { IMoldeaCliCompatibilityStateInput } from './types.js';

const ADAPTER_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const hasExactStringSet = (left: readonly string[], right: readonly string[]): boolean => {
  if (
    left.length !== right.length ||
    new Set(left).size !== left.length ||
    new Set(right).size !== right.length
  ) {
    return false;
  }

  const rightValues = new Set(right);
  return left.every((entry) => rightValues.has(entry));
};

const hasUniquePositiveIntegers = (entries: readonly number[]): boolean =>
  entries.length > 0 &&
  entries.every((entry) => Number.isSafeInteger(entry) && entry > 0) &&
  new Set(entries).size === entries.length;

const createActiveAdapterMap = (
  adapters: readonly IRuntimeAdapter[],
  coreRepositoryFormatVersions: readonly number[],
): ReadonlyMap<string, IRuntimeAdapter> | null => {
  const adapterMap = new Map<string, IRuntimeAdapter>();

  for (const adapter of adapters) {
    if (
      adapterMap.has(adapter.id) ||
      adapter.id === MOLDEA_CLI_CUSTOM_ADAPTER_ID ||
      !ADAPTER_ID_PATTERN.test(adapter.id) ||
      !hasUniquePositiveIntegers(adapter.supportedRepositoryFormatVersions) ||
      adapter.supportedRepositoryFormatVersions.some(
        (version) => !coreRepositoryFormatVersions.includes(version),
      )
    ) {
      return null;
    }

    adapterMap.set(adapter.id, adapter);
  }

  return adapterMap;
};

/**
 * Verifies the installed package manifest and actual executable adapter composition.
 * @param input The installed package, Core, adapter, Git, and JSON-schema state.
 * @returns Whether every runtime compatibility invariant is satisfied.
 */
export const isMoldeaCliCompatibilityStateValid = (
  input: IMoldeaCliCompatibilityStateInput,
): boolean => {
  const { dependencies, installedPackageVersions, supportedNodeRange, version } =
    input.packageMetadata;

  if (
    isValidVersion(version) === null ||
    supportedNodeRange === null ||
    validRange(supportedNodeRange) === null ||
    isValidVersion(input.minimumGitVersion) === null ||
    input.outputSchemaVersion !== 2 ||
    dependencies === null ||
    installedPackageVersions === null ||
    !hasUniquePositiveIntegers(input.coreSupportedRepositoryFormatVersions)
  ) {
    return false;
  }

  const activeAdapterMap = createActiveAdapterMap(
    input.activeAdapters,
    input.coreSupportedRepositoryFormatVersions,
  );

  if (activeAdapterMap === null) {
    return false;
  }

  const expectedPackageNames = [
    ...MOLDEA_CLI_FOUNDATIONAL_PACKAGE_NAMES,
    ...[...activeAdapterMap.keys()].map(
      (adapterId) => `${MOLDEA_CLI_ADAPTER_PACKAGE_PREFIX}${adapterId}`,
    ),
  ];
  const declaredPackageNames = Object.keys(dependencies).filter((packageName) =>
    packageName.startsWith('@moldea.ai/'),
  );
  const resolvedPackageNames = Object.keys(installedPackageVersions);

  if (
    !hasExactStringSet(declaredPackageNames, expectedPackageNames) ||
    !hasExactStringSet(resolvedPackageNames, expectedPackageNames)
  ) {
    return false;
  }

  return expectedPackageNames.every((packageName) => {
    const resolvedVersion = installedPackageVersions[packageName];
    const declaredVersion = dependencies[packageName];

    return (
      resolvedVersion !== undefined &&
      isValidVersion(resolvedVersion) !== null &&
      (declaredVersion === resolvedVersion || declaredVersion === `workspace:${resolvedVersion}`)
    );
  });
};
