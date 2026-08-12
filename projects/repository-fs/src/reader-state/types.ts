import type { IRepositoryOperation, IRepositoryPath } from '@moldea.ai/repository';

import type { IFilesystemRepositoryResourceLimits } from '../contracts/index.js';
import type { IFilesystemInventory, IFilesystemInventoryEntry } from '../inventory/index.js';

// operation identifiers supported after a filesystem reader has been constructed
export type IFilesystemRepositoryReaderOperation = Exclude<IRepositoryOperation, 'create-reader'>;

// private captured-byte cache retained by one future filesystem reader
export interface IFilesystemRepositoryFileCacheState {
  cachedByteCount: number;
  readonly filesByPath: Map<IRepositoryPath, Uint8Array>;
}

// permanent lifecycle record retaining only the first snapshot-loss cause
export interface IFilesystemRepositoryReaderLifecycle {
  invalidationCause: unknown;
  isInvalidated: boolean;
}

// authoritative internal state shared by every future filesystem reader operation
export interface IFilesystemRepositoryReaderState {
  readonly cache: IFilesystemRepositoryFileCacheState;
  readonly entriesByPath: ReadonlyMap<IRepositoryPath, IFilesystemInventoryEntry>;
  readonly inventory: IFilesystemInventory;
  readonly lifecycle: IFilesystemRepositoryReaderLifecycle;
  readonly limits: IFilesystemRepositoryResourceLimits;
}
