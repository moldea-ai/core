import type { Buffer } from 'node:buffer';
import type { BigIntStats } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';

import type {
  IFilesystemDirectoryInventoryEntry,
  IFilesystemInventoryEntry,
} from '../inventory/index.js';
import {
  throwIfFilesystemRepositoryCreationAborted,
  throwObservedFilesystemRepositoryCreationError,
} from '../source-exception/index.js';

/**
 * Captures current no-follow metadata for one previously observed inventory entry.
 * @param entry The private inventory entry whose source metadata must be revalidated.
 * @param signal The live reader-creation cancellation signal.
 * @returns A promise resolving to the current no-follow metadata.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
export const captureFilesystemVerificationStatistics = async (
  entry: IFilesystemInventoryEntry,
  signal: AbortSignal | undefined,
): Promise<BigIntStats> => {
  throwIfFilesystemRepositoryCreationAborted(signal, entry.path);

  let statistics: BigIntStats;

  try {
    statistics = await lstat(entry.hostPath, { bigint: true });
  } catch (cause) {
    throwIfFilesystemRepositoryCreationAborted(signal, entry.path);

    return throwObservedFilesystemRepositoryCreationError(cause, entry.path);
  }

  throwIfFilesystemRepositoryCreationAborted(signal, entry.path);

  return statistics;
};

/**
 * Reads current raw names for one previously observed inventory directory.
 * @param entry The private directory entry whose membership must be revalidated.
 * @param signal The live reader-creation cancellation signal.
 * @returns A promise resolving to the current raw child names.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
export const readFilesystemVerificationDirectoryNames = async (
  entry: IFilesystemDirectoryInventoryEntry,
  signal: AbortSignal | undefined,
): Promise<readonly Buffer[]> => {
  throwIfFilesystemRepositoryCreationAborted(signal, entry.path);

  let encodedNames: Buffer[];

  try {
    encodedNames = await readdir(entry.hostPath, { encoding: 'buffer' });
  } catch (cause) {
    throwIfFilesystemRepositoryCreationAborted(signal, entry.path);

    return throwObservedFilesystemRepositoryCreationError(cause, entry.path);
  }

  throwIfFilesystemRepositoryCreationAborted(signal, entry.path);

  return encodedNames;
};
