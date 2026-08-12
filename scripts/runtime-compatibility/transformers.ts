import { BINDING_SUBJECTS } from './constants.ts';
import type {
  IProviderLimit,
  IRuntimeAdapterEntry,
  IRuntimeCompatibilityMatrix,
  IRuntimePattern,
  IRuntimeTarget,
} from './types.ts';
import { compareExactStrings } from './utilities.ts';

const normalizePattern = (pattern: IRuntimePattern): IRuntimePattern => ({ ...pattern });

const normalizeProviderLimit = (providerLimit: IProviderLimit): IProviderLimit => ({
  ...providerLimit,
  value: Array.isArray(providerLimit.value)
    ? [...providerLimit.value].sort(compareExactStrings)
    : providerLimit.value,
});

const normalizeTarget = (target: IRuntimeTarget): IRuntimeTarget => {
  const normalized: IRuntimeTarget = { ...target };

  if (target.packages !== undefined) {
    normalized.packages = [...target.packages].sort((left, right) => {
      return (
        compareExactStrings(left.ecosystem, right.ecosystem) ||
        compareExactStrings(left.role, right.role) ||
        compareExactStrings(left.name, right.name)
      );
    });
  }

  if (target.evidenceKinds !== undefined) {
    normalized.evidenceKinds = [...target.evidenceKinds].sort(compareExactStrings);
  }

  if (target.bindingSupport !== undefined) {
    normalized.bindingSupport = Object.fromEntries(
      BINDING_SUBJECTS.filter((subject) => target.bindingSupport?.[subject] !== undefined).map(
        (subject) => [subject, { ...target.bindingSupport?.[subject] }],
      ),
    );
  }

  if (target.patterns !== undefined) {
    normalized.patterns = [...target.patterns].map(normalizePattern).sort((left, right) => {
      return compareExactStrings(left.kind, right.kind) || compareExactStrings(left.id, right.id);
    });
  }

  if (target.providerLimits !== undefined) {
    normalized.providerLimits = [...target.providerLimits]
      .map(normalizeProviderLimit)
      .sort((left, right) => {
        return (
          compareExactStrings(left.subject, right.subject) || compareExactStrings(left.id, right.id)
        );
      });
  }

  if (target.knownLimitations !== undefined) {
    normalized.knownLimitations = [...target.knownLimitations].sort(compareExactStrings);
  }

  return normalized;
};

const normalizeAdapter = (adapter: IRuntimeAdapterEntry): IRuntimeAdapterEntry => {
  const normalized: IRuntimeAdapterEntry = {
    ...adapter,
    implementation: { ...adapter.implementation },
  };

  if (adapter.supportedRepositoryFormatVersions !== undefined) {
    normalized.supportedRepositoryFormatVersions = [
      ...adapter.supportedRepositoryFormatVersions,
    ].sort((left, right) => left - right);
  }

  if (adapter.runtimeGuidance !== undefined) {
    normalized.runtimeGuidance = { ...adapter.runtimeGuidance };
  }

  if (adapter.targets !== undefined) {
    normalized.targets = [...adapter.targets]
      .map(normalizeTarget)
      .sort((left, right) => compareExactStrings(left.id, right.id));
  }

  return normalized;
};

/** Normalizes every semantically unordered matrix collection deterministically. */
export const normalizeRuntimeCompatibilityMatrix = (
  matrix: IRuntimeCompatibilityMatrix,
): IRuntimeCompatibilityMatrix => {
  return {
    adapters: Object.fromEntries(
      Object.entries(matrix.adapters)
        .sort(([leftId], [rightId]) => compareExactStrings(leftId, rightId))
        .map(([adapterId, adapter]) => [adapterId, normalizeAdapter(adapter)]),
    ),
    version: 1,
  };
};
