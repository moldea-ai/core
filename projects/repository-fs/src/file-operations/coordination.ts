import { RepositorySourceException, type IRepositoryPath } from '@moldea.ai/repository';

import {
  markFilesystemRepositoryReaderInvalidated,
  throwIfFilesystemRepositoryReaderInvalidated,
  type IFilesystemRepositoryPendingFileCapture,
  type IFilesystemRepositoryReaderState,
} from '../reader-state/index.js';
import { throwIfFilesystemRepositoryOperationAborted } from '../source-exception/index.js';
import { captureFilesystemRepositoryFile } from './capture.js';
import {
  commitReservedFilesystemFileCapture,
  releaseFilesystemFileCaptureCapacity,
  reserveFilesystemFileCaptureCapacity,
} from './resource-accounting.js';
import type { IFilesystemFileCaptureCheckpoints, IFilesystemFileCaptureTarget } from './types.js';
import { copyCachedFilesystemFile } from './utilities.js';

interface IFilesystemFileCaptureCompletion {
  readonly promise: Promise<void>;
  readonly reject: (cause: Error) => void;
  readonly resolve: () => void;
}

/** Creates the completion primitive assigned to a pending capture before host work starts. */
const createFilesystemFileCaptureCompletion = (): IFilesystemFileCaptureCompletion => {
  let rejectCapture!: (cause: Error) => void;
  let resolveCapture!: () => void;
  const promise = new Promise<void>((resolve, reject) => {
    rejectCapture = reject;
    resolveCapture = resolve;
  });

  return {
    promise,
    reject: rejectCapture,
    resolve: resolveCapture,
  };
};

/** Returns whether a shared capture failure has authoritative snapshot precedence. */
const isFilesystemSnapshotChangedException = (cause: unknown): boolean => {
  return cause instanceof RepositorySourceException && cause.code === 'SNAPSHOT_CHANGED';
};

/** Converts an unexpected rejection value into the common safe source exception contract. */
const normalizeFilesystemFileCaptureFailure = (cause: unknown, path: IRepositoryPath): Error => {
  if (cause instanceof Error) {
    return cause;
  }

  return new RepositorySourceException({
    cause,
    code: 'SOURCE_UNAVAILABLE',
    operation: 'read-file',
    path,
    retryable: true,
  });
};

/**
 * Runs and settles one authoritative physical file capture.
 * @param state The shared reader state owning the capture.
 * @param target The frozen file and directory identity chain.
 * @param pendingCapture The registered capture record.
 * @param completion The record's externally awaited completion primitive.
 * @param checkpoints Optional deterministic integration-test checkpoints.
 * @returns A promise resolving after cache commit or failure cleanup.
 */
const runFilesystemFileCapture = async (
  state: IFilesystemRepositoryReaderState,
  target: IFilesystemFileCaptureTarget,
  pendingCapture: IFilesystemRepositoryPendingFileCapture,
  completion: IFilesystemFileCaptureCompletion,
  checkpoints?: IFilesystemFileCaptureCheckpoints,
): Promise<void> => {
  try {
    const capturedBytes = await captureFilesystemRepositoryFile(
      state,
      target,
      pendingCapture.reservation.maximumByteLength,
      pendingCapture.controller.signal,
      checkpoints,
    );

    throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);
    throwIfFilesystemRepositoryOperationAborted(
      pendingCapture.controller.signal,
      'read-file',
      target.file.path,
    );

    commitReservedFilesystemFileCapture(
      state,
      target.file.path,
      capturedBytes,
      pendingCapture.reservation,
    );
    completion.resolve();
  } catch (cause) {
    if (isFilesystemSnapshotChangedException(cause)) {
      markFilesystemRepositoryReaderInvalidated(state, cause);
    }

    completion.reject(normalizeFilesystemFileCaptureFailure(cause, target.file.path));
  } finally {
    if (state.captures.capturesByPath.get(target.file.path) === pendingCapture) {
      state.captures.capturesByPath.delete(target.file.path);
    }

    releaseFilesystemFileCaptureCapacity(state, pendingCapture.reservation);
  }
};

/**
 * Registers one capture and its capacity claim before starting asynchronous host work.
 * @param state The shared reader state owning the capture.
 * @param target The frozen file and directory identity chain.
 * @param checkpoints Optional deterministic integration-test checkpoints.
 * @returns The pending authoritative capture record.
 */
const createPendingFilesystemFileCapture = (
  state: IFilesystemRepositoryReaderState,
  target: IFilesystemFileCaptureTarget,
  checkpoints?: IFilesystemFileCaptureCheckpoints,
): IFilesystemRepositoryPendingFileCapture => {
  const completion = createFilesystemFileCaptureCompletion();
  const pendingCapture: IFilesystemRepositoryPendingFileCapture = {
    controller: new AbortController(),
    isAcceptingWaiters: true,
    promise: completion.promise,
    reservation: reserveFilesystemFileCaptureCapacity(state, target.file.fingerprint.size),
    waiterCount: 0,
  };

  state.captures.capturesByPath.set(target.file.path, pendingCapture);

  // retain an unconditional rejection observer when every caller detaches early
  void pendingCapture.promise.catch(() => undefined);
  void runFilesystemFileCapture(state, target, pendingCapture, completion, checkpoints);

  return pendingCapture;
};

