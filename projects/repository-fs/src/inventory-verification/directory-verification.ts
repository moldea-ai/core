import { RepositorySourceException } from '@moldea.ai/repository';

import { createFilesystemDirectoryEntryCandidates } from '../directory-inventory/index.js';
import type { IFilesystemInventory } from '../inventory/index.js';
import type { IPreparedFilesystemRepositoryRoot } from '../root/index.js';
import { throwFilesystemRepositoryCreationException } from '../source-exception/index.js';
import {
  captureFilesystemVerificationStatistics,
  readFilesystemVerificationDirectoryNames,
} from './observation.js';
import {
  createFilesystemDirectoryChildrenByPath,
  getFirstFilesystemDirectoryMembershipMismatch,
} from './utilities.js';
import { assertFilesystemInventoryEntryUnchanged } from './validations.js';

/**
 * Revalidates every entry, directory identity, and eligible recursive membership set.
 * @param preparedRoot The validated fixed root and detached directory-selection options.
 * @param inventory The creation-time recursive inventory and private fingerprints to verify.
 * @returns A promise resolving after the complete inventory is proven coherent.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
export const verifyFilesystemDirectoryInventory = async (
  preparedRoot: IPreparedFilesystemRepositoryRoot,
  inventory: IFilesystemInventory,
): Promise<void> => {
  if (preparedRoot.options.selection.kind !== 'directory') {
    return throwFilesystemRepositoryCreationException('INVALID_SOURCE_DATA', false, null);
  }

  const expectedChildrenByPath = createFilesystemDirectoryChildrenByPath(inventory);

  for (const entry of inventory.entries) {
    const statistics = await captureFilesystemVerificationStatistics(
      entry,
      preparedRoot.options.signal,
    );

    assertFilesystemInventoryEntryUnchanged(entry, statistics, true);

    if (entry.type !== 'directory') {
      continue;
    }

    const encodedNames = await readFilesystemVerificationDirectoryNames(
      entry,
      preparedRoot.options.signal,
    );
    let observedPaths;

    try {
      observedPaths = createFilesystemDirectoryEntryCandidates(encodedNames, entry.path).map(
        (candidate) => candidate.path,
      );
    } catch (cause) {
      if (cause instanceof RepositorySourceException && cause.code === 'INVALID_SOURCE_DATA') {
        return throwFilesystemRepositoryCreationException(
          'SNAPSHOT_CHANGED',
          true,
          entry.path,
          cause,
        );
      }

      throw cause;
    }

    const expectedPaths = expectedChildrenByPath.get(entry.path);

    if (expectedPaths === undefined) {
      return throwFilesystemRepositoryCreationException('SNAPSHOT_CHANGED', true, entry.path);
    }

    const mismatchPath = getFirstFilesystemDirectoryMembershipMismatch(
      expectedPaths,
      observedPaths,
    );

    if (mismatchPath !== undefined) {
      return throwFilesystemRepositoryCreationException('SNAPSHOT_CHANGED', true, mismatchPath);
    }
  }
};
