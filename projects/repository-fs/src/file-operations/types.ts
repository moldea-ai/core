import type { IRepositoryPath } from '@moldea.ai/repository';

import type { IFilesystemRepositoryResourceLimits } from '../contracts/index.js';
import type {
  IFilesystemDirectoryInventoryEntry,
  IFilesystemInventory,
  IFilesystemInventoryEntry,
} from '../inventory/index.js';

// private mutable cache retained by one future filesystem reader
export interface IFilesystemRepositoryFileCacheState {
  cachedByteCount: number;
  readonly filesByPath: Map<IRepositoryPath, Uint8Array>;
}

// internal file-operation state detached from the reader-creation signal
export interface IFilesystemRepositoryFileReadState {
  readonly cache: IFilesystemRepositoryFileCacheState;
  readonly entriesByPath: ReadonlyMap<IRepositoryPath, IFilesystemInventoryEntry>;
  readonly inventory: IFilesystemInventory;
  readonly limits: IFilesystemRepositoryResourceLimits;
}

// deterministic capture checkpoints used only by colocated mutation and cancellation fixtures
export interface IFilesystemFileCaptureCheckpoints {
  readonly afterOpen?: () => void | Promise<void>;
  readonly afterReadChunk?: (capturedByteCount: number) => void | Promise<void>;
}

// one verified file and its root-to-parent directory identity chain
export interface IFilesystemFileCaptureTarget {
  readonly directories: readonly IFilesystemDirectoryInventoryEntry[];
  readonly file: Extract<IFilesystemInventoryEntry, { readonly type: 'file' }>;
}
