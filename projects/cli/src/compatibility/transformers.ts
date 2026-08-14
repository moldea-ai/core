import type { IMoldeaCliRuntimeAdapterEntry } from '../release-metadata/index.js';

import { MOLDEA_CLI_CUSTOM_ADAPTER_ID } from './constants.js';
import type {
  IMoldeaCliAdapterCompatibility,
  IMoldeaCliCompatibilityResult,
  IMoldeaCliCompatibilityStateInput,
} from './types.js';

/** Recursively freezes a cloned compatibility value without retaining mutable input ownership. */
const freezeCompatibilityValue = <TValue extends object>(value: TValue): TValue => {
  const pendingValues: object[] = [value];
  const visitedValues = new Set<object>();

  while (pendingValues.length > 0) {
    const currentValue = pendingValues.pop();

    if (currentValue === undefined || visitedValues.has(currentValue)) {
      continue;
    }

    visitedValues.add(currentValue);
    for (const nestedValue of Object.values(currentValue as Readonly<Record<string, unknown>>)) {
      if (typeof nestedValue === 'object' && nestedValue !== null) {
        pendingValues.push(nestedValue);
      }
    }

    Object.freeze(currentValue);
  }

  return value;
};

/** Clones one generated matrix entry before assigning immutable result ownership. */
const cloneMatrixEntry = (
  matrixEntry: IMoldeaCliRuntimeAdapterEntry,
): IMoldeaCliRuntimeAdapterEntry => freezeCompatibilityValue(structuredClone(matrixEntry));

/**
 * Creates the exact immutable version 1 compatibility result from validated runtime state.
 * @param input The already validated generated and installed compatibility composition.
 * @returns A deeply immutable compatibility result in deterministic report order.
 */
export const createMoldeaCliCompatibilityResult = (
  input: IMoldeaCliCompatibilityStateInput,
): IMoldeaCliCompatibilityResult => {
  const packageVersions = new Map(
    input.releaseMetadata.packages.map((packageMetadata) => [
      packageMetadata.name,
      packageMetadata.version,
    ]),
  );
  const activeAdapterIds = new Set(input.releaseMetadata.activeAdapterIds);
  const adapters = Object.entries(input.releaseMetadata.matrix.adapters).map(
    ([adapterId, matrixEntry]): IMoldeaCliAdapterCompatibility => {
      const isCustom = adapterId === MOLDEA_CLI_CUSTOM_ADAPTER_ID;
      const isActive = isCustom || activeAdapterIds.has(adapterId);
      const bundledVersion = isCustom
        ? (packageVersions.get('@moldea.ai/core') ?? null)
        : isActive
          ? (packageVersions.get(matrixEntry.implementation.package) ?? null)
          : null;

      return Object.freeze({
        active: isActive,
        bundledVersion,
        id: adapterId,
        matrix: cloneMatrixEntry(matrixEntry),
      });
    },
  );
  const packages = input.releaseMetadata.packages.map((packageMetadata) =>
    Object.freeze({ name: packageMetadata.name, version: packageMetadata.version }),
  );

  return freezeCompatibilityValue({
    adapters: Object.freeze(adapters),
    matrixVersion: input.releaseMetadata.matrix.version,
    minimumGitVersion: input.releaseMetadata.minimumGitVersion,
    outputSchemaVersion: input.releaseMetadata.outputSchemaVersion,
    packages: Object.freeze(packages),
    repositoryFormatVersions: Object.freeze([...input.releaseMetadata.repositoryFormatVersions]),
    supportedNodeRange: input.releaseMetadata.cliPackage.supportedNodeRange,
  });
};
