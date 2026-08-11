import type { BigIntStats } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';

import { RepositorySourceException } from '@moldea.ai/repository';

import {
  normalizeFilesystemRepositoryOptions,
  type INormalizedFilesystemRepositoryReaderOptions,
} from '../options/index.js';

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

const throwCreationSourceException = (
  code:
    | 'ABORTED'
    | 'ACCESS_DENIED'
    | 'ENTRY_NOT_DIRECTORY'
    | 'ENTRY_NOT_FOUND'
    | 'SNAPSHOT_CHANGED'
    | 'SOURCE_UNAVAILABLE',
  retryable: boolean,
  cause?: unknown,
): never => {
  throw new RepositorySourceException({
    cause,
    code,
    operation: 'create-reader',
    path: null,
    retryable,
  });
};

const throwIfCreationAborted = (signal: AbortSignal | undefined): void => {
  if (signal?.aborted === true) {
    throwCreationSourceException('ABORTED', true, signal.reason);
  }
};

const getNodeErrorCode = (cause: unknown): string | undefined => {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) {
    return undefined;
  }

  return typeof cause.code === 'string' ? cause.code : undefined;
};

/** Maps an initial host-root failure without exposing its host path or raw message. */
const throwInitialRootError = (cause: unknown): never => {
  const errorCode = getNodeErrorCode(cause);

  if (errorCode === 'ENOENT') {
    return throwCreationSourceException('ENTRY_NOT_FOUND', true, cause);
  }

  if (errorCode === 'ENOTDIR') {
    return throwCreationSourceException('ENTRY_NOT_DIRECTORY', false, cause);
  }

  if (errorCode === 'EACCES' || errorCode === 'EPERM') {
    return throwCreationSourceException('ACCESS_DENIED', true, cause);
  }

  return throwCreationSourceException('SOURCE_UNAVAILABLE', true, cause);
};

/** Maps a failure after root identity capture according to remaining snapshot confidence. */
const throwRootRevalidationError = (cause: unknown): never => {
  const errorCode = getNodeErrorCode(cause);

  if (errorCode === 'ENOENT' || errorCode === 'ENOTDIR') {
    return throwCreationSourceException('SNAPSHOT_CHANGED', true, cause);
  }

  if (errorCode === 'EACCES' || errorCode === 'EPERM') {
    return throwCreationSourceException('ACCESS_DENIED', true, cause);
  }

  return throwCreationSourceException('SOURCE_UNAVAILABLE', true, cause);
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

  throwIfCreationAborted(options.signal);

  let resolvedRootDirectory: string;
  let initialStatistics: BigIntStats;

  try {
    resolvedRootDirectory = await realpath(options.rootDirectory);
    throwIfCreationAborted(options.signal);
    initialStatistics = await lstat(resolvedRootDirectory, { bigint: true });
  } catch (cause) {
    if (cause instanceof RepositorySourceException) {
      throw cause;
    }

    throwIfCreationAborted(options.signal);

    return throwInitialRootError(cause);
  }

  throwIfCreationAborted(options.signal);

  if (!initialStatistics.isDirectory()) {
    return throwCreationSourceException('ENTRY_NOT_DIRECTORY', false);
  }

  const identity = captureRootIdentity(initialStatistics);

  throwIfCreationAborted(options.signal);

  let revalidatedStatistics: BigIntStats;

  try {
    revalidatedStatistics = await lstat(resolvedRootDirectory, { bigint: true });
  } catch (cause) {
    throwIfCreationAborted(options.signal);

    return throwRootRevalidationError(cause);
  }

  throwIfCreationAborted(options.signal);

  if (
    !revalidatedStatistics.isDirectory() ||
    !hasSameRootIdentity(identity, captureRootIdentity(revalidatedStatistics))
  ) {
    return throwCreationSourceException('SNAPSHOT_CHANGED', true);
  }

  return Object.freeze({
    identity,
    options,
    resolvedRootDirectory,
  });
};
