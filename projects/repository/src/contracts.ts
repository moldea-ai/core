import type { IRepositoryPath } from './repository-path.js';

export type IRepositoryEntryType = 'file' | 'directory' | 'symlink';

export interface IRepositoryEntry {
  readonly path: IRepositoryPath;
  readonly type: IRepositoryEntryType;
}

export interface IRepositoryOperationOptions {
  readonly signal?: AbortSignal;
}

export interface IRepositoryListOptions extends IRepositoryOperationOptions {
  readonly prefix?: IRepositoryPath;
}

export interface IRepositoryReader {
  getEntry(
    path: IRepositoryPath,
    options?: IRepositoryOperationOptions,
  ): Promise<IRepositoryEntry | null>;

  readFile(path: IRepositoryPath, options?: IRepositoryOperationOptions): Promise<Uint8Array>;

  listEntries(options?: IRepositoryListOptions): AsyncIterable<IRepositoryEntry>;
}
