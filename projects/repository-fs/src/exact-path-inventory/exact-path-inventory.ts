import type { Buffer } from 'node:buffer';
import type { BigIntStats } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';

import { REPOSITORY_ROOT, type IRepositoryPath } from '@moldea.ai/repository';

import { classifyFilesystemEntry } from '../entry-classification/index.js';
import type {
  IFilesystemExactPathSelectionPlan,
  IFilesystemExactPathSelectionPlanEntry,
} from '../exact-path-selection/index.js';
import { decodeFilesystemName } from '../filesystem-name/index.js';
import type { IPreparedFilesystemRepositoryRoot } from '../root/index.js';
import {
  throwFilesystemRepositoryCreationException,
  throwIfFilesystemRepositoryCreationAborted,
  throwObservedFilesystemRepositoryCreationError,
} from '../source-exception/index.js';
import type { IFilesystemExactPathInventory, IFilesystemExactPathInventoryEntry } from './types.js';
import {
  getMissingFilesystemExactPathDirectoryEntries,
  matchFilesystemExactPathDirectoryNames,
} from './utilities.js';

interface IFilesystemDirectoryTraversal {
  readonly hostPath: string;
  readonly logicalPath: IRepositoryPath;
}

// one host lookup used to compare potentially equivalent selected spellings
interface IFilesystemExactPathLookupObservation {
  readonly aliasKey: string;
  readonly device: bigint;
  readonly inode: bigint;
  readonly plannedEntry: IFilesystemExactPathSelectionPlanEntry;
}

/** Creates a locale-independent key only for confirming a host-proven entry alias. */
const getFilesystemNameAliasKey = (name: string): string => name.normalize('NFC').toUpperCase();

