import type { IRepositoryPath } from '@moldea.ai/repository';

import { classifyFilesystemEntry } from '../entry-classification/index.js';
import {
  createFilesystemDirectoryIdentity,
  createFilesystemRegularFileFingerprint,
} from '../filesystem-fingerprint/index.js';
import type { IFilesystemInventoryEntry } from './types.js';

interface IFilesystemInventoryEntryStatistics {
  readonly birthtimeNs: bigint;
  readonly ctimeNs: bigint;
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly mtimeNs: bigint;
  readonly size: bigint;
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

/**
 * Converts one no-follow host observation into a frozen discriminated inventory entry.
 * @param hostPath The private resolved host path for later verification.
 * @param logicalPath The safe logical path represented by the entry.
 * @param statistics The no-follow metadata captured for the entry.
 * @returns A frozen file, directory, or symlink inventory entry.
 * @throws
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 */
export const createFilesystemInventoryEntry = (
  hostPath: string,
  logicalPath: IRepositoryPath,
  statistics: IFilesystemInventoryEntryStatistics,
): IFilesystemInventoryEntry => {
  const type = classifyFilesystemEntry(statistics, logicalPath);

  if (type === 'file') {
    return Object.freeze({
      fingerprint: createFilesystemRegularFileFingerprint(statistics),
      hostPath,
      path: logicalPath,
      type,
    });
  }

  if (type === 'directory') {
    return Object.freeze({
      hostPath,
      identity: createFilesystemDirectoryIdentity(statistics),
      path: logicalPath,
      type,
    });
  }

  return Object.freeze({ hostPath, path: logicalPath, type });
};
