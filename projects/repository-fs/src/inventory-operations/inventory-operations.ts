import {
  REPOSITORY_ROOT,
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryListOptions,
  type IRepositoryOperationOptions,
  type IRepositoryPath,
} from '@moldea.ai/repository';

import type { IFilesystemInventoryEntry } from '../inventory/index.js';
import {
  throwIfFilesystemRepositoryReaderInvalidated,
  type IFilesystemRepositoryReaderState,
} from '../reader-state/index.js';
import {
  throwFilesystemRepositoryOperationException,
  throwIfFilesystemRepositoryOperationAborted,
} from '../source-exception/index.js';

/** Finds the first inventory position whose path is not less than the target path. */
const findFilesystemInventoryLowerBound = (
  entries: readonly IFilesystemInventoryEntry[],
  targetPath: string,
): number => {
  let lowerIndex = 0;
  let upperIndex = entries.length;

  while (lowerIndex < upperIndex) {
    const middleIndex = lowerIndex + Math.floor((upperIndex - lowerIndex) / 2);
    const middleEntry = entries[middleIndex];

    if (middleEntry !== undefined && middleEntry.path < targetPath) {
      lowerIndex = middleIndex + 1;
    } else {
      upperIndex = middleIndex;
    }
  }

  return lowerIndex;
};

/** Returns one inventory entry at an exact logical path when it exists. */
const findFilesystemInventoryEntry = (
  state: IFilesystemRepositoryReaderState,
  path: IRepositoryPath,
): IFilesystemInventoryEntry | undefined => {
  const entryIndex = findFilesystemInventoryLowerBound(state.inventory.entries, path);
  const entry = state.inventory.entries[entryIndex];

  return entry?.path === path ? entry : undefined;
};

/** Detaches one source-private observation into the common public entry shape. */
const createRepositoryEntry = (entry: IFilesystemInventoryEntry): IRepositoryEntry => ({
  path: entry.path,
  type: entry.type,
});

/**
 * Looks up one detached common entry in a frozen filesystem inventory.
 * @param state The shared verified inventory and permanent reader lifecycle.
 * @param path The validated repository-root logical path to inspect.
 * @param options Optional cancellation controls.
 * @returns A promise resolving to the detached entry or `null` when absent.
 * @throws
 * - INVALID_REPOSITORY_PATH: The repository path is invalid.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - ABORTED: The repository operation was aborted.
 */
export const getFilesystemRepositoryEntry = async (
  state: IFilesystemRepositoryReaderState,
  path: IRepositoryPath,
  options?: IRepositoryOperationOptions,
): Promise<IRepositoryEntry | null> => {
  const parsedPath = parseRepositoryPath(path);

  await Promise.resolve();
  throwIfFilesystemRepositoryReaderInvalidated(state, 'get-entry', parsedPath);
  throwIfFilesystemRepositoryOperationAborted(options?.signal, 'get-entry', parsedPath);

  const entry = findFilesystemInventoryEntry(state, parsedPath);

  if (entry === undefined) {
    throwIfFilesystemRepositoryReaderInvalidated(state, 'get-entry', parsedPath);
    return null;
  }

  const result = createRepositoryEntry(entry);

  throwIfFilesystemRepositoryReaderInvalidated(state, 'get-entry', parsedPath);
  throwIfFilesystemRepositoryOperationAborted(options?.signal, 'get-entry', parsedPath);

  return result;
};

/**
 * Recursively lists detached common descendants from a frozen filesystem inventory.
 * @param state The shared verified inventory and permanent reader lifecycle.
 * @param options Optional prefix and cancellation controls.
 * @returns An async iterable over every exact descendant without the prefix itself.
 * @throws
 * - INVALID_REPOSITORY_PATH: The repository path is invalid.
 * - ENTRY_NOT_FOUND: The requested repository entry was not found.
 * - ENTRY_NOT_DIRECTORY: The requested repository entry is not a directory.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - ABORTED: The repository operation was aborted.
 */
export const listFilesystemRepositoryEntries = async function* (
  state: IFilesystemRepositoryReaderState,
  options?: IRepositoryListOptions,
): AsyncIterable<IRepositoryEntry> {
  const prefix =
    options?.prefix === undefined ? REPOSITORY_ROOT : parseRepositoryPath(options.prefix);

  await Promise.resolve();
  throwIfFilesystemRepositoryReaderInvalidated(state, 'list-entries', prefix);
  throwIfFilesystemRepositoryOperationAborted(options?.signal, 'list-entries', prefix);

  const prefixEntry = findFilesystemInventoryEntry(state, prefix);

  if (prefixEntry === undefined) {
    return throwFilesystemRepositoryOperationException(
      'ENTRY_NOT_FOUND',
      'list-entries',
      false,
      prefix,
    );
  }

  if (prefixEntry.type !== 'directory') {
    return throwFilesystemRepositoryOperationException(
      'ENTRY_NOT_DIRECTORY',
      'list-entries',
      false,
      prefix,
    );
  }

  const descendantPrefix = prefix === REPOSITORY_ROOT ? REPOSITORY_ROOT : `${prefix}/`;
  let entryIndex = findFilesystemInventoryLowerBound(state.inventory.entries, descendantPrefix);

  while (entryIndex < state.inventory.entries.length) {
    const entry = state.inventory.entries[entryIndex];

    if (entry === undefined || entry.path === prefix || !entry.path.startsWith(descendantPrefix)) {
      if (entry?.path === prefix) {
        entryIndex += 1;
        continue;
      }

      break;
    }

    throwIfFilesystemRepositoryReaderInvalidated(state, 'list-entries', prefix);
    throwIfFilesystemRepositoryOperationAborted(options?.signal, 'list-entries', prefix);
    yield createRepositoryEntry(entry);
    entryIndex += 1;
  }

  throwIfFilesystemRepositoryReaderInvalidated(state, 'list-entries', prefix);
  throwIfFilesystemRepositoryOperationAborted(options?.signal, 'list-entries', prefix);
};
