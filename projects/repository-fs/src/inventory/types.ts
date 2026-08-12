import type { IRepositoryEntryType, IRepositoryPath } from '@moldea.ai/repository';

// private no-follow filesystem observation for one logical inventory path
export interface IFilesystemInventoryEntry {
  readonly hostPath: string;
  readonly path: IRepositoryPath;
  readonly type: IRepositoryEntryType;
}

// private root-inclusive inventory retained for fingerprint and reader phases
export interface IFilesystemInventory {
  readonly entries: readonly IFilesystemInventoryEntry[];
}
