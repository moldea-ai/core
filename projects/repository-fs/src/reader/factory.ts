import type { IRepositoryReader } from '@moldea.ai/repository';

import type { IFilesystemRepositoryReaderOptions } from '../contracts/index.js';
import { readFilesystemRepositoryFile } from '../file-operations/index.js';
import {
  getFilesystemRepositoryEntry,
  listFilesystemRepositoryEntries,
} from '../inventory-operations/index.js';
import { createFilesystemRepositoryReaderState } from '../reader-state/index.js';
import { prepareFilesystemRepositoryRoot } from '../root/index.js';
import { createVerifiedFilesystemInventory } from '../verified-inventory/index.js';

/**
 * Creates one coherent read-only snapshot over an explicitly selected filesystem root.
 * @param options The root, selection, resource limits, and creation cancellation signal.
 * @returns A promise resolving to an immutable source-neutral repository reader.
 * @throws
 * - INVALID_REPOSITORY_PATH: The repository path is invalid.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - ABORTED: The repository operation was aborted.
 * - ENTRY_NOT_FOUND: The requested repository entry was not found.
 * - ENTRY_NOT_DIRECTORY: The requested repository entry is not a directory.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - RESOURCE_LIMIT_EXCEEDED: A repository reading resource limit was exceeded.
 */
export const createFilesystemRepositoryReader = async (
  options: IFilesystemRepositoryReaderOptions,
): Promise<IRepositoryReader> => {
  const preparedRoot = await prepareFilesystemRepositoryRoot(options);
  const inventory = await createVerifiedFilesystemInventory(preparedRoot);
  const state = createFilesystemRepositoryReaderState(preparedRoot, inventory);

  return Object.freeze({
    getEntry: (path, operationOptions) =>
      getFilesystemRepositoryEntry(state, path, operationOptions),
    listEntries: (operationOptions) => listFilesystemRepositoryEntries(state, operationOptions),
    readFile: (path, operationOptions) =>
      readFilesystemRepositoryFile(state, path, operationOptions),
  } satisfies IRepositoryReader);
};
