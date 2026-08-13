import type { IRepositoryReader } from '@moldea.ai/repository';

import type { IMoldeaCliResourceLimits } from '../command-line/index.js';
import type { IGitInventoryEntry } from '../git-inventory/index.js';
import type { IMoldeaCliErrorCode } from '../presentation/index.js';

// attempt-local operation that consumes one accepted coherent reader
export type IWorkingTreeSnapshotOperation<TResult> = (
  reader: IRepositoryReader,
) => Promise<TResult>;

// immutable inputs for one bounded snapshot execution
export interface IWorkingTreeSnapshotExecutionInput<TResult> {
  readonly operation: IWorkingTreeSnapshotOperation<TResult>;
  readonly repositoryRoot: string;
  readonly resourceLimits: IMoldeaCliResourceLimits;
}

// completed operation from one accepted snapshot attempt
export interface IWorkingTreeSnapshotCompletedResult<TResult> {
  readonly kind: 'completed';
  readonly result: TResult;
}

// safe terminal failure before a snapshot operation completed
export interface IWorkingTreeSnapshotFailedResult {
  readonly errorCode: IMoldeaCliErrorCode;
  readonly kind: 'failed';
}

// complete bounded snapshot-execution result
export type IWorkingTreeSnapshotExecutionResult<TResult> =
  IWorkingTreeSnapshotCompletedResult<TResult> | IWorkingTreeSnapshotFailedResult;

// generic bounded snapshot execution boundary
export type IWorkingTreeSnapshotExecutor = <TResult>(
  input: IWorkingTreeSnapshotExecutionInput<TResult>,
) => Promise<IWorkingTreeSnapshotExecutionResult<TResult>>;

// exact normalized inventory comparison boundary
export type IWorkingTreeSnapshotInventoryComparator = (
  left: readonly IGitInventoryEntry[],
  right: readonly IGitInventoryEntry[],
) => boolean;
