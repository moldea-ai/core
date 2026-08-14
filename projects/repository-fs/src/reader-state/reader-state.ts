import type { IRepositoryPath } from '@moldea.ai/repository';

import {
  createFilesystemInventoryEntriesByPath,
  type IFilesystemInventory,
} from '../inventory/index.js';
import type { IPreparedFilesystemRepositoryRoot } from '../root/index.js';
import { throwFilesystemRepositoryOperationException } from '../source-exception/index.js';
import type {
  IFilesystemRepositoryReaderOperation,
  IFilesystemRepositoryReaderState,
} from './types.js';

/**
 * Creates the authoritative private state shared by every future reader operation.
 * @param preparedRoot The fixed root and detached resource limits.
 * @param inventory The verified root-inclusive filesystem inventory.
 * @returns Frozen operation context containing private mutable lifecycle and cache state.
 */
export const createFilesystemRepositoryReaderState = (
  preparedRoot: IPreparedFilesystemRepositoryRoot,
  inventory: IFilesystemInventory,
): IFilesystemRepositoryReaderState => {
  return Object.freeze({
    cache: {
      cachedByteCount: 0,
      filesByPath: new Map<IRepositoryPath, Uint8Array>(),
    },
    captures: {
      capturesByPath: new Map(),
      reservedByteCount: 0,
    },
    entriesByPath: createFilesystemInventoryEntriesByPath(inventory),
    inventory,
    lifecycle: {
      invalidationCause: undefined,
      isInvalidated: false,
    },
    limits: preparedRoot.options.limits,
  });
};

/**
 * Stops an operation when a previous snapshot loss permanently invalidated its reader.
 * @param state The shared reader state to inspect.
 * @param operation The current operation requesting access.
 * @param path The safe logical path affected by the current operation.
 * @throws
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 */
export const throwIfFilesystemRepositoryReaderInvalidated = (
  state: IFilesystemRepositoryReaderState,
  operation: IFilesystemRepositoryReaderOperation,
  path: IRepositoryPath,
): void => {
  if (state.lifecycle.isInvalidated) {
    throwFilesystemRepositoryOperationException(
      'SNAPSHOT_CHANGED',
      operation,
      true,
      path,
      state.lifecycle.invalidationCause,
    );
  }
};

/**
 * Marks one reader invalid and synchronously disposes every cached byte.
 * @param state The shared reader state to invalidate.
 * @param cause The private first snapshot-loss cause.
 */
export const markFilesystemRepositoryReaderInvalidated = (
  state: IFilesystemRepositoryReaderState,
  cause?: unknown,
): void => {
  if (state.lifecycle.isInvalidated) {
    return;
  }

  state.lifecycle.isInvalidated = true;
  state.lifecycle.invalidationCause = cause;

  for (const pendingCapture of state.captures.capturesByPath.values()) {
    pendingCapture.isAcceptingWaiters = false;
    pendingCapture.reservation.isReleased = true;
    pendingCapture.controller.abort(cause);
  }

  state.captures.capturesByPath.clear();
  state.captures.reservedByteCount = 0;
  state.cache.filesByPath.clear();
  state.cache.cachedByteCount = 0;
};

/**
 * Permanently invalidates one reader, disposes cached bytes, and fails the current operation.
 * @param state The shared reader state to invalidate.
 * @param operation The operation that detected or observed snapshot loss.
 * @param path The safe logical path affected by the operation.
 * @param cause The private first snapshot-loss cause.
 * @throws
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 */
export const invalidateFilesystemRepositoryReader = (
  state: IFilesystemRepositoryReaderState,
  operation: IFilesystemRepositoryReaderOperation,
  path: IRepositoryPath,
  cause?: unknown,
): never => {
  markFilesystemRepositoryReaderInvalidated(state, cause);

  return throwFilesystemRepositoryOperationException(
    'SNAPSHOT_CHANGED',
    operation,
    true,
    path,
    state.lifecycle.invalidationCause,
  );
};
