import {
  RepositorySourceException,
  parseRepositoryPath,
  type IRepositoryOperationOptions,
  type IRepositoryPath,
} from '@moldea.ai/repository';

import {
  invalidateFilesystemRepositoryReader,
  throwIfFilesystemRepositoryReaderInvalidated,
  type IFilesystemRepositoryReaderState,
} from '../reader-state/index.js';
import {
  throwFilesystemRepositoryOperationException,
  throwIfFilesystemRepositoryOperationAborted,
} from '../source-exception/index.js';
import { captureFilesystemRepositoryFile } from './capture.js';
import type { IFilesystemFileCaptureCheckpoints } from './types.js';
import {
  commitFilesystemFileCapture,
  copyCachedFilesystemFile,
  createFilesystemFileCaptureTarget,
  getMaximumFilesystemFileCaptureBytes,
} from './utilities.js';

/**
 * Reads exact caller-owned bytes from the frozen filesystem inventory and private cache.
 * @param state The verified inventory, limits, and private cache for one future reader.
 * @param path The validated repository-root logical file path to read.
 * @param options Optional operation cancellation.
 * @param checkpoints Optional deterministic integration-test checkpoints.
 * @returns A promise resolving to a fresh byte array.
 * @throws
 * - INVALID_REPOSITORY_PATH: The repository path is invalid.
 * - ENTRY_NOT_FOUND: The requested repository entry was not found.
 * - ENTRY_NOT_FILE: The requested repository entry is not a file.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - RESOURCE_LIMIT_EXCEEDED: A repository reading resource limit was exceeded.
 * - ABORTED: The repository operation was aborted.
 */
export const readFilesystemRepositoryFile = async (
  state: IFilesystemRepositoryReaderState,
  path: IRepositoryPath,
  options?: IRepositoryOperationOptions,
  checkpoints?: IFilesystemFileCaptureCheckpoints,
): Promise<Uint8Array> => {
  const parsedPath = parseRepositoryPath(path);

  await Promise.resolve();
  throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', parsedPath);
  throwIfFilesystemRepositoryOperationAborted(options?.signal, 'read-file', parsedPath);

  const entry = state.entriesByPath.get(parsedPath);

  if (entry === undefined) {
    return throwFilesystemRepositoryOperationException(
      'ENTRY_NOT_FOUND',
      'read-file',
      false,
      parsedPath,
    );
  }

  if (entry.type !== 'file') {
    return throwFilesystemRepositoryOperationException(
      'ENTRY_NOT_FILE',
      'read-file',
      false,
      parsedPath,
    );
  }

  const cachedBytes = copyCachedFilesystemFile(state.cache, parsedPath);

  if (cachedBytes !== undefined) {
    throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', parsedPath);
    throwIfFilesystemRepositoryOperationAborted(options?.signal, 'read-file', parsedPath);

    return cachedBytes;
  }

  const target = createFilesystemFileCaptureTarget(state.entriesByPath, entry);
  const maximumByteLength = getMaximumFilesystemFileCaptureBytes(
    state.cache,
    state.limits.maxFileBytes,
    state.limits.maxCachedBytes,
  );
  let capturedBytes: Uint8Array;

  try {
    capturedBytes = await captureFilesystemRepositoryFile(
      state,
      target,
      maximumByteLength,
      options?.signal,
      checkpoints,
    );
  } catch (cause) {
    if (cause instanceof RepositorySourceException) {
      if (cause.code === 'SNAPSHOT_CHANGED') {
        return invalidateFilesystemRepositoryReader(state, 'read-file', parsedPath, cause);
      }

      throw cause;
    }

    return throwFilesystemRepositoryOperationException(
      'SOURCE_UNAVAILABLE',
      'read-file',
      true,
      parsedPath,
      cause,
    );
  }

  throwIfFilesystemRepositoryReaderInvalidated(state, 'read-file', parsedPath);
  throwIfFilesystemRepositoryOperationAborted(options?.signal, 'read-file', parsedPath);

  return commitFilesystemFileCapture(
    state.cache,
    parsedPath,
    capturedBytes,
    state.limits.maxCachedBytes,
  );
};
