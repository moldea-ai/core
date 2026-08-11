import type { IRepositoryPath } from '@moldea.ai/repository';

// exact logical paths selected for the filesystem snapshot
export interface IFilesystemRepositoryPathSelection {
  readonly kind: 'paths';
  readonly paths: readonly IRepositoryPath[];
}

// complete recursive filesystem-directory selection
export interface IFilesystemRepositoryDirectorySelection {
  readonly kind: 'directory';
}

// explicit version 1 filesystem selection strategies
export type IFilesystemRepositorySelection =
  IFilesystemRepositoryPathSelection | IFilesystemRepositoryDirectorySelection;

// independent resource limits enforced by the filesystem reader
export interface IFilesystemRepositoryResourceLimits {
  readonly maxEntries: number;
  readonly maxFileBytes: number;
  readonly maxCachedBytes: number;
}

// caller-owned configuration for one filesystem reader snapshot
export interface IFilesystemRepositoryReaderOptions {
  readonly rootDirectory: string;
  readonly selection: IFilesystemRepositorySelection;
  readonly limits?: Partial<IFilesystemRepositoryResourceLimits>;
  readonly signal?: AbortSignal;
}
