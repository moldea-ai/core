import type { Stats } from 'node:fs';

import type { IMoldeaCliGitErrorCode } from '../presentation/index.js';

// paths available when selecting a Git discovery starting directory
export interface IGitStartingDirectoryInspectionInput {
  readonly invocationDirectory: string;
  readonly repositoryDirectory: string | null;
}

// accessible directory selected for Git discovery
export interface IGitStartingDirectoryFoundResult {
  readonly directory: string;
  readonly kind: 'found';
}

// safe failure produced while selecting a Git discovery starting directory
export interface IGitStartingDirectoryFailedResult {
  readonly errorCode: IMoldeaCliGitErrorCode;
  readonly kind: 'failed';
}

// normalized result of inspecting a Git discovery starting directory
export type IGitStartingDirectoryInspectionResult =
  IGitStartingDirectoryFoundResult | IGitStartingDirectoryFailedResult;

// injectable starting-directory inspection boundary
export type IGitStartingDirectoryInspector = (
  input: IGitStartingDirectoryInspectionInput,
) => Promise<IGitStartingDirectoryInspectionResult>;

// minimal filesystem stat boundary required for directory inspection
export type IGitStartingDirectoryStat = (directory: string) => Promise<Pick<Stats, 'isDirectory'>>;

// process-neutral inputs required to discover one optionally cancellable Git working tree
export interface IGitWorkingTreeDiscoveryInput {
  readonly invocationDirectory: string;
  readonly repositoryDirectory: string | null;
  readonly signal?: AbortSignal;
}

// immutable repository root discovered from Git
export interface IGitWorkingTreeDiscoveredResult {
  readonly kind: 'discovered';
  readonly repositoryRoot: string;
}

// safe Git working-tree discovery failure
export interface IGitWorkingTreeDiscoveryFailedResult {
  readonly errorCode: IMoldeaCliGitErrorCode;
  readonly kind: 'failed';
}

// normalized result of Git working-tree discovery
export type IGitWorkingTreeDiscoveryResult =
  IGitWorkingTreeDiscoveredResult | IGitWorkingTreeDiscoveryFailedResult;

// injectable Git working-tree discovery boundary
export type IGitWorkingTreeDiscovery = (
  input: IGitWorkingTreeDiscoveryInput,
) => Promise<IGitWorkingTreeDiscoveryResult>;
