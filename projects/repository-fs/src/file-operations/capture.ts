import { Buffer } from 'node:buffer';
import { constants, type BigIntStats } from 'node:fs';
import { lstat, open, type FileHandle } from 'node:fs/promises';

import { RepositorySourceException, type IRepositoryPath } from '@moldea.ai/repository';

import {
  markFilesystemRepositoryReaderInvalidated,
  throwIfFilesystemRepositoryReaderInvalidated,
  type IFilesystemRepositoryReaderState,
} from '../reader-state/index.js';
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

/**
 * Captures no-follow metadata for one frozen host path without exposing host errors.
 * @param hostPath The private host path to observe without following its final entry.
 * @param logicalPath The safe logical path represented by the host path.
 * @returns A promise resolving to the no-follow metadata.
 * @throws
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 */
const captureFilesystemFileReadPathStatistics = async (
  hostPath: string,
  logicalPath: IRepositoryPath,
): Promise<BigIntStats> => {
  try {
    return await lstat(hostPath, { bigint: true });
  } catch (cause) {
    return throwFilesystemRepositoryOperationException(
      'SNAPSHOT_CHANGED',
      'read-file',
      true,
      logicalPath,
      cause,
    );
  }
};

/**
 * Revalidates the complete root-to-file path chain without following its final entry.
 * @param state The shared reader state whose lifecycle remains authoritative.
 * @param target The frozen file and complete directory identity chain.
 * @returns A promise resolving after the path remains coherent.
 * @throws
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 */
const verifyFilesystemFileReadPath = async (
  state: IFilesystemRepositoryReaderState,
  target: IFilesystemFileCaptureTarget,
): Promise<void> => {
  for (const directory of target.directories) {
    throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);

    const statistics = await captureFilesystemFileReadPathStatistics(
      directory.hostPath,
      target.file.path,
    );

    throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);
    assertFilesystemFileReadDirectoryUnchanged(directory, statistics, target.file.path);
  }

  throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);
  const fileStatistics = await captureFilesystemFileReadPathStatistics(
    target.file.hostPath,
    target.file.path,
  );

  throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);
  assertFilesystemFileReadEntryUnchanged(target.file, fileStatistics);
};

/**
 * Revalidates an opened file handle against the selected creation-time fingerprint.
 * @param state The shared reader state whose lifecycle remains authoritative.
 * @param fileHandle The open file handle to verify.
 * @param target The frozen file and complete directory identity chain.
 * @returns A promise resolving after the handle remains coherent.
 * @throws
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 */
const verifyOpenedFilesystemFile = async (
  state: IFilesystemRepositoryReaderState,
  fileHandle: FileHandle,
  target: IFilesystemFileCaptureTarget,
): Promise<void> => {
  throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);

  let statistics: BigIntStats;

  try {
    statistics = await fileHandle.stat({ bigint: true });
  } catch (cause) {
    return throwFilesystemRepositoryOperationException(
      'SNAPSHOT_CHANGED',
      'read-file',
      true,
      target.file.path,
      cause,
    );
  }

  throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);
  assertFilesystemFileReadEntryUnchanged(target.file, statistics);
};

/**
 * Revalidates the active capture before exposing one host access or I/O failure.
 * @param state The shared reader state whose lifecycle remains authoritative.
 * @param cause The unknown host failure to classify after revalidation.
 * @param target The frozen file and complete directory identity chain.
 * @param fileHandle The open file handle to verify when available.
 * @returns A promise that rejects with the coherent public failure.
 * @throws
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
const throwCoherentFilesystemFileCaptureError = async (
  state: IFilesystemRepositoryReaderState,
  cause: unknown,
  target: IFilesystemFileCaptureTarget,
  fileHandle?: FileHandle,
): Promise<never> => {
  if (fileHandle !== undefined) {
    await verifyOpenedFilesystemFile(state, fileHandle, target);
  }

  await verifyFilesystemFileReadPath(state, target);
  throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);

  return throwObservedFilesystemRepositoryOperationError(cause, 'read-file', target.file.path);
};

/**
 * Runs one deterministic capture checkpoint as a coherence-aware host failure seam.
 * @param state The shared reader state whose lifecycle remains authoritative.
 * @param checkpoint The optional checkpoint callback to invoke.
 * @param target The frozen file and complete directory identity chain.
 * @param fileHandle The active file handle to revalidate after a checkpoint failure.
 * @returns A promise resolving after the checkpoint and coherence checks complete.
 * @throws
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
const runFilesystemFileCaptureCheckpoint = async (
  state: IFilesystemRepositoryReaderState,
  checkpoint: (() => void | Promise<void>) | undefined,
  target: IFilesystemFileCaptureTarget,
  fileHandle: FileHandle,
): Promise<void> => {
  if (checkpoint === undefined) {
    return;
  }

  throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);

  try {
    await checkpoint();
  } catch (cause) {
    return throwCoherentFilesystemFileCaptureError(state, cause, target, fileHandle);
  }

  throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);
};

/**
 * Converts cancellation into `ABORTED` only after the active capture remains coherent.
 * @param state The shared reader state whose lifecycle remains authoritative.
 * @param signal The optional caller-owned cancellation signal.
 * @param target The frozen file and complete directory identity chain.
 * @param fileHandle The active file handle to revalidate before cancellation wins.
 * @returns A promise resolving when the operation has not been aborted.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 */
