import type { Buffer } from 'node:buffer';
import type { BigIntStats } from 'node:fs';

import type {
  IGitInventoryCandidate,
  IGitInventoryProbeErrorCode,
  IGitUntrackedInventoryCandidate,
} from '../types.js';

// structurally safe raw path prepared for ownership inspection
export interface IGitInventoryOwnershipPathPlan {
  readonly candidate: IGitInventoryCandidate;
  readonly directorySegments: readonly string[];
  readonly hasGitControlSegment: boolean;
  readonly isDirectoryRecord: boolean;
  readonly segments: readonly string[];
}

// successful raw path-planning result
export interface IGitInventoryOwnershipPathPlannedResult {
  readonly kind: 'planned';
  readonly plan: IGitInventoryOwnershipPathPlan;
}

// invalid raw path result produced before host filesystem access
export interface IGitInventoryOwnershipPathFailedResult {
  readonly kind: 'failed';
}

// all-or-nothing result of planning one raw candidate path
export type IGitInventoryOwnershipPathPlanResult =
  IGitInventoryOwnershipPathFailedResult | IGitInventoryOwnershipPathPlannedResult;

// no-follow filesystem statistics required for ownership inspection
export type IGitInventoryOwnershipStatistics = Pick<
  BigIntStats,
  'dev' | 'ino' | 'isDirectory' | 'isFile' | 'isSymbolicLink'
>;

// injectable no-follow filesystem stat boundary
export type IGitInventoryOwnershipLstat = (
  hostPath: string,
) => Promise<IGitInventoryOwnershipStatistics>;

// injectable raw directory-name boundary
export type IGitInventoryOwnershipReadDirectory = (hostPath: string) => Promise<readonly Buffer[]>;

// untracked path plans inspected under one selected repository root
export interface IGitInventoryBoundaryInspectionInput {
  readonly maxMetadataBytes: number;
  readonly plans: readonly IGitInventoryOwnershipPathPlan[];
  readonly repositoryRoot: string;
  readonly signal?: AbortSignal;
}

// ownership retained for one untracked candidate after boundary inspection
export type IGitInventoryBoundaryOwnership = 'nested-repository' | 'selected-repository';

// successful boundary inspection aligned with the provided path plans
export interface IGitInventoryBoundaryInspectedResult {
  readonly gitMetadataBytes: number;
  readonly kind: 'inspected';
  readonly ownership: readonly IGitInventoryBoundaryOwnership[];
}

// safe boundary-inspection failure
export interface IGitInventoryBoundaryInspectionFailedResult {
  readonly errorCode: IGitInventoryProbeErrorCode;
  readonly kind: 'failed';
}

// all-or-nothing nested-repository boundary result
export type IGitInventoryBoundaryInspectionResult =
  IGitInventoryBoundaryInspectedResult | IGitInventoryBoundaryInspectionFailedResult;

// injectable ownership boundary for untracked candidate paths
export type IGitInventoryBoundaryInspector = (
  input: IGitInventoryBoundaryInspectionInput,
) => Promise<IGitInventoryBoundaryInspectionResult>;

// raw candidates and remaining metadata budget entering ownership filtering
export interface IGitInventoryOwnershipFilterInput {
  readonly candidates: readonly IGitInventoryCandidate[];
  readonly maxMetadataBytes: number;
  readonly repositoryRoot: string;
  readonly signal?: AbortSignal;
}

// complete selected-repository candidate set after ownership filtering
export interface IGitInventoryOwnershipFilteredResult {
  readonly candidates: readonly IGitInventoryCandidate[];
  readonly gitMetadataBytes: number;
  readonly kind: 'filtered';
}

// safe ownership-filtering failure
export interface IGitInventoryOwnershipFilterFailedResult {
  readonly errorCode: IGitInventoryProbeErrorCode;
  readonly kind: 'failed';
}

// all-or-nothing ownership-filtering result
export type IGitInventoryOwnershipFilterResult =
  IGitInventoryOwnershipFilteredResult | IGitInventoryOwnershipFilterFailedResult;

// injectable selected-repository ownership filter
export type IGitInventoryOwnershipFilter = (
  input: IGitInventoryOwnershipFilterInput,
) => Promise<IGitInventoryOwnershipFilterResult>;

// untracked plan paired with its original position for stable reconstruction
export interface IGitInventoryUntrackedOwnershipPlan {
  readonly candidate: IGitUntrackedInventoryCandidate;
  readonly candidateIndex: number;
  readonly plan: IGitInventoryOwnershipPathPlan;
}