/**
 * Waits for an abandoned capture to release its host resources without joining its result.
 * @param pendingCapture The non-joinable capture being cleaned up.
 * @param signal Optional cancellation for the new operation waiting to retry.
 * @param path The frozen logical file path.
 * @returns A promise resolving when cleanup completes.
 * @throws
 * - ABORTED: The repository operation was aborted.
 */
const waitForAbandonedFilesystemFileCapture = async (
  pendingCapture: IFilesystemRepositoryPendingFileCapture,
  signal: AbortSignal | undefined,
  path: IRepositoryPath,
): Promise<void> => {
  throwIfFilesystemRepositoryOperationAborted(signal, 'read-file', path);

  await new Promise<void>((resolve, reject) => {
    let isSettled = false;

    const settle = (failure?: Error): void => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      signal?.removeEventListener('abort', handleAbort);

      if (failure === undefined) {
        resolve();
      } else {
        reject(failure);
      }
    };
    const handleAbort = (): void => {
      try {
        throwIfFilesystemRepositoryOperationAborted(signal, 'read-file', path);
      } catch (cause) {
        settle(normalizeFilesystemFileCaptureFailure(cause, path));
      }
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
    void pendingCapture.promise.then(
      () => settle(),
      () => settle(),
    );
  });
};

/**
 * Awaits one shared capture as an independently cancellable caller.
 * @param state The shared reader state owning the capture.
 * @param pendingCapture The authoritative capture to join.
 * @param signal Optional caller-owned cancellation.
 * @param path The frozen logical file path.
 * @returns A promise resolving when the shared capture commits.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - RESOURCE_LIMIT_EXCEEDED: A repository reading resource limit was exceeded.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
const waitForFilesystemFileCapture = async (
  state: IFilesystemRepositoryReaderState,
  pendingCapture: IFilesystemRepositoryPendingFileCapture,
  signal: AbortSignal | undefined,
  path: IRepositoryPath,
): Promise<void> => {
  throwIfFilesystemRepositoryOperationAborted(signal, 'read-file', path);
  pendingCapture.waiterCount += 1;

  await new Promise<void>((resolve, reject) => {
    let isAttached = true;
    let isSettled = false;

    const detachWaiter = (): void => {
      if (!isAttached) {
        return;
      }

      isAttached = false;
      pendingCapture.waiterCount -= 1;
    };
    const settle = (failure?: Error): void => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      detachWaiter();
      signal?.removeEventListener('abort', handleAbort);

      if (failure === undefined) {
        resolve();
      } else {
        reject(failure);
      }
    };
    const settleFromCapture = (failure?: unknown): void => {
      if (failure !== undefined && isFilesystemSnapshotChangedException(failure)) {
        settle(normalizeFilesystemFileCaptureFailure(failure, path));
        return;
      }

      try {
        throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', path);
        throwIfFilesystemRepositoryOperationAborted(signal, 'read-file', path);
      } catch (cause) {
        settle(normalizeFilesystemFileCaptureFailure(cause, path));
        return;
      }

      settle(
        failure === undefined ? undefined : normalizeFilesystemFileCaptureFailure(failure, path),
      );
    };
    const handleAbort = (): void => {
      if (isSettled || state.lifecycle.isInvalidated) {
        return;
      }

      if (pendingCapture.waiterCount > 1) {
        try {
          throwIfFilesystemRepositoryOperationAborted(signal, 'read-file', path);
        } catch (cause) {
          settle(normalizeFilesystemFileCaptureFailure(cause, path));
        }

        return;
      }

      pendingCapture.isAcceptingWaiters = false;
      pendingCapture.controller.abort(signal?.reason);
    };

    signal?.addEventListener('abort', handleAbort, { once: true });
    void pendingCapture.promise.then(
      () => settleFromCapture(),
      (cause: unknown) => settleFromCapture(cause),
    );
  });
};

/**
 * Coordinates one logical read through a per-path authoritative capture.
 * @param state The shared reader state owning cache and active captures.
 * @param target The frozen file and directory identity chain.
 * @param signal Optional caller-owned cancellation.
 * @param checkpoints Optional deterministic integration-test checkpoints.
 * @returns A promise resolving to fresh caller-owned bytes.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - RESOURCE_LIMIT_EXCEEDED: A repository reading resource limit was exceeded.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
export const coordinateFilesystemRepositoryFileCapture = async (
  state: IFilesystemRepositoryReaderState,
  target: IFilesystemFileCaptureTarget,
  signal?: AbortSignal,
  checkpoints?: IFilesystemFileCaptureCheckpoints,
): Promise<Uint8Array> => {
  while (true) {
    throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);
    throwIfFilesystemRepositoryOperationAborted(signal, 'read-file', target.file.path);

    const cachedBytes = copyCachedFilesystemFile(state.cache, target.file.path);

    if (cachedBytes !== undefined) {
      throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', target.file.path);
      throwIfFilesystemRepositoryOperationAborted(signal, 'read-file', target.file.path);

      return cachedBytes;
    }

    const currentCapture = state.captures.capturesByPath.get(target.file.path);

    if (currentCapture?.isAcceptingWaiters === false) {
      await waitForAbandonedFilesystemFileCapture(currentCapture, signal, target.file.path);
      continue;
    }

    const pendingCapture =
      currentCapture ?? createPendingFilesystemFileCapture(state, target, checkpoints);

    await waitForFilesystemFileCapture(state, pendingCapture, signal, target.file.path);
  }
};
