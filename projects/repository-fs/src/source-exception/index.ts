import {
  RepositorySourceException,
  type IRepositoryOperation,
  type IRepositoryPath,
  type IRepositorySourceErrorCode,
} from '@moldea.ai/repository';

type IFilesystemRepositoryOperation = Exclude<IRepositoryOperation, 'create-reader'>;

/**
 * Throws one safe common exception for filesystem-reader creation.
 * @param code The stable common source-error code.
 * @param retryable Whether a fresh operation may succeed without caller changes.
 * @param path The nearest safe logical repository path, when available.
 * @param cause The private underlying failure retained outside enumerable fields.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - ENTRY_NOT_DIRECTORY: The requested repository entry is not a directory.
 * - ENTRY_NOT_FILE: The requested repository entry is not a file.
 * - ENTRY_NOT_FOUND: The requested repository entry was not found.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - RESOURCE_LIMIT_EXCEEDED: A repository reading resource limit was exceeded.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
export const throwFilesystemRepositoryCreationException = (
  code: IRepositorySourceErrorCode,
  retryable: boolean,
  path: IRepositoryPath | null,
  cause?: unknown,
): never => {
  throw new RepositorySourceException({
    cause,
    code,
    operation: 'create-reader',
    path,
    retryable,
  });
};

/**
 * Stops reader creation when its live cancellation signal is aborted.
 * @param signal The optional caller-owned cancellation signal.
 * @param path The nearest safe logical repository path, when available.
 * @throws
 * - ABORTED: The repository operation was aborted.
 */
export const throwIfFilesystemRepositoryCreationAborted = (
  signal: AbortSignal | undefined,
  path: IRepositoryPath | null = null,
): void => {
  if (signal?.aborted === true) {
    throwFilesystemRepositoryCreationException('ABORTED', true, path, signal.reason);
  }
};

/**
 * Throws one safe common exception for an operation on a filesystem reader.
 * @param code The stable common source-error code.
 * @param operation The reader operation that failed.
 * @param retryable Whether a fresh operation may succeed without caller changes.
 * @param path The safe logical repository path affected by the operation.
 * @param cause The private underlying failure retained outside enumerable fields.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - ENTRY_NOT_DIRECTORY: The requested repository entry is not a directory.
 * - ENTRY_NOT_FILE: The requested repository entry is not a file.
 * - ENTRY_NOT_FOUND: The requested repository entry was not found.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - RESOURCE_LIMIT_EXCEEDED: A repository reading resource limit was exceeded.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
export const throwFilesystemRepositoryOperationException = (
  code: IRepositorySourceErrorCode,
  operation: IFilesystemRepositoryOperation,
  retryable: boolean,
  path: IRepositoryPath,
  cause?: unknown,
): never => {
  throw new RepositorySourceException({ cause, code, operation, path, retryable });
};

/**
 * Stops a filesystem reader operation when its cancellation signal is aborted.
 * @param signal The optional caller-owned cancellation signal.
 * @param operation The reader operation being performed.
 * @param path The safe logical repository path affected by the operation.
 * @throws
 * - ABORTED: The repository operation was aborted.
 */
export const throwIfFilesystemRepositoryOperationAborted = (
  signal: AbortSignal | undefined,
  operation: IFilesystemRepositoryOperation,
  path: IRepositoryPath,
): void => {
  if (signal?.aborted === true) {
    throwFilesystemRepositoryOperationException('ABORTED', operation, false, path, signal.reason);
  }
};

/**
 * Reads a Node.js error code without trusting an unknown failure shape.
 * @param cause The unknown caught failure.
 * @returns The string error code when one is safely available.
 */
export const getNodeErrorCode = (cause: unknown): string | undefined => {
  if (typeof cause !== 'object' || cause === null) {
    return undefined;
  }

  try {
    if (!('code' in cause)) {
      return undefined;
    }

    const errorCode: unknown = cause.code;

    return typeof errorCode === 'string' ? errorCode : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Maps a host failure after its logical filesystem entry has already been observed.
 * @param cause The unknown host filesystem failure.
 * @param path The safe logical path affected by the contradictory or unavailable observation.
 * @throws
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
export const throwObservedFilesystemRepositoryCreationError = (
  cause: unknown,
  path: IRepositoryPath | null,
): never => {
  const errorCode = getNodeErrorCode(cause);

  if (errorCode === 'ENOENT' || errorCode === 'ENOTDIR') {
    return throwFilesystemRepositoryCreationException('SNAPSHOT_CHANGED', true, path, cause);
  }

  if (errorCode === 'EACCES' || errorCode === 'EPERM') {
    return throwFilesystemRepositoryCreationException('ACCESS_DENIED', true, path, cause);
  }

  return throwFilesystemRepositoryCreationException('SOURCE_UNAVAILABLE', true, path, cause);
};
