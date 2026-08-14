import type { Buffer } from 'node:buffer';
import type { BigIntStats } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';

import { REPOSITORY_ROOT, type IRepositoryPath } from '@moldea.ai/repository';

import {
  createFilesystemInventoryEntry,
  type IFilesystemInventory,
  type IFilesystemInventoryEntry,
} from '../inventory/index.js';
import type { IPreparedFilesystemRepositoryRoot } from '../root/index.js';
import {
  throwFilesystemRepositoryCreationException,
  throwIfFilesystemRepositoryCreationAborted,
  throwObservedFilesystemRepositoryCreationError,
} from '../source-exception/index.js';
import {
  createFilesystemDirectoryEntryCandidates,
  registerFilesystemDirectoryIdentity,
} from './utilities.js';

// one directory queued for deterministic breadth-first traversal
interface IFilesystemDirectoryTraversalEntry {
  readonly hostPath: string;
  readonly logicalPath: IRepositoryPath;
}

/**
 * Reads one recursive inventory directory as exact raw names.
 * @param directory The previously observed directory to enumerate.
 * @param signal The live reader-creation cancellation signal.
 * @returns A promise resolving to the directory's raw child names.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
const readDirectoryNames = async (
  directory: IFilesystemDirectoryTraversalEntry,
  signal: AbortSignal | undefined,
): Promise<readonly Buffer[]> => {
  throwIfFilesystemRepositoryCreationAborted(signal, directory.logicalPath);

  let encodedNames: Buffer[];

  try {
    encodedNames = await readdir(directory.hostPath, { encoding: 'buffer' });
  } catch (cause) {
    throwIfFilesystemRepositoryCreationAborted(signal, directory.logicalPath);

    return throwObservedFilesystemRepositoryCreationError(cause, directory.logicalPath);
  }

  throwIfFilesystemRepositoryCreationAborted(signal, directory.logicalPath);

  return encodedNames;
};

/**
 * Captures one discovered child without following its final filesystem entry.
 * @param parentDirectory The previously observed parent directory.
 * @param hostName The losslessly decoded source entry name.
 * @param logicalPath The exact safe logical path for the entry.
 * @param signal The live reader-creation cancellation signal.
 * @returns A promise resolving to the classified entry with its applicable verification metadata.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
const captureDirectoryChild = async (
  parentDirectory: IFilesystemDirectoryTraversalEntry,
  hostName: string,
  logicalPath: IRepositoryPath,
  signal: AbortSignal | undefined,
): Promise<IFilesystemInventoryEntry> => {
  const hostPath = path.join(parentDirectory.hostPath, hostName);

  throwIfFilesystemRepositoryCreationAborted(signal, logicalPath);

  let statistics: BigIntStats;

  try {
    statistics = await lstat(hostPath, { bigint: true });
  } catch (cause) {
    throwIfFilesystemRepositoryCreationAborted(signal, logicalPath);

    return throwObservedFilesystemRepositoryCreationError(cause, logicalPath);
  }

  throwIfFilesystemRepositoryCreationAborted(signal, logicalPath);

  return createFilesystemInventoryEntry(hostPath, logicalPath, statistics);
};

/**
 * Materializes one private recursive raw-directory inventory beneath a prepared root.
 * @param preparedRoot The validated fixed root and detached directory-selection options.
 * @returns A frozen root-inclusive inventory with private verification metadata.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - RESOURCE_LIMIT_EXCEEDED: A repository reading resource limit was exceeded.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
export const createFilesystemDirectoryInventory = async (
  preparedRoot: IPreparedFilesystemRepositoryRoot,
): Promise<IFilesystemInventory> => {
  if (preparedRoot.options.selection.kind !== 'directory') {
    return throwFilesystemRepositoryCreationException('INVALID_SOURCE_DATA', false, null);
  }

  const rootEntry: IFilesystemInventoryEntry = Object.freeze({
    hostPath: preparedRoot.resolvedRootDirectory,
    identity: preparedRoot.identity,
    path: REPOSITORY_ROOT,
    type: 'directory',
  });
  const entriesByPath = new Map<IRepositoryPath, IFilesystemInventoryEntry>([
    [REPOSITORY_ROOT, rootEntry],
  ]);
  const pendingDirectories: IFilesystemDirectoryTraversalEntry[] = [
    {
      hostPath: preparedRoot.resolvedRootDirectory,
      logicalPath: REPOSITORY_ROOT,
    },
  ];
  const registeredDirectoryIdentityKeys = new Set<string>();

  registerFilesystemDirectoryIdentity(
    registeredDirectoryIdentityKeys,
    preparedRoot.identity,
    REPOSITORY_ROOT,
  );

  for (let directoryIndex = 0; directoryIndex < pendingDirectories.length; directoryIndex += 1) {
    const currentDirectory = pendingDirectories[directoryIndex];

    if (currentDirectory === undefined) {
      continue;
    }

    const encodedNames = await readDirectoryNames(currentDirectory, preparedRoot.options.signal);
    const candidates = createFilesystemDirectoryEntryCandidates(
      encodedNames,
      currentDirectory.logicalPath,
    );

    for (const candidate of candidates) {
      if (entriesByPath.size - 1 >= preparedRoot.options.limits.maxEntries) {
        return throwFilesystemRepositoryCreationException(
          'RESOURCE_LIMIT_EXCEEDED',
          false,
          candidate.path,
        );
      }

      if (entriesByPath.has(candidate.path)) {
        return throwFilesystemRepositoryCreationException(
          'INVALID_SOURCE_DATA',
          false,
          candidate.path,
        );
      }

      const entry = await captureDirectoryChild(
        currentDirectory,
        candidate.hostName,
        candidate.path,
        preparedRoot.options.signal,
      );

      if (entry.type === 'directory') {
        registerFilesystemDirectoryIdentity(
          registeredDirectoryIdentityKeys,
          entry.identity,
          entry.path,
        );
        pendingDirectories.push({
          hostPath: entry.hostPath,
          logicalPath: entry.path,
        });
      }

      entriesByPath.set(entry.path, entry);
    }
  }

  const entries = [...entriesByPath.values()].sort((firstEntry, secondEntry) => {
    if (firstEntry.path < secondEntry.path) {
      return -1;
    }

    return firstEntry.path > secondEntry.path ? 1 : 0;
  });

  return Object.freeze({ entries: Object.freeze(entries) });
};
