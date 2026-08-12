import type { IRepositoryEntryType, IRepositoryPath } from '@moldea.ai/repository';

import type {
  IFilesystemDirectoryIdentity,
  IFilesystemRegularFileFingerprint,
} from '../filesystem-fingerprint/index.js';

interface IFilesystemInventoryEntryBase {
  readonly hostPath: string;
  readonly path: IRepositoryPath;
  readonly type: IRepositoryEntryType;
}

// private regular-file observation with its creation-time fingerprint
export interface IFilesystemRegularFileInventoryEntry extends IFilesystemInventoryEntryBase {
  readonly fingerprint: IFilesystemRegularFileFingerprint;
  readonly type: 'file';
}

// private directory observation with its stable physical identity
export interface IFilesystemDirectoryInventoryEntry extends IFilesystemInventoryEntryBase {
  readonly identity: IFilesystemDirectoryIdentity;
  readonly type: 'directory';
}

// private no-follow symlink observation without target metadata
export interface IFilesystemSymlinkInventoryEntry extends IFilesystemInventoryEntryBase {
  readonly type: 'symlink';
}

// supported private filesystem observations retained by one inventory
export type IFilesystemInventoryEntry =
  | IFilesystemRegularFileInventoryEntry
  | IFilesystemDirectoryInventoryEntry
  | IFilesystemSymlinkInventoryEntry;

// private root-inclusive inventory retained for fingerprint and reader phases
export interface IFilesystemInventory {
  readonly entries: readonly IFilesystemInventoryEntry[];
}
