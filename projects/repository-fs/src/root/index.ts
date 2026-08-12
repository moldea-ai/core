import type { BigIntStats } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';

import { RepositorySourceException } from '@moldea.ai/repository';

import {
  normalizeFilesystemRepositoryOptions,
  type INormalizedFilesystemRepositoryReaderOptions,
} from '../options/index.js';
import {
  getNodeErrorCode,
  throwFilesystemRepositoryCreationException,
  throwIfFilesystemRepositoryCreationAborted,
  throwObservedFilesystemRepositoryCreationError,
} from '../source-exception/index.js';

// stable resolved-root identity retained for later snapshot verification
interface IFilesystemRootIdentity {
  readonly birthtimeNanoseconds: bigint;
  readonly device: bigint;
  readonly inode: bigint;
  readonly mode: bigint;
}

// private root preparation result for subsequent reader-construction phases
export interface IPreparedFilesystemRepositoryRoot {
  readonly identity: IFilesystemRootIdentity;
  readonly options: INormalizedFilesystemRepositoryReaderOptions;
  readonly resolvedRootDirectory: string;
}

/** Maps an initial host-root failure without exposing its host path or raw message. */
const throwInitialRootError = (cause: unknown): never => {
  const errorCode = getNodeErrorCode(cause);

  if (errorCode === 'ENOENT') {
    return throwFilesystemRepositoryCreationException('ENTRY_NOT_FOUND', true, null, cause);
  }

  if (errorCode === 'ENOTDIR') {
    return throwFilesystemRepositoryCreationException('ENTRY_NOT_DIRECTORY', false, null, cause);
  }

  if (errorCode === 'EACCES' || errorCode === 'EPERM') {
    return throwFilesystemRepositoryCreationException('ACCESS_DENIED', true, null, cause);
  }

  return throwFilesystemRepositoryCreationException('SOURCE_UNAVAILABLE', true, null, cause);
};

const captureRootIdentity = (statistics: BigIntStats): IFilesystemRootIdentity => {
  return Object.freeze({
    birthtimeNanoseconds: statistics.birthtimeNs,
    device: statistics.dev,
    inode: statistics.ino,
    mode: statistics.mode,
  });
};

const hasSameRootIdentity = (
  firstIdentity: IFilesystemRootIdentity,
  secondIdentity: IFilesystemRootIdentity,
): boolean => {
  return (
    firstIdentity.birthtimeNanoseconds === secondIdentity.birthtimeNanoseconds &&
    firstIdentity.device === secondIdentity.device &&
    firstIdentity.inode === secondIdentity.inode &&
    firstIdentity.mode === secondIdentity.mode
  );
};

/**
 * Validates options and resolves one explicit root to a stable canonical directory identity.
 * @param candidate The untrusted filesystem-reader options.
 * @returns A frozen root preparation result for later inventory construction.
 * @throws
 * - INVALID_REPOSITORY_PATH: The repository path is invalid.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - ABORTED: The repository operation was aborted.
 * - ENTRY_NOT_FOUND: The requested repository entry was not found.
 * - ENTRY_NOT_DIRECTORY: The requested repository entry is not a directory.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 */
export const prepareFilesystemRepositoryRoot = async (
  candidate: unknown,
): Promise<IPreparedFilesystemRepositoryRoot> => {
  const options = normalizeFilesystemRepositoryOptions(candidate);

  throwIfFilesystemRepositoryCreationAborted(options.signal);

  let resolvedRootDirectory: string;
  let initialStatistics: BigIntStats;

  try {
    resolvedRootDirectory = await realpath(options.rootDirectory);
    throwIfFilesystemRepositoryCreationAborted(options.signal);
    initialStatistics = await lstat(resolvedRootDirectory, { bigint: true });
  } catch (cause) {
    if (cause instanceof RepositorySourceException) {
      throw cause;
    }

    throwIfFilesystemRepositoryCreationAborted(options.signal);

    return throwInitialRootError(cause);
  }

  throwIfFilesystemRepositoryCreationAborted(options.signal);

  if (!initialStatistics.isDirectory()) {
    return throwFilesystemRepositoryCreationException('ENTRY_NOT_DIRECTORY', false, null);
  }

  const identity = captureRootIdentity(initialStatistics);

  throwIfFilesystemRepositoryCreationAborted(options.signal);

  let revalidatedStatistics: BigIntStats;

  try {
    revalidatedStatistics = await lstat(resolvedRootDirectory, { bigint: true });
  } catch (cause) {
    throwIfFilesystemRepositoryCreationAborted(options.signal);

    return throwObservedFilesystemRepositoryCreationError(cause, null);
  }

  throwIfFilesystemRepositoryCreationAborted(options.signal);

  if (
    !revalidatedStatistics.isDirectory() ||
    !hasSameRootIdentity(identity, captureRootIdentity(revalidatedStatistics))
  ) {
    return throwFilesystemRepositoryCreationException('SNAPSHOT_CHANGED', true, null);
  }

  return Object.freeze({
    identity,
    options,
    resolvedRootDirectory,
  });
};