const throwIfFilesystemFileCaptureAborted = async (
  state: IFilesystemRepositoryReaderState,
  signal: AbortSignal | undefined,
  target: IFilesystemFileCaptureTarget,
  fileHandle: FileHandle,
): Promise<void> => {
  if (signal?.aborted !== true) {
    return;
  }

  try {
    await verifyOpenedFilesystemFile(state, fileHandle, target);
    await verifyFilesystemFileReadPath(state, target);
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
 * @param state The shared reader state whose lifecycle remains authoritative.
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
  state: IFilesystemRepositoryReaderState,
  target: IFilesystemFileCaptureTarget,
  maximumByteLength: number,
  signal?: AbortSignal,
  checkpoints?: IFilesystemFileCaptureCheckpoints,
): Promise<Uint8Array> => {
  throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);
  throwIfFilesystemRepositoryOperationAborted(signal, 'read-file', target.file.path);
  await verifyFilesystemFileReadPath(state, target);
  throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);
  throwIfFilesystemRepositoryOperationAborted(signal, 'read-file', target.file.path);

  let fileHandle: FileHandle;

  try {
    fileHandle = await open(target.file.hostPath, getFilesystemFileReadOpenFlags());
  } catch (cause) {
    await verifyFilesystemFileReadPath(state, target);

    if (signal?.aborted === true) {
      throwIfFilesystemRepositoryOperationAborted(signal, 'read-file', target.file.path);
    }

    return throwObservedFilesystemRepositoryOperationError(cause, 'read-file', target.file.path);
  }

  let capturedBytes: Uint8Array | undefined;
  let closeFailure: unknown;
  let hasCloseFailure = false;
  let operationFailure: unknown;
  let hasOperationFailure = false;

  try {
    throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);
    await runFilesystemFileCaptureCheckpoint(state, checkpoints?.afterOpen, target, fileHandle);
    await verifyOpenedFilesystemFile(state, fileHandle, target);
    await verifyFilesystemFileReadPath(state, target);
    await throwIfFilesystemFileCaptureAborted(state, signal, target, fileHandle);

    if (target.file.fingerprint.size > BigInt(maximumByteLength)) {
      return throwFilesystemRepositoryOperationException(
        'RESOURCE_LIMIT_EXCEEDED',
        'read-file',
        false,
        target.file.path,
      );
    }

    const expectedByteLength = Number(target.file.fingerprint.size);
    // Buffer preserves FileHandle compatibility through supported Yarn Plug'n'Play shims.
    const pendingBytes = Buffer.alloc(expectedByteLength);
    let capturedByteCount = 0;

    while (capturedByteCount < expectedByteLength) {
      throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);
      await throwIfFilesystemFileCaptureAborted(state, signal, target, fileHandle);

      const remainingByteCount = expectedByteLength - capturedByteCount;
      const requestedByteCount = Math.min(remainingByteCount, FILESYSTEM_FILE_READ_CHUNK_BYTES);
      let bytesRead = 0;

      try {
        ({ bytesRead } = await fileHandle.read(
          pendingBytes,
          capturedByteCount,
          requestedByteCount,
          capturedByteCount,
        ));
      } catch (cause) {
        if (signal?.aborted === true) {
          await throwIfFilesystemFileCaptureAborted(state, signal, target, fileHandle);
        }

        await throwCoherentFilesystemFileCaptureError(state, cause, target, fileHandle);
      }

      throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);

      if (bytesRead === 0) {
        break;
      }

      capturedByteCount += bytesRead;
      await runFilesystemFileCaptureCheckpoint(
        state,
        checkpoints?.afterReadChunk === undefined
          ? undefined
          : () => checkpoints.afterReadChunk?.(capturedByteCount),
        target,
        fileHandle,
      );
    }

    await verifyOpenedFilesystemFile(state, fileHandle, target);
    await verifyFilesystemFileReadPath(state, target);

    if (capturedByteCount !== expectedByteLength) {
      return throwFilesystemRepositoryOperationException(
        'SNAPSHOT_CHANGED',
        'read-file',
        true,
        target.file.path,
      );
    }

    await throwIfFilesystemFileCaptureAborted(state, signal, target, fileHandle);
    throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);
    capturedBytes = new Uint8Array(
      pendingBytes.buffer,
      pendingBytes.byteOffset,
      pendingBytes.byteLength,
    );
  } catch (cause) {
    if (cause instanceof RepositorySourceException && cause.code === 'SNAPSHOT_CHANGED') {
      markFilesystemRepositoryReaderInvalidated(state, cause);
    }

    operationFailure = cause;
    hasOperationFailure = true;
  }

  try {
    if (checkpoints?.closeFileHandle === undefined) {
      await fileHandle.close();
    } else {
      await checkpoints.closeFileHandle(fileHandle);
    }
  } catch (cause) {
    closeFailure = cause;
    hasCloseFailure = true;
  }

  throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);
  await verifyFilesystemFileReadPath(state, target);
  throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);

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

  throwIfFilesystemRepositoryOperationAborted(signal, 'read-file', target.file.path);

  if (hasCloseFailure) {
    return throwFilesystemRepositoryOperationException(
      'SOURCE_UNAVAILABLE',
      'read-file',
      true,
      target.file.path,
      closeFailure,
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

  throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);
  return capturedBytes;
};
