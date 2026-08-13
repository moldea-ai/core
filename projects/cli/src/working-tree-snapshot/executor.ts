import { RepositorySourceException, type IRepositoryReader } from '@moldea.ai/repository';

import {
  areGitInventoriesEqual,
  probeGitInventory,
  type IGitInventoryProbe,
  type IGitInventoryProbedResult,
} from '../git-inventory/index.js';
import {
  areGitWorkingTreeIdentitiesEqual,
  inspectGitWorkingTreeIdentity,
  type IGitWorkingTreeIdentity,
  type IGitWorkingTreeIdentityInspector,
} from '../git-working-tree/index.js';
import type { IMoldeaCliOwnedErrorCode } from '../presentation/index.js';
import {
  createWorkingTreeRepositoryReader,
  type IWorkingTreeRepositoryReaderFactory,
} from '../repository-reader/index.js';

import { MAX_WORKING_TREE_SNAPSHOT_ATTEMPTS } from './constants.js';
import type {
  IWorkingTreeSnapshotExecutionInput,
  IWorkingTreeSnapshotExecutionResult,
  IWorkingTreeSnapshotExecutor,
  IWorkingTreeSnapshotFailedResult,
  IWorkingTreeSnapshotInventoryComparator,
} from './types.js';

/** Creates one immutable terminal snapshot failure. */
const createSnapshotFailure = (
  errorCode: IMoldeaCliOwnedErrorCode,
): IWorkingTreeSnapshotFailedResult => Object.freeze({ errorCode, kind: 'failed' });

/** Determines whether a source exception proves that the current reader is unusable. */
const isSnapshotChanged = (error: unknown): boolean =>
  error instanceof RepositorySourceException && error.code === 'SNAPSHOT_CHANGED';

/** Determines whether reader creation may have raced with an inventory change. */
const isCreationInventoryRace = (error: unknown): boolean =>
  error instanceof RepositorySourceException &&
  error.operation === 'create-reader' &&
  (error.code === 'ENTRY_NOT_FOUND' || error.code === 'ENTRY_NOT_DIRECTORY');

/** Determines whether identity inspection failed because the pinned source disappeared. */
const isPinnedIdentityUnavailable = (errorCode: IMoldeaCliOwnedErrorCode): boolean =>
  errorCode === 'GIT_REPOSITORY_NOT_FOUND' || errorCode === 'GIT_WORK_TREE_REQUIRED';

/**
 * Creates the bounded whole-operation working-tree snapshot executor.
 * @param identityInspector The selected working-tree identity observation boundary.
 * @param inventoryProbe The complete normalized Git inventory probe.
 * @param repositoryReaderFactory The exact-path guarded reader factory.
 * @param compareInventories The exact normalized inventory comparator.
 * @returns An executor that discards and retries complete provisional attempts.
 */
