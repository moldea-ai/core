import {
  REPOSITORY_ROOT,
  RepositorySourceException,
  isRepositoryPath,
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryListOptions,
  type IRepositoryOperation,
  type IRepositoryOperationOptions,
  type IRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';

import type { ICoreResourceLimits } from './contracts.js';
import { CoreOperationException } from './exceptions.js';

const MANIFEST_PATH = parseRepositoryPath('/moldea/moldea.yaml');

type IInspectionFileByteLimit = 'maxFileBytes' | 'maxManifestBytes';

// private operation state shared by every reader consumer during one inspection
export interface IRepositoryInspectionSession {
  readonly reader: IRepositoryReader;

  /**
   * Stops work at an inspection boundary when cancellation was requested.
   * @throws
   * - ABORTED: Repository inspection was aborted.
   */
  throwIfAborted(): void;
}

const invalidSourceData = (
  operation: IRepositoryOperation,
  path: IRepositoryPath | null,
): never => {
  throw new RepositorySourceException({
    code: 'INVALID_SOURCE_DATA',
    operation,
    path,
    retryable: false,
  });
};

const copyReaderEntry = (
  candidate: unknown,
  operation: 'get-entry' | 'list-entries',
  fallbackPath: IRepositoryPath,
  expectedPath?: IRepositoryPath,
): IRepositoryEntry => {
  if (typeof candidate !== 'object' || candidate === null) {
    return invalidSourceData(operation, fallbackPath);
  }

  const record = candidate as Readonly<Record<string, unknown>>;
  const pathCandidate = record['path'];
  const typeCandidate = record['type'];

  if (typeof pathCandidate !== 'string' || !isRepositoryPath(pathCandidate)) {
    return invalidSourceData(operation, fallbackPath);
  }

  const path = parseRepositoryPath(pathCandidate);

  if (expectedPath !== undefined && path !== expectedPath) {
    return invalidSourceData(operation, path);
  }

  if (typeCandidate !== 'file' && typeCandidate !== 'directory' && typeCandidate !== 'symlink') {
    return invalidSourceData(operation, path);
  }

  return { path, type: typeCandidate };
};

const isStrictDescendant = (path: IRepositoryPath, prefix: IRepositoryPath): boolean => {
  if (path === prefix) {
    return false;
  }

  const descendantPrefix = prefix === REPOSITORY_ROOT ? REPOSITORY_ROOT : `${prefix}/`;
  return path.startsWith(descendantPrefix);
};

const throwResourceLimitExceeded = (limit: keyof ICoreResourceLimits): never => {
  throw new CoreOperationException({
    code: 'RESOURCE_LIMIT_EXCEEDED',
    limit,
    operation: 'inspect-project',
    retryable: false,
  });
};

const createSourceOptions = (
  sessionSignal: AbortSignal | undefined,
  operationSignal: AbortSignal | undefined,
): IRepositoryOperationOptions | undefined => {
  const signal = sessionSignal ?? operationSignal;
  return signal === undefined ? undefined : { signal };
};

/**
 * Creates the isolated reader state for one repository inspection.
 * @param repository The source-neutral reader bound to one coherent snapshot.
 * @param limits The immutable resource limits for the inspection.
 * @param signal Optional cancellation shared by every inspection operation.
 * @returns A frozen session whose reader owns inspection-local budgets and byte caching.
 * @throws
 * - ABORTED: Repository inspection was aborted before the session was created.
 */
export const createRepositoryInspectionSession = (
  repository: IRepositoryReader,
  limits: ICoreResourceLimits,
  signal?: AbortSignal,
): IRepositoryInspectionSession => {
  const readCache = new Map<IRepositoryPath, Promise<Uint8Array>>();
  let entryCount = 0;
  let totalBytesRead = 0;

  const createAbortedException = (abortedSignal: AbortSignal): CoreOperationException => {
    return new CoreOperationException({
      cause: abortedSignal.reason,
      code: 'ABORTED',
      operation: 'inspect-project',
      retryable: false,
    });
  };

  const throwIfSignalAborted = (operationSignal?: AbortSignal): void => {
    const abortedSignal = signal?.aborted
      ? signal
      : operationSignal?.aborted
        ? operationSignal
        : null;

    if (abortedSignal === null) {
      return;
    }

    throw createAbortedException(abortedSignal);
  };

  throwIfSignalAborted();

  const getEntry = async (
    path: IRepositoryPath,
    options?: IRepositoryOperationOptions,
  ): Promise<IRepositoryEntry | null> => {
    const parsedPath = parseRepositoryPath(path);
    throwIfSignalAborted(options?.signal);

    const candidate = await repository.getEntry(
      parsedPath,
      createSourceOptions(signal, options?.signal),
    );
    throwIfSignalAborted(options?.signal);

    return candidate === null
      ? null
      : copyReaderEntry(candidate, 'get-entry', parsedPath, parsedPath);
  };

  const listEntries = (options?: IRepositoryListOptions): AsyncIterable<IRepositoryEntry> => {
    const prefix =
      options?.prefix === undefined ? REPOSITORY_ROOT : parseRepositoryPath(options.prefix);

    return {
      async *[Symbol.asyncIterator](): AsyncIterator<IRepositoryEntry> {
        throwIfSignalAborted(options?.signal);
        const seenPaths = new Set<IRepositoryPath>();
        const sourceOptions = createSourceOptions(signal, options?.signal);
        const sourceListOptions =
          sourceOptions === undefined ? { prefix } : { prefix, ...sourceOptions };

        for await (const candidate of repository.listEntries(sourceListOptions)) {
          throwIfSignalAborted(options?.signal);
          entryCount += 1;

          if (entryCount > limits.maxEntries) {
            return throwResourceLimitExceeded('maxEntries');
          }

          const entry = copyReaderEntry(candidate, 'list-entries', prefix);

          if (!isStrictDescendant(entry.path, prefix) || seenPaths.has(entry.path)) {
            return invalidSourceData('list-entries', entry.path);
          }

          seenPaths.add(entry.path);
          yield entry;
        }

        throwIfSignalAborted(options?.signal);
      },
    };
  };

  const loadFile = async (path: IRepositoryPath): Promise<Uint8Array> => {
    const content = await repository.readFile(path, createSourceOptions(signal, undefined));
    throwIfSignalAborted();

    if (!(content instanceof Uint8Array)) {
      return invalidSourceData('read-file', path);
    }

    const fileLimit: IInspectionFileByteLimit =
      path === MANIFEST_PATH ? 'maxManifestBytes' : 'maxFileBytes';

    if (content.byteLength > limits[fileLimit]) {
      return throwResourceLimitExceeded(fileLimit);
    }

    if (totalBytesRead + content.byteLength > limits.maxTotalBytesRead) {
      return throwResourceLimitExceeded('maxTotalBytesRead');
    }

    totalBytesRead += content.byteLength;
    return new Uint8Array(content);
  };

  const removeFailedRead = async (
    path: IRepositoryPath,
    readPromise: Promise<Uint8Array>,
  ): Promise<Uint8Array> => {
    try {
      return await readPromise;
    } catch (error: unknown) {
      readCache.delete(path);
      throw error;
    }
  };

  const waitForRead = (
    readPromise: Promise<Uint8Array>,
    operationSignal: AbortSignal | undefined,
  ): Promise<Uint8Array> => {
    throwIfSignalAborted(operationSignal);

    if (operationSignal === undefined || operationSignal === signal) {
      return readPromise;
    }

    let handleAbort!: () => void;
    const cancellationPromise = new Promise<never>((resolve, reject) => {
      void resolve;
      handleAbort = () => {
        const abortedSignal = signal?.aborted ? signal : operationSignal;
        reject(createAbortedException(abortedSignal));
      };

      operationSignal.addEventListener('abort', handleAbort, { once: true });
      if (operationSignal.aborted) {
        handleAbort();
      }
    });

    return Promise.race([readPromise, cancellationPromise]).finally(() => {
      operationSignal.removeEventListener('abort', handleAbort);
    });
  };

  const readFile = async (
    path: IRepositoryPath,
    options?: IRepositoryOperationOptions,
  ): Promise<Uint8Array> => {
    const parsedPath = parseRepositoryPath(path);
    throwIfSignalAborted(options?.signal);

    let readPromise = readCache.get(parsedPath);

    if (readPromise === undefined) {
      readPromise = removeFailedRead(parsedPath, loadFile(parsedPath));
      readCache.set(parsedPath, readPromise);
    }

    const content = await waitForRead(readPromise, options?.signal);
    throwIfSignalAborted(options?.signal);

    return new Uint8Array(content);
  };

  const reader: IRepositoryReader = Object.freeze({ getEntry, listEntries, readFile });

  return Object.freeze({
    reader,
    throwIfAborted: throwIfSignalAborted,
  });
};