/**
 * Reads one required directory as raw names without decoding unrelated siblings.
 * @param directory The previously observed required directory.
 * @param signal The live reader-creation cancellation signal.
 * @returns A promise resolving to the directory's raw entry names.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
const readRequiredDirectoryNames = async (
  directory: IFilesystemDirectoryTraversal,
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
 * Captures one matched child without following its final filesystem entry.
 * @param parentDirectory The previously observed parent directory.
 * @param plannedEntry The deterministic logical entry being captured.
 * @param encodedName The exact raw source name matched for the entry.
 * @param signal The live reader-creation cancellation signal.
 * @returns A promise resolving to the private classified inventory entry.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
const captureMatchedEntry = async (
  parentDirectory: IFilesystemDirectoryTraversal,
  plannedEntry: IFilesystemExactPathSelectionPlanEntry,
  encodedName: Buffer,
  signal: AbortSignal | undefined,
): Promise<IFilesystemExactPathInventoryEntry> => {
  const decodedName = decodeFilesystemName(encodedName, parentDirectory.logicalPath);

  if (decodedName !== plannedEntry.segment) {
    return throwFilesystemRepositoryCreationException(
      'INVALID_SOURCE_DATA',
      false,
      plannedEntry.path,
    );
  }

  const hostPath = path.join(parentDirectory.hostPath, decodedName);

  throwIfFilesystemRepositoryCreationAborted(signal, plannedEntry.path);

  let statistics: BigIntStats;

  try {
    statistics = await lstat(hostPath, { bigint: true });
  } catch (cause) {
    throwIfFilesystemRepositoryCreationAborted(signal, plannedEntry.path);

    return throwObservedFilesystemRepositoryCreationError(cause, plannedEntry.path);
  }

  throwIfFilesystemRepositoryCreationAborted(signal, plannedEntry.path);

  return Object.freeze({
    hostPath,
    path: plannedEntry.path,
    type: classifyFilesystemEntry(statistics, plannedEntry.path),
  });
};

/**
 * Rejects selected spelling variants that host lookup resolves to one directory entry.
 * @param parentDirectory The already observed directory containing the required entries.
 * @param requiredEntries The deterministic required logical children.
 * @param missingEntries The required children absent by exact raw-name identity.
 * @param signal The live reader-creation cancellation signal.
 * @returns A promise that resolves after proving no selected spellings collapse.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
const throwIfRequiredEntriesCollapse = async (
  parentDirectory: IFilesystemDirectoryTraversal,
  requiredEntries: readonly IFilesystemExactPathSelectionPlanEntry[],
  missingEntries: readonly IFilesystemExactPathSelectionPlanEntry[],
  signal: AbortSignal | undefined,
): Promise<void> => {
  if (missingEntries.length === 0 || requiredEntries.length < 2) {
    return;
  }

  const missingEntrySet = new Set(missingEntries);
  const observations: IFilesystemExactPathLookupObservation[] = [];

  for (const plannedEntry of requiredEntries) {
    throwIfFilesystemRepositoryCreationAborted(signal, plannedEntry.path);

    let statistics: BigIntStats;

    try {
      statistics = await lstat(path.join(parentDirectory.hostPath, plannedEntry.segment), {
        bigint: true,
      });
    } catch (cause) {
      throwIfFilesystemRepositoryCreationAborted(signal, plannedEntry.path);

      if (missingEntrySet.has(plannedEntry)) {
        continue;
      }

      return throwObservedFilesystemRepositoryCreationError(cause, plannedEntry.path);
    }

    throwIfFilesystemRepositoryCreationAborted(signal, plannedEntry.path);

    const aliasKey = getFilesystemNameAliasKey(plannedEntry.segment);
    const matchingObservation = observations.find(
      (observation) =>
        observation.aliasKey === aliasKey &&
        observation.device === statistics.dev &&
        observation.inode === statistics.ino,
    );

    if (
      matchingObservation !== undefined &&
      (missingEntrySet.has(plannedEntry) || missingEntrySet.has(matchingObservation.plannedEntry))
    ) {
      const collisionPath = missingEntrySet.has(matchingObservation.plannedEntry)
        ? matchingObservation.plannedEntry.path
        : plannedEntry.path;

      return throwFilesystemRepositoryCreationException(
        'INVALID_SOURCE_DATA',
        false,
        collisionPath,
      );
    }

    observations.push({
      aliasKey,
      device: statistics.dev,
      inode: statistics.ino,
      plannedEntry,
    });
  }
};

/**
 * Materializes one private exact-path inventory beneath a prepared canonical root.
 * @param preparedRoot The validated fixed root and detached reader options.
 * @param selectionPlan The deterministic selected and synthesized logical path plan.
 * @returns A frozen root-inclusive inventory for later fingerprint construction.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - ENTRY_NOT_DIRECTORY: The requested repository entry is not a directory.
 * - ENTRY_NOT_FOUND: The requested repository entry was not found.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
export const createFilesystemExactPathInventory = async (
  preparedRoot: IPreparedFilesystemRepositoryRoot,
  selectionPlan: IFilesystemExactPathSelectionPlan,
): Promise<IFilesystemExactPathInventory> => {
  const childrenByParentPath = new Map<IRepositoryPath, IFilesystemExactPathSelectionPlanEntry[]>();

  for (const plannedEntry of selectionPlan.entries) {
    const siblings = childrenByParentPath.get(plannedEntry.parentPath);

    if (siblings === undefined) {
      childrenByParentPath.set(plannedEntry.parentPath, [plannedEntry]);
    } else {
      siblings.push(plannedEntry);
    }
  }

  const rootEntry: IFilesystemExactPathInventoryEntry = Object.freeze({
    hostPath: preparedRoot.resolvedRootDirectory,
    path: REPOSITORY_ROOT,
    type: 'directory',
  });
  const entriesByPath = new Map<IRepositoryPath, IFilesystemExactPathInventoryEntry>([
    [REPOSITORY_ROOT, rootEntry],
  ]);
  const pendingDirectories: IFilesystemDirectoryTraversal[] = [
    {
      hostPath: preparedRoot.resolvedRootDirectory,
      logicalPath: REPOSITORY_ROOT,
    },
  ];

  for (let directoryIndex = 0; directoryIndex < pendingDirectories.length; directoryIndex += 1) {
    const currentDirectory = pendingDirectories[directoryIndex];

    if (currentDirectory === undefined) {
      continue;
    }

    const requiredEntries = childrenByParentPath.get(currentDirectory.logicalPath);

    if (requiredEntries === undefined || requiredEntries.length === 0) {
      continue;
    }

    const encodedNames = await readRequiredDirectoryNames(
      currentDirectory,
      preparedRoot.options.signal,
    );
    const missingEntries = getMissingFilesystemExactPathDirectoryEntries(
      encodedNames,
      requiredEntries,
    );

    await throwIfRequiredEntriesCollapse(
      currentDirectory,
      requiredEntries,
      missingEntries,
      preparedRoot.options.signal,
    );

    const matchedEntries = matchFilesystemExactPathDirectoryNames(
      encodedNames,
      requiredEntries,
      currentDirectory.logicalPath,
    );

    for (const { encodedName, plannedEntry } of matchedEntries) {
      const inventoryEntry = await captureMatchedEntry(
        currentDirectory,
        plannedEntry,
        encodedName,
        preparedRoot.options.signal,
      );
      const hasRequiredDescendants = childrenByParentPath.has(plannedEntry.path);

      if (hasRequiredDescendants && inventoryEntry.type !== 'directory') {
        if (inventoryEntry.type === 'symlink') {
          return throwFilesystemRepositoryCreationException(
            'INVALID_SOURCE_DATA',
            false,
            plannedEntry.path,
          );
        }

        return throwFilesystemRepositoryCreationException(
          'ENTRY_NOT_DIRECTORY',
          false,
          plannedEntry.path,
        );
      }

      entriesByPath.set(plannedEntry.path, inventoryEntry);

      if (hasRequiredDescendants) {
        pendingDirectories.push({
          hostPath: inventoryEntry.hostPath,
          logicalPath: inventoryEntry.path,
        });
      }
    }
  }

  const entries = [
    rootEntry,
    ...selectionPlan.entries.map((plannedEntry) => {
      const inventoryEntry = entriesByPath.get(plannedEntry.path);

      if (inventoryEntry === undefined) {
        return throwFilesystemRepositoryCreationException(
          'SNAPSHOT_CHANGED',
          true,
          plannedEntry.path,
        );
      }

      return inventoryEntry;
    }),
  ];

  return Object.freeze({ entries: Object.freeze(entries) });
};
