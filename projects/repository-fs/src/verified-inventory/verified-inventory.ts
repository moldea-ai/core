import { createFilesystemDirectoryInventory } from '../directory-inventory/index.js';
import { createFilesystemExactPathInventory } from '../exact-path-inventory/index.js';
import { createFilesystemExactPathSelectionPlan } from '../exact-path-selection/index.js';
import type { IFilesystemInventory } from '../inventory/index.js';
import {
  verifyFilesystemDirectoryInventory,
  verifyFilesystemExactPathInventory,
} from '../inventory-verification/index.js';
import type { IPreparedFilesystemRepositoryRoot } from '../root/index.js';
import { throwIfFilesystemRepositoryCreationAborted } from '../source-exception/index.js';

/**
 * Builds and verifies one complete private inventory for later reader construction.
 * @param preparedRoot The validated fixed root and detached reader options.
 * @returns A promise resolving to the verified frozen inventory.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - ENTRY_NOT_DIRECTORY: The requested repository entry is not a directory.
 * - ENTRY_NOT_FOUND: The requested repository entry was not found.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - RESOURCE_LIMIT_EXCEEDED: A repository reading resource limit was exceeded.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
export const createVerifiedFilesystemInventory = async (
  preparedRoot: IPreparedFilesystemRepositoryRoot,
): Promise<IFilesystemInventory> => {
  throwIfFilesystemRepositoryCreationAborted(preparedRoot.options.signal);

  if (preparedRoot.options.selection.kind === 'paths') {
    const selectionPlan = createFilesystemExactPathSelectionPlan(
      preparedRoot.options.selection,
      preparedRoot.options.limits.maxEntries,
    );
    const inventory = await createFilesystemExactPathInventory(preparedRoot, selectionPlan);

    await verifyFilesystemExactPathInventory(preparedRoot, selectionPlan, inventory);
    throwIfFilesystemRepositoryCreationAborted(preparedRoot.options.signal);

    return inventory;
  }

  const inventory = await createFilesystemDirectoryInventory(preparedRoot);

  await verifyFilesystemDirectoryInventory(preparedRoot, inventory);
  throwIfFilesystemRepositoryCreationAborted(preparedRoot.options.signal);

  return inventory;
};
