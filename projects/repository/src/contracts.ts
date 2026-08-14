import type { IRepositoryPath } from './repository-path.js';

// repository entry contracts exposed by every reader implementation
export type IRepositoryEntryType = 'file' | 'directory' | 'symlink';

export interface IRepositoryEntry {
  readonly path: IRepositoryPath;
  readonly type: IRepositoryEntryType;
}

// cancellation and listing options shared by repository operations
export interface IRepositoryOperationOptions {
  readonly signal?: AbortSignal;
}

export interface IRepositoryListOptions extends IRepositoryOperationOptions {
  readonly prefix?: IRepositoryPath;
}

// source-neutral access to one coherent, read-only repository snapshot
export interface IRepositoryReader {
  /**
   * Looks up an entry at an exact logical path without following symlinks.
   * @param path The validated repository-root logical path to inspect.
   * @param options Optional cancellation controls.
   * @returns A promise resolving to the detached entry or `null` when it is confirmed absent.
   * @throws
   * - INVALID_REPOSITORY_PATH: The repository path is invalid.
   * - ACCESS_DENIED: Access to the repository source was denied.
   * - SOURCE_UNAVAILABLE: The repository source is unavailable.
   * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
   * - INVALID_SOURCE_DATA: The repository source returned invalid data.
   * - RESOURCE_LIMIT_EXCEEDED: A repository reading resource limit was exceeded.
   * - ABORTED: The repository operation was aborted.
   */
  getEntry(
    path: IRepositoryPath,
    options?: IRepositoryOperationOptions,
  ): Promise<IRepositoryEntry | null>;

  /**
   * Reads exact caller-owned bytes for one regular file without following symlinks.
   * @param path The validated repository-root logical file path to read.
   * @param options Optional cancellation controls.
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
  readFile(path: IRepositoryPath, options?: IRepositoryOperationOptions): Promise<Uint8Array>;

  /**
   * Recursively enumerates detached descendants of one logical directory.
   * @param options Optional prefix and cancellation controls.
   * @returns An async iterable whose yielded order has no contract meaning.
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
  listEntries(options?: IRepositoryListOptions): AsyncIterable<IRepositoryEntry>;
}
