import type { IRepositoryPath } from '@moldea.ai/repository';

import type {
  IGitEntryTypeNormalizedEntry,
  IGitEntryTypeNormalizedTrackedEntry,
  IGitEntryTypeNormalizedUntrackedEntry,
} from '../entry-type/index.js';

// tracked effective inventory entry with one validated logical path
export interface IGitTrackedInventoryEntry extends Omit<
  IGitEntryTypeNormalizedTrackedEntry,
  'path'
> {
  readonly path: IRepositoryPath;
}

// untracked effective inventory entry with one validated logical path
export interface IGitUntrackedInventoryEntry extends Omit<
  IGitEntryTypeNormalizedUntrackedEntry,
  'path'
> {
  readonly path: IRepositoryPath;
}

// one normalized entry in the effective selected-repository inventory
export type IGitInventoryEntry = IGitTrackedInventoryEntry | IGitUntrackedInventoryEntry;

// decoded Git candidates entering pre-exclusion logical-path validation
export interface IGitInventoryLogicalPathCandidate {
  readonly kind: 'tracked' | 'untracked';
  readonly path: string;
}

// complete decoded candidate set entering pre-exclusion logical-path validation
export interface IGitInventoryCandidateLogicalPathValidatorInput {
  readonly candidates: readonly IGitInventoryLogicalPathCandidate[];
}

// complete candidate path validation before inventory exclusions
export interface IGitInventoryCandidateLogicalPathsValidatedResult {
  readonly kind: 'validated';
}

// non-portable or contradictory Git path state
export interface IGitInventoryLogicalPathFailedResult {
  readonly errorCode: 'GIT_OUTPUT_INVALID';
  readonly kind: 'failed';
}

// all-or-nothing candidate logical-path validation result
export type IGitInventoryCandidateLogicalPathValidationResult =
  IGitInventoryCandidateLogicalPathsValidatedResult | IGitInventoryLogicalPathFailedResult;

// entry-type-normalized paths entering logical-path normalization
export interface IGitInventoryLogicalPathNormalizerInput {
  readonly entries: readonly IGitEntryTypeNormalizedEntry[];
}

// complete logical-path-normalized effective inventory
export interface IGitInventoryLogicalPathsNormalizedResult {
  readonly entries: readonly IGitInventoryEntry[];
  readonly kind: 'normalized';
}

// all-or-nothing logical-path normalization result
export type IGitInventoryLogicalPathNormalizationResult =
  IGitInventoryLogicalPathFailedResult | IGitInventoryLogicalPathsNormalizedResult;

// injectable logical-path normalization boundary
export type IGitInventoryLogicalPathNormalizer = (
  input: IGitInventoryLogicalPathNormalizerInput,
) => IGitInventoryLogicalPathNormalizationResult;
