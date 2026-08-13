import { isRepositoryPath, type IRepositoryPath } from '@moldea.ai/repository';

import type {
  IGitInventoryCandidateLogicalPathValidationResult,
  IGitInventoryCandidateLogicalPathValidatorInput,
  IGitInventoryEntry,
  IGitInventoryLogicalPathFailedResult,
  IGitInventoryLogicalPathCandidate,
  IGitInventoryLogicalPathNormalizationResult,
  IGitInventoryLogicalPathNormalizer,
} from './types.js';

/** Creates one immutable invalid logical-path result. */
const createLogicalPathFailure = (): IGitInventoryLogicalPathFailedResult =>
  Object.freeze({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });

/** Converts one Git-relative path into a validated repository logical path. */
const resolveRepositoryPath = (gitPath: string): IRepositoryPath | null => {
  const logicalPath = `/${gitPath}`;

  return logicalPath !== '/' && isRepositoryPath(logicalPath) ? logicalPath : null;
};

/** Resolves the logical path represented by one Git candidate record. */
const resolveCandidateRepositoryPath = (
  candidate: IGitInventoryLogicalPathCandidate,
): IRepositoryPath | null => {
  const gitPath =
    candidate.kind === 'untracked' && candidate.path.endsWith('/')
      ? candidate.path.slice(0, -1)
      : candidate.path;

  return resolveRepositoryPath(gitPath);
};

/** Compares repository paths by exact Unicode code-point order. */
const compareRepositoryPaths = (left: IRepositoryPath, right: IRepositoryPath): number => {
  const leftScalars = left[Symbol.iterator]();
  const rightScalars = right[Symbol.iterator]();

  while (true) {
    const leftScalar = leftScalars.next();
    const rightScalar = rightScalars.next();

    if (leftScalar.done === true) {
      return rightScalar.done === true ? 0 : -1;
    }

    if (rightScalar.done === true) {
      return 1;
    }

    const leftCodePoint = leftScalar.value.codePointAt(0) ?? 0;
    const rightCodePoint = rightScalar.value.codePointAt(0) ?? 0;

    if (leftCodePoint !== rightCodePoint) {
      return leftCodePoint < rightCodePoint ? -1 : 1;
    }
  }
};

/**
 * Validates every decoded Git candidate before ownership or filesystem exclusions.
 * @param input The complete decoded tracked and untracked candidate set.
 * @returns A validated result, or failure when any candidate is not portable.
 */
export const validateGitInventoryCandidateLogicalPaths = (
  input: IGitInventoryCandidateLogicalPathValidatorInput,
): IGitInventoryCandidateLogicalPathValidationResult => {
  for (const candidate of input.candidates) {
    if (resolveCandidateRepositoryPath(candidate) === null) {
      return createLogicalPathFailure();
    }
  }

  return Object.freeze({ kind: 'validated' });
};

/**
 * Converts Git-relative inventory entries into exact repository logical paths.
 * @param input The entry-type-normalized Git-relative inventory.
 * @returns An immutable code-point-sorted inventory, or failure for invalid path state.
 */
export const normalizeGitInventoryLogicalPaths: IGitInventoryLogicalPathNormalizer = (
  input,
): IGitInventoryLogicalPathNormalizationResult => {
  const entries: IGitInventoryEntry[] = [];
  const logicalPaths = new Set<IRepositoryPath>();

  for (const entry of input.entries) {
    const logicalPath = resolveRepositoryPath(entry.path);

    if (logicalPath === null || logicalPaths.has(logicalPath)) {
      return createLogicalPathFailure();
    }

    logicalPaths.add(logicalPath);
    entries.push(Object.freeze({ ...entry, path: logicalPath }));
  }

  entries.sort((left, right) => compareRepositoryPaths(left.path, right.path));

  return Object.freeze({ entries: Object.freeze(entries), kind: 'normalized' });
};
