import { REPOSITORY_ROOT, parseRepositoryPath, type IRepositoryPath } from '@moldea.ai/repository';

import type {
  IFilesystemDirectoryInventoryEntry,
  IFilesystemInventory,
  IFilesystemInventoryEntry,
} from '../inventory/index.js';

/** Creates an exact-path lookup for one complete private inventory. */
export const createFilesystemInventoryEntriesByPath = (
  inventory: IFilesystemInventory,
): ReadonlyMap<IRepositoryPath, IFilesystemInventoryEntry> => {
  return new Map(inventory.entries.map((entry) => [entry.path, entry]));
};

const getFilesystemInventoryParentPath = (logicalPath: IRepositoryPath): IRepositoryPath => {
  const separatorIndex = logicalPath.lastIndexOf('/');

  return separatorIndex === 0
    ? REPOSITORY_ROOT
    : parseRepositoryPath(logicalPath.slice(0, separatorIndex));
};

/**
 * Derives every expected immediate-child set from one complete recursive inventory.
 * @param inventory The frozen recursive inventory to index.
 * @returns Directory paths paired with exact sorted immediate child paths.
 */
export const createFilesystemDirectoryChildrenByPath = (
  inventory: IFilesystemInventory,
): ReadonlyMap<IRepositoryPath, readonly IRepositoryPath[]> => {
  const mutableChildrenByPath = new Map<IRepositoryPath, IRepositoryPath[]>();

  for (const entry of inventory.entries) {
    if (entry.type === 'directory') {
      mutableChildrenByPath.set(entry.path, []);
    }
  }

  for (const entry of inventory.entries) {
    if (entry.path === REPOSITORY_ROOT) {
      continue;
    }

    mutableChildrenByPath.get(getFilesystemInventoryParentPath(entry.path))?.push(entry.path);
  }

  return new Map(
    [...mutableChildrenByPath].map(([directoryPath, childPaths]) => [
      directoryPath,
      Object.freeze([...childPaths].sort()),
    ]),
  );
};

/** Returns the first unequal path in two deterministic membership lists. */
export const getFirstFilesystemDirectoryMembershipMismatch = (
  expectedPaths: readonly IRepositoryPath[],
  observedPaths: readonly IRepositoryPath[],
): IRepositoryPath | undefined => {
  const comparedLength = Math.max(expectedPaths.length, observedPaths.length);

  for (let index = 0; index < comparedLength; index += 1) {
    if (expectedPaths[index] !== observedPaths[index]) {
      return observedPaths[index] ?? expectedPaths[index];
    }
  }

  return undefined;
};

/** Narrows a private inventory entry to an expected directory. */
export const getFilesystemInventoryDirectory = (
  entry: IFilesystemInventoryEntry | undefined,
): IFilesystemDirectoryInventoryEntry | undefined => {
  return entry?.type === 'directory' ? entry : undefined;
};
