import {
  createFilesystemDirectoryIdentity,
  createFilesystemRegularFileFingerprint,
  hasSameFilesystemDirectoryIdentity,
  hasSameFilesystemRegularFileFingerprint,
} from '../filesystem-fingerprint/index.js';
import type { IFilesystemInventoryEntry } from '../inventory/index.js';
import { throwFilesystemRepositoryCreationException } from '../source-exception/index.js';

interface IFilesystemVerificationStatistics {
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
 * Verifies one current no-follow observation against its creation-time inventory entry.
 * @param entry The frozen creation-time inventory entry.
 * @param statistics The current no-follow metadata for the same host path.
 * @param shouldVerifyDirectoryIdentity Whether directory replacement affects this selection.
 * @throws
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 */
export const assertFilesystemInventoryEntryUnchanged = (
  entry: IFilesystemInventoryEntry,
  statistics: IFilesystemVerificationStatistics,
  shouldVerifyDirectoryIdentity: boolean,
): void => {
  const hasExpectedType =
    (entry.type === 'file' && statistics.isFile()) ||
    (entry.type === 'directory' && statistics.isDirectory()) ||
    (entry.type === 'symlink' && statistics.isSymbolicLink());

  if (!hasExpectedType) {
    return throwFilesystemRepositoryCreationException('SNAPSHOT_CHANGED', true, entry.path);
  }

  if (
    entry.type === 'file' &&
    !hasSameFilesystemRegularFileFingerprint(
      entry.fingerprint,
      createFilesystemRegularFileFingerprint(statistics),
    )
  ) {
    return throwFilesystemRepositoryCreationException('SNAPSHOT_CHANGED', true, entry.path);
  }

  if (
    entry.type === 'directory' &&
    shouldVerifyDirectoryIdentity &&
    !hasSameFilesystemDirectoryIdentity(
      entry.identity,
      createFilesystemDirectoryIdentity(statistics),
    )
  ) {
    return throwFilesystemRepositoryCreationException('SNAPSHOT_CHANGED', true, entry.path);
  }
};
