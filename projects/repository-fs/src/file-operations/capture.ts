import { constants, type BigIntStats } from 'node:fs';
import { lstat, open, type FileHandle } from 'node:fs/promises';

import { RepositorySourceException, type IRepositoryPath } from '@moldea.ai/repository';

import {
  throwFilesystemRepositoryOperationException,
  throwIfFilesystemRepositoryOperationAborted,
  throwObservedFilesystemRepositoryOperationError,
} from '../source-exception/index.js';
import { FILESYSTEM_FILE_READ_CHUNK_BYTES } from './constants.js';
import type { IFilesystemFileCaptureCheckpoints, IFilesystemFileCaptureTarget } from './types.js';
import {
  assertFilesystemFileReadDirectoryUnchanged,
  assertFilesystemFileReadEntryUnchanged,
} from './utilities.js';

/** Uses the strongest read-only final-component no-follow flags exposed by the runtime. */
const getFilesystemFileReadOpenFlags = (): number => {
  const noFollowFlag: unknown = constants.O_NOFOLLOW;

  return typeof noFollowFlag === 'number' ? constants.O_RDONLY | noFollowFlag : constants.O_RDONLY;
};

/** Captures no-follow metadata for one frozen host path without exposing host errors. */
const captureFilesystemFileReadPathStatistics = async (
  hostPath: string,
  logicalPath: IRepositoryPath,
): Promise<BigIntStats> => {
  try {
    return await lstat(hostPath, { bigint: true });
  } catch (cause) {
    return throwObservedFilesystemRepositoryOperationError(cause, 'read-file', logicalPath);
  }
};

/** Revalidates the complete root-to-file path chain without following its final entry. */
const verifyFilesystemFileReadPath = async (
  target: IFilesystemFileCaptureTarget,
): Promise<void> => {
  for (const directory of target.directories) {
    const statistics = await captureFilesystemFileReadPathStatistics(
      directory.hostPath,
      target.file.path,
    );

    assertFilesystemFileReadDirectoryUnchanged(directory, statistics, target.file.path);
  }

  const fileStatistics = await captureFilesystemFileReadPathStatistics(
    target.file.hostPath,
    target.file.path,
  );

  assertFilesystemFileReadEntryUnchanged(target.file, fileStatistics);
};

/** Revalidates an opened file handle against the selected creation-time fingerprint. */
const verifyOpenedFilesystemFile = async (
  fileHandle: FileHandle,
  target: IFilesystemFileCaptureTarget,
): Promise<void> => {
  let statistics: BigIntStats;

  try {
    statistics = await fileHandle.stat({ bigint: true });
  } catch (cause) {
    return throwObservedFilesystemRepositoryOperationError(cause, 'read-file', target.file.path);
  }

  assertFilesystemFileReadEntryUnchanged(target.file, statistics);
};

/**
 * Converts cancellation into `ABORTED` only after the active capture remains coherent.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 */
const throwIfFilesystemFileCaptureAborted = async (
  signal: AbortSignal | undefined,
  target: IFilesystemFileCaptureTarget,
  fileHandle: FileHandle,
): Promise<void> => {
  if (signal?.aborted !== true) {
    return;
  }

  try {
    await verifyOpenedFilesystemFile(fileHandle, target);
    await verifyFilesystemFileReadPath(target);
  } catch (cause) {
    if (cause instanceof RepositorySourceException && cause.code === 'SNAPSHOT_CHANGED') {
      throw cause;
    }

    return throwFilesystemRepositoryOperationException(
      'SNAPSHOT_CHANGED',
      'read-file',
      true,
      target.file.path,
      cause,
    );
  }

  throwIfFilesystemRepositoryOperationAborted(signal, 'read-file', target.file.path);
};

