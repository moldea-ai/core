import {
  REPOSITORY_ROOT,
  RepositorySourceException,
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryListOptions,
  type IRepositoryOperationOptions,
  type IRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';

import { GitContentTransformUnsupportedException } from './exception.js';

/** Throws the common cancellation contract for one guard-owned read step. */
const throwIfAborted = (signal: AbortSignal | undefined, path: IRepositoryPath): void => {
  if (!signal?.aborted) {
    return;
  }

  throw new RepositorySourceException({
    cause: signal.reason,
    code: 'ABORTED',
    operation: 'read-file',
    path,
    retryable: false,
  });
};

/** Creates the common failure for contradictory underlying lookup data. */
const createInvalidSourceException = (path: IRepositoryPath): RepositorySourceException =>
  new RepositorySourceException({
    code: 'INVALID_SOURCE_DATA',
    operation: 'read-file',
    path,
    retryable: false,
  });

// immutable guarded-read view over one coherent logical repository reader
class GitContentTransformationGuardRepositoryReader implements IRepositoryReader {
  readonly #guardedPaths: ReadonlySet<IRepositoryPath>;

  readonly #reader: IRepositoryReader;

  public constructor(reader: IRepositoryReader, guardedPaths: ReadonlySet<IRepositoryPath>) {
    this.#reader = reader;
    this.#guardedPaths = guardedPaths;
  }

  /**
   * Looks up an entry without changing the underlying logical inventory.
   * @param path The validated repository path to inspect.
   * @param options Optional cancellation controls.
   * @returns A promise resolving to the underlying detached entry or confirmed absence.
   * @throws
   * - INVALID_REPOSITORY_PATH: The repository path is invalid.
   * - ACCESS_DENIED: Access to the repository source was denied.
   * - SOURCE_UNAVAILABLE: The repository source is unavailable.
   * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
   * - INVALID_SOURCE_DATA: The repository source returned invalid data.
   * - RESOURCE_LIMIT_EXCEEDED: A repository reading resource limit was exceeded.
   * - ABORTED: The repository operation was aborted.
   */
  public getEntry(
    path: IRepositoryPath,
    options?: IRepositoryOperationOptions,
  ): Promise<IRepositoryEntry | null> {
    return this.#reader.getEntry(path, options);
  }

  /**
   * Reads ordinary files while refusing guarded logical regular-file bytes.
   * @param path The validated repository file path to read.
   * @param options Optional cancellation controls.
   * @returns A promise resolving to fresh bytes for an unguarded regular file.
   * @throws
   * - INVALID_REPOSITORY_PATH: The repository path is invalid.
   * - ENTRY_NOT_FOUND: The requested repository entry was not found.
   * - ENTRY_NOT_FILE: The requested repository entry is not a file.
   * - ACCESS_DENIED: Access to the repository source was denied.
   * - SOURCE_UNAVAILABLE: The repository source is unavailable or its regular file uses an unsupported Git content transformation.
   * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
   * - INVALID_SOURCE_DATA: The repository source returned invalid data.
   * - RESOURCE_LIMIT_EXCEEDED: A repository reading resource limit was exceeded.
   * - ABORTED: The repository operation was aborted.
   */
  public async readFile(
    path: IRepositoryPath,
    options?: IRepositoryOperationOptions,
  ): Promise<Uint8Array> {
    const parsedPath = parseRepositoryPath(path);

    if (!this.#guardedPaths.has(parsedPath)) {
      return this.#reader.readFile(parsedPath, options);
    }

    throwIfAborted(options?.signal, parsedPath);

    const entry = await this.#reader.getEntry(parsedPath, options);

    throwIfAborted(options?.signal, parsedPath);

    if (
      entry !== null &&
      (entry.path !== parsedPath ||
        (entry.type !== 'file' && entry.type !== 'directory' && entry.type !== 'symlink'))
    ) {
      throw createInvalidSourceException(parsedPath);
    }

    if (entry?.type !== 'file') {
      return this.#reader.readFile(parsedPath, options);
    }

    throw new GitContentTransformUnsupportedException(parsedPath);
  }

  /**
   * Recursively lists entries without changing the underlying logical inventory.
   * @param options Optional prefix and cancellation controls.
   * @returns The underlying async iterable of detached repository entries.
   * @throws
   * - INVALID_REPOSITORY_PATH: The repository path is invalid.
   * - ENTRY_NOT_FOUND: The requested repository entry was not found.
   * - ENTRY_NOT_DIRECTORY: The requested repository entry is not a directory.
   * - ACCESS_DENIED: Access to the repository source was denied.
   * - SOURCE_UNAVAILABLE: The repository source is unavailable.
   * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
   * - INVALID_SOURCE_DATA: The repository source returned invalid data.
   * - RESOURCE_LIMIT_EXCEEDED: A repository reading resource limit was exceeded.
   * - ABORTED: The repository operation was aborted.
   */
  public listEntries(options?: IRepositoryListOptions): AsyncIterable<IRepositoryEntry> {
    return this.#reader.listEntries(options);
  }
}

/**
 * Creates an immutable reader that blocks bytes for Git transform-guarded logical files.
 * @param reader The coherent reader after logical Git entry-type overlays are applied.
 * @param guardedPaths The paths whose working-tree bytes may differ from Git content.
 * @returns A reader preserving inventory semantics while refusing guarded regular-file reads.
 * @throws
 * - INVALID_REPOSITORY_PATH: A guarded repository path is invalid.
 * - INVALID_SOURCE_DATA: The repository root was supplied as a guarded file path.
 */
export const createGitContentTransformationGuardRepositoryReader = (
  reader: IRepositoryReader,
  guardedPaths: readonly IRepositoryPath[],
): IRepositoryReader => {
  const parsedGuardedPaths = new Set<IRepositoryPath>();

  for (const guardedPath of guardedPaths) {
    const parsedPath = parseRepositoryPath(guardedPath);

    if (parsedPath === REPOSITORY_ROOT) {
      throw new RepositorySourceException({
        code: 'INVALID_SOURCE_DATA',
        operation: 'create-reader',
        path: parsedPath,
        retryable: false,
      });
    }

    parsedGuardedPaths.add(parsedPath);
  }

  return Object.freeze(
    new GitContentTransformationGuardRepositoryReader(reader, parsedGuardedPaths),
  );
};
