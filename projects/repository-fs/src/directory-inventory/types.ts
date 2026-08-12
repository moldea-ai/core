import type { IRepositoryPath } from '@moldea.ai/repository';

// one representable non-control child prepared for deterministic traversal
export interface IFilesystemDirectoryEntryCandidate {
  readonly hostName: string;
  readonly path: IRepositoryPath;
}

// stable directory identity fields used to prevent traversal aliases
export interface IFilesystemDirectoryIdentity {
  readonly device: bigint;
  readonly inode: bigint;
}