export const createWorkingTreeSnapshotExecutor = (
  identityInspector: IGitWorkingTreeIdentityInspector = inspectGitWorkingTreeIdentity,
  inventoryProbe: IGitInventoryProbe = probeGitInventory,
  repositoryReaderFactory: IWorkingTreeRepositoryReaderFactory = createWorkingTreeRepositoryReader,
  compareInventories: IWorkingTreeSnapshotInventoryComparator = areGitInventoriesEqual,
): IWorkingTreeSnapshotExecutor => {
  const executeSnapshot = async <TResult>(
    input: IWorkingTreeSnapshotExecutionInput<TResult>,
  ): Promise<IWorkingTreeSnapshotExecutionResult<TResult>> => {
    if (input.signal?.aborted) {
      return createSnapshotFailure('GIT_OPERATION_ABORTED');
    }

    const repositoryRoot = input.repositoryRoot;
    const resourceLimits = Object.freeze({ ...input.resourceLimits });
    const pinnedIdentityResult = await identityInspector({
      repositoryRoot,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    if (input.signal?.aborted) {
      return createSnapshotFailure('GIT_OPERATION_ABORTED');
    }

    if (pinnedIdentityResult.kind === 'failed') {
      return createSnapshotFailure(pinnedIdentityResult.errorCode);
    }

    if (pinnedIdentityResult.kind === 'mismatched') {
      return createSnapshotFailure('GIT_OUTPUT_INVALID');
    }

    const pinnedIdentity: IGitWorkingTreeIdentity = pinnedIdentityResult.identity;

    const probeInventory = async (): Promise<
      IGitInventoryProbedResult | IWorkingTreeSnapshotFailedResult
    > => {
      const result = await inventoryProbe({
        maxEntries: resourceLimits.maxEntries,
        maxMetadataBytes: resourceLimits.maxTotalBytes,
        repositoryRoot,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });

      return result.kind === 'failed' ? createSnapshotFailure(result.errorCode) : result;
    };

    for (let attempt = 0; attempt < MAX_WORKING_TREE_SNAPSHOT_ATTEMPTS; attempt += 1) {
      if (input.signal?.aborted) {
        return createSnapshotFailure('GIT_OPERATION_ABORTED');
      }

      const currentIdentityResult = await identityInspector({
        repositoryRoot,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });

      if (input.signal?.aborted) {
        return createSnapshotFailure('GIT_OPERATION_ABORTED');
      }

      if (currentIdentityResult.kind === 'failed') {
        return createSnapshotFailure(
          isPinnedIdentityUnavailable(currentIdentityResult.errorCode)
            ? 'WORKING_TREE_UNSTABLE'
            : currentIdentityResult.errorCode,
        );
      }

      if (
        currentIdentityResult.kind === 'mismatched' ||
        !areGitWorkingTreeIdentitiesEqual(pinnedIdentity, currentIdentityResult.identity)
      ) {
        return createSnapshotFailure('WORKING_TREE_UNSTABLE');
      }

      const firstInventoryResult = await probeInventory();

      if (input.signal?.aborted) {
        return createSnapshotFailure('GIT_OPERATION_ABORTED');
      }

      if (firstInventoryResult.kind === 'failed') {
        return firstInventoryResult;
      }

      let reader: IRepositoryReader;

      try {
        reader = await repositoryReaderFactory({
          entries: firstInventoryResult.entries,
          repositoryRoot,
          resourceLimits,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        });
      } catch (error) {
        if (input.signal?.aborted) {
          return createSnapshotFailure('GIT_OPERATION_ABORTED');
        }

        if (isSnapshotChanged(error)) {
          continue;
        }

        if (!isCreationInventoryRace(error)) {
          throw error;
        }

        const freshInventoryResult = await probeInventory();

        if (input.signal?.aborted) {
          return createSnapshotFailure('GIT_OPERATION_ABORTED');
        }

        if (freshInventoryResult.kind === 'failed') {
          return freshInventoryResult;
        }

        if (!compareInventories(firstInventoryResult.entries, freshInventoryResult.entries)) {
          continue;
        }

        throw error;
      }

      const secondInventoryResult = await probeInventory();

      if (input.signal?.aborted) {
        return createSnapshotFailure('GIT_OPERATION_ABORTED');
      }

      if (secondInventoryResult.kind === 'failed') {
        return secondInventoryResult;
      }

      if (!compareInventories(firstInventoryResult.entries, secondInventoryResult.entries)) {
        continue;
      }

      try {
        if (input.signal?.aborted) {
          return createSnapshotFailure('GIT_OPERATION_ABORTED');
        }

        const result =
          input.signal === undefined
            ? await input.operation(reader)
            : await input.operation(reader, input.signal);

        if (input.signal?.aborted) {
          return createSnapshotFailure('GIT_OPERATION_ABORTED');
        }

        return Object.freeze({ kind: 'completed', result });
      } catch (error) {
        if (input.signal?.aborted) {
          return createSnapshotFailure('GIT_OPERATION_ABORTED');
        }

        if (!isSnapshotChanged(error)) {
          throw error;
        }
      }
    }

    return createSnapshotFailure('WORKING_TREE_UNSTABLE');
  };

  return executeSnapshot;
};

// default bounded snapshot executor used by command execution
export const executeWorkingTreeSnapshot = createWorkingTreeSnapshotExecutor();