/**
 * Reads one uncaptured regular file only while its frozen identity remains provable.
 * @param target The frozen file and complete directory identity chain.
 * @param maximumByteLength The largest allocation permitted by active resource limits.
 * @param signal Optional operation cancellation.
 * @param checkpoints Optional deterministic integration-test checkpoints.
 * @returns A promise resolving to complete verified bytes not yet owned by the cache.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - RESOURCE_LIMIT_EXCEEDED: A repository reading resource limit was exceeded.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
export const captureFilesystemRepositoryFile = async (
  target: IFilesystemFileCaptureTarget,
  maximumByteLength: number,
  signal?: AbortSignal,
  checkpoints?: IFilesystemFileCaptureCheckpoints,
): Promise<Uint8Array> => {
  throwIfFilesystemRepositoryOperationAborted(signal, 'read-file', target.file.path);
  await verifyFilesystemFileReadPath(target);
  throwIfFilesystemRepositoryOperationAborted(signal, 'read-file', target.file.path);

  let fileHandle: FileHandle;

  try {
    fileHandle = await open(target.file.hostPath, getFilesystemFileReadOpenFlags());
  } catch (cause) {
    if (signal?.aborted === true) {
      try {
        await verifyFilesystemFileReadPath(target);
      } catch (verificationCause) {
        if (
          verificationCause instanceof RepositorySourceException &&
          verificationCause.code === 'SNAPSHOT_CHANGED'
        ) {
          throw verificationCause;
        }

        return throwFilesystemRepositoryOperationException(
          'SNAPSHOT_CHANGED',
          'read-file',
          true,
          target.file.path,
          verificationCause,
        );
      }

      throwIfFilesystemRepositoryOperationAborted(signal, 'read-file', target.file.path);
    }

    return throwObservedFilesystemRepositoryOperationError(cause, 'read-file', target.file.path);
  }

  let capturedBytes: Uint8Array | undefined;
  let operationFailure: unknown;
  let hasOperationFailure = false;

  try {
    await checkpoints?.afterOpen?.();
    await verifyOpenedFilesystemFile(fileHandle, target);
    await verifyFilesystemFileReadPath(target);
    await throwIfFilesystemFileCaptureAborted(signal, target, fileHandle);

    if (target.file.fingerprint.size > BigInt(maximumByteLength)) {
      return throwFilesystemRepositoryOperationException(
        'RESOURCE_LIMIT_EXCEEDED',
        'read-file',
        false,
        target.file.path,
      );
    }

    const expectedByteLength = Number(target.file.fingerprint.size);
    const pendingBytes = new Uint8Array(expectedByteLength);
    let capturedByteCount = 0;

    while (capturedByteCount < expectedByteLength) {
      await throwIfFilesystemFileCaptureAborted(signal, target, fileHandle);

      const remainingByteCount = expectedByteLength - capturedByteCount;
      const requestedByteCount = Math.min(remainingByteCount, FILESYSTEM_FILE_READ_CHUNK_BYTES);
      let bytesRead: number;

      try {
        ({ bytesRead } = await fileHandle.read(
          pendingBytes,
          capturedByteCount,
          requestedByteCount,
          capturedByteCount,
        ));
      } catch (cause) {
        if (signal?.aborted === true) {
          await throwIfFilesystemFileCaptureAborted(signal, target, fileHandle);
        }

        return throwObservedFilesystemRepositoryOperationError(
          cause,
          'read-file',
          target.file.path,
        );
      }

      if (bytesRead === 0) {
        break;
      }

      capturedByteCount += bytesRead;
      await checkpoints?.afterReadChunk?.(capturedByteCount);
    }

    await verifyOpenedFilesystemFile(fileHandle, target);
    await verifyFilesystemFileReadPath(target);

    if (capturedByteCount !== expectedByteLength) {
      return throwFilesystemRepositoryOperationException(
        'SNAPSHOT_CHANGED',
        'read-file',
        true,
        target.file.path,
      );
    }

    await throwIfFilesystemFileCaptureAborted(signal, target, fileHandle);
    capturedBytes = pendingBytes;
  } catch (cause) {
    operationFailure = cause;
    hasOperationFailure = true;
  }

  try {
    await fileHandle.close();
  } catch (cause) {
    if (!hasOperationFailure) {
      operationFailure = cause;
      hasOperationFailure = true;
    }
  }

  if (hasOperationFailure) {
    if (operationFailure instanceof RepositorySourceException) {
      throw operationFailure;
    }

    return throwObservedFilesystemRepositoryOperationError(
      operationFailure,
      'read-file',
      target.file.path,
    );
  }

  if (capturedBytes === undefined) {
    return throwFilesystemRepositoryOperationException(
      'SOURCE_UNAVAILABLE',
      'read-file',
      true,
      target.file.path,
    );
  }

  return capturedBytes;
};
