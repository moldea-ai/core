import type { BigIntStats } from 'node:fs';

import type { IMoldeaCliGitErrorCode } from '../../presentation/index.js';

// filesystem observation retained for one identity-bearing directory
export interface IGitWorkingTreeIdentityLocation {
  readonly dev: bigint;
  readonly ino: bigint;
  readonly path: string;
}

// pinned private identity for one selected Git working tree
export interface IGitWorkingTreeIdentity {
  readonly commonDirectory: IGitWorkingTreeIdentityLocation;
  readonly gitDirectory: IGitWorkingTreeIdentityLocation;
  readonly repositoryRoot: IGitWorkingTreeIdentityLocation;
}

// root and optional cancellation accepted by one identity inspection
export interface IGitWorkingTreeIdentityInspectionInput {
  readonly repositoryRoot: string;
  readonly signal?: AbortSignal;
}

// successful immutable identity inspection
export interface IGitWorkingTreeIdentityInspectedResult {
  readonly identity: IGitWorkingTreeIdentity;
  readonly kind: 'inspected';
}

// safe identity-inspection failure
export interface IGitWorkingTreeIdentityInspectionFailedResult {
  readonly errorCode: IMoldeaCliGitErrorCode;
  readonly kind: 'failed';
}

// Git resolved the selected path to a different working-tree root
export interface IGitWorkingTreeIdentityMismatchedResult {
  readonly kind: 'mismatched';
}

// complete identity-inspection result
export type IGitWorkingTreeIdentityInspectionResult =
  | IGitWorkingTreeIdentityInspectedResult
  | IGitWorkingTreeIdentityInspectionFailedResult
  | IGitWorkingTreeIdentityMismatchedResult;

// no-follow-independent directory statistics required for identity pinning
export type IGitWorkingTreeIdentityStatResult = Pick<BigIntStats, 'dev' | 'ino' | 'isDirectory'>;

// injectable filesystem identity boundary
export type IGitWorkingTreeIdentityStat = (
  hostPath: string,
) => Promise<IGitWorkingTreeIdentityStatResult>;

// injectable working-tree identity inspection boundary
export type IGitWorkingTreeIdentityInspector = (
  input: IGitWorkingTreeIdentityInspectionInput,
) => Promise<IGitWorkingTreeIdentityInspectionResult>;
