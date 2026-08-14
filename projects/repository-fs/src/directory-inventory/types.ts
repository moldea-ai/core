import type { IRepositoryPath } from '@moldea.ai/repository';

// one representable non-control child prepared for deterministic traversal
export interface IFilesystemDirectoryEntryCandidate {
  readonly hostName: string;
  readonly path: IRepositoryPath;
}
