import { REPOSITORY_ROOT, type IRepositoryPath } from '@moldea.ai/repository';

import type { IFilesystemExactPathSelectionPlan } from '../exact-path-selection/index.js';
import { getMissingFilesystemExactPathDirectoryEntries } from '../exact-path-inventory/index.js';
import type { IFilesystemInventory } from '../inventory/index.js';
import type { IPreparedFilesystemRepositoryRoot } from '../root/index.js';
import { throwFilesystemRepositoryCreationException } from '../source-exception/index.js';
import {
  captureFilesystemVerificationStatistics,
  readFilesystemVerificationDirectoryNames,
} from './observation.js';
import {
  createFilesystemInventoryEntriesByPath,
  getFilesystemInventoryDirectory,
} from './utilities.js';
import { assertFilesystemInventoryEntryUnchanged } from './validations.js';

/**
 * Revalidates one exact-path inventory without observing unrelated sibling semantics.
 * @param preparedRoot The validated fixed root and detached path-selection options.
 * @param selectionPlan The exact selected and synthesized logical path plan.
 * @param inventory The creation-time inventory and private fingerprints to verify.
 * @returns A promise resolving after the inventory is proven coherent.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
export const verifyFilesystemExactPathInventory = async (
  preparedRoot: IPreparedFilesystemRepositoryRoot,
  selectionPlan: IFilesystemExactPathSelectionPlan,
  inventory: IFilesystemInventory,
): Promise<void> => {
  if (preparedRoot.options.selection.kind !== 'paths') {
    return throwFilesystemRepositoryCreationException('INVALID_SOURCE_DATA', false, null);
  }

  const entriesByPath = createFilesystemInventoryEntriesByPath(inventory);
  const requiredEntriesByParentPath = new Map<
    IRepositoryPath,
    IFilesystemExactPathSelectionPlan['entries'][number][]
  >();

  for (const plannedEntry of selectionPlan.entries) {
    const siblings = requiredEntriesByParentPath.get(plannedEntry.parentPath);

    if (siblings === undefined) {
      requiredEntriesByParentPath.set(plannedEntry.parentPath, [plannedEntry]);
    } else {
      siblings.push(plannedEntry);
    }
  }

  const requiredDirectoryPaths = new Set<IRepositoryPath>([
    REPOSITORY_ROOT,
    ...requiredEntriesByParentPath.keys(),
  ]);

  for (const entry of inventory.entries) {
    const statistics = await captureFilesystemVerificationStatistics(
      entry,
      preparedRoot.options.signal,
    );

    assertFilesystemInventoryEntryUnchanged(
      entry,
      statistics,
      requiredDirectoryPaths.has(entry.path),
    );
  }

  for (const [parentPath, requiredEntries] of requiredEntriesByParentPath) {
    const parentDirectory = getFilesystemInventoryDirectory(entriesByPath.get(parentPath));

    if (parentDirectory === undefined) {
      return throwFilesystemRepositoryCreationException('SNAPSHOT_CHANGED', true, parentPath);
    }

    const encodedNames = await readFilesystemVerificationDirectoryNames(
      parentDirectory,
      preparedRoot.options.signal,
    );
    const missingEntries = getMissingFilesystemExactPathDirectoryEntries(
      encodedNames,
      requiredEntries,
    );
    const firstMissingEntry = missingEntries[0];

    if (firstMissingEntry !== undefined) {
      return throwFilesystemRepositoryCreationException(
        'SNAPSHOT_CHANGED',
        true,
        firstMissingEntry.path,
      );
    }
  }
};
