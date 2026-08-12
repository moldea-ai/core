import { REPOSITORY_ROOT, parseRepositoryPath, type IRepositoryPath } from '@moldea.ai/repository';

import {
  createFilesystemDirectoryIdentity,
  createFilesystemRegularFileFingerprint,
  hasSameFilesystemDirectoryIdentity,
  hasSameFilesystemRegularFileFingerprint,
} from '../filesystem-fingerprint/index.js';
import type {
  IFilesystemDirectoryInventoryEntry,
  IFilesystemInventoryEntry,
  IFilesystemRegularFileInventoryEntry,
} from '../inventory/index.js';
import { throwFilesystemRepositoryOperationException } from '../source-exception/index.js';
import type { IFilesystemFileCaptureTarget, IFilesystemRepositoryFileCacheState } from './types.js';

interface IFilesystemFileReadStatistics {
  readonly birthtimeNs: bigint;
  readonly ctimeNs: bigint;
  readonly dev: bigint;
  readonly ino: bigint;
  readonly mode: bigint;
  readonly mtimeNs: bigint;
  readonly size: bigint;
  isDirectory(): boolean;
  isFile(): boolean;
}

/** Returns the logical parent of one validated non-root repository path. */
const getFilesystemRepositoryParentPath = (logicalPath: IRepositoryPath): IRepositoryPath => {
  const separatorIndex = logicalPath.lastIndexOf('/');

  return separatorIndex === 0
    ? REPOSITORY_ROOT
    : parseRepositoryPath(logicalPath.slice(0, separatorIndex));
};

/**
 * Builds one file target with every frozen directory from the root to its parent.
 * @param entriesByPath The exact frozen inventory lookup.
 * @param file The frozen regular-file entry to capture.
 * @returns The file and its ordered no-follow directory verification chain.
 * @throws
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 */
export const createFilesystemFileCaptureTarget = (
  entriesByPath: ReadonlyMap<IRepositoryPath, IFilesystemInventoryEntry>,
  file: IFilesystemRegularFileInventoryEntry,
): IFilesystemFileCaptureTarget => {
  const reversedDirectories: IFilesystemDirectoryInventoryEntry[] = [];
  let currentPath = getFilesystemRepositoryParentPath(file.path);

  while (true) {
    const entry = entriesByPath.get(currentPath);

    if (entry?.type !== 'directory') {
      return throwFilesystemRepositoryOperationException(
        'INVALID_SOURCE_DATA',
        'read-file',
        false,
        file.path,
      );
    }

    reversedDirectories.push(entry);

    if (currentPath === REPOSITORY_ROOT) {
      break;
    }

    currentPath = getFilesystemRepositoryParentPath(currentPath);
  }

  return Object.freeze({
    directories: Object.freeze(reversedDirectories.reverse()),
    file,
  });
};

/**
 * Verifies one directory observation against its frozen stable identity.
 * @param entry The frozen directory entry.
 * @param statistics The current no-follow directory metadata.
 * @param affectedPath The file operation path whose chain is being verified.
 * @throws
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 */
export const assertFilesystemFileReadDirectoryUnchanged = (
  entry: IFilesystemDirectoryInventoryEntry,
  statistics: IFilesystemFileReadStatistics,
  affectedPath: IRepositoryPath,
): void => {
  if (
    !statistics.isDirectory() ||
    !hasSameFilesystemDirectoryIdentity(
      entry.identity,
      createFilesystemDirectoryIdentity(statistics),
    )
  ) {
    return throwFilesystemRepositoryOperationException(
      'SNAPSHOT_CHANGED',
      'read-file',
      true,
      affectedPath,
    );
  }
};

/**
 * Verifies one file observation against its frozen creation-time fingerprint.
 * @param entry The frozen regular-file entry.
 * @param statistics The current path or open-handle metadata.
 * @throws
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 */
export const assertFilesystemFileReadEntryUnchanged = (
  entry: IFilesystemRegularFileInventoryEntry,
  statistics: IFilesystemFileReadStatistics,
): void => {
  if (
    !statistics.isFile() ||
    !hasSameFilesystemRegularFileFingerprint(
      entry.fingerprint,
      createFilesystemRegularFileFingerprint(statistics),
    )
  ) {
    return throwFilesystemRepositoryOperationException(
      'SNAPSHOT_CHANGED',
      'read-file',
      true,
      entry.path,
    );
  }
};

/**
 * Derives the largest exact file length allowed by both active byte limits.
 * @param cache The reader's private captured-byte accounting state.
 * @param maxFileBytes The configured single-file limit.
 * @param maxCachedBytes The configured total private-cache limit.
 * @returns The non-negative maximum byte length available to the next capture.
 */
export const getMaximumFilesystemFileCaptureBytes = (
  cache: IFilesystemRepositoryFileCacheState,
  maxFileBytes: number,
  maxCachedBytes: number,
): number => {
  return Math.min(maxFileBytes, maxCachedBytes - cache.cachedByteCount);
};

/**
 * Copies one cached file into caller-owned storage.
 * @param cache The private cache to inspect.
 * @param path The exact frozen file path.
 * @returns A fresh byte array or `undefined` when the file is uncaptured.
 */
export const copyCachedFilesystemFile = (
  cache: IFilesystemRepositoryFileCacheState,
  path: IRepositoryPath,
): Uint8Array | undefined => {
  const cachedBytes = cache.filesByPath.get(path);

  return cachedBytes === undefined ? undefined : new Uint8Array(cachedBytes);
};

/**
 * Atomically copies one completed capture into private cache storage.
 * @param cache The private cache and byte accounting to update.
 * @param path The exact frozen file path.
 * @param capturedBytes The fully verified bytes to copy.
 * @param maxCachedBytes The configured total private-cache limit.
 * @returns A fresh caller-owned copy of the authoritative cached bytes.
 * @throws
 * - RESOURCE_LIMIT_EXCEEDED: A repository reading resource limit was exceeded.
 */
export const commitFilesystemFileCapture = (
  cache: IFilesystemRepositoryFileCacheState,
  path: IRepositoryPath,
  capturedBytes: Uint8Array,
  maxCachedBytes: number,
): Uint8Array => {
  const existingBytes = cache.filesByPath.get(path);

  if (existingBytes !== undefined) {
    return new Uint8Array(existingBytes);
  }

  const nextCachedByteCount = cache.cachedByteCount + capturedBytes.byteLength;

  if (!Number.isSafeInteger(nextCachedByteCount) || nextCachedByteCount > maxCachedBytes) {
    return throwFilesystemRepositoryOperationException(
      'RESOURCE_LIMIT_EXCEEDED',
      'read-file',
      false,
      path,
    );
  }

  const cachedBytes = new Uint8Array(capturedBytes);

  cache.filesByPath.set(path, cachedBytes);
  cache.cachedByteCount = nextCachedByteCount;

  return new Uint8Array(cachedBytes);
};
