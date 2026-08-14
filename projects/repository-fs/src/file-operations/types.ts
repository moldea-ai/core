import type { FileHandle } from 'node:fs/promises';

import type {
  IFilesystemDirectoryInventoryEntry,
  IFilesystemInventoryEntry,
} from '../inventory/index.js';

// deterministic capture checkpoints used only by colocated mutation and cancellation fixtures
export interface IFilesystemFileCaptureCheckpoints {
  readonly afterOpen?: () => void | Promise<void>;
  readonly afterReadChunk?: (capturedByteCount: number) => void | Promise<void>;
  readonly closeFileHandle?: (fileHandle: FileHandle) => Promise<void>;
}

// one verified file and its root-to-parent directory identity chain
export interface IFilesystemFileCaptureTarget {
  readonly directories: readonly IFilesystemDirectoryInventoryEntry[];
  readonly file: Extract<IFilesystemInventoryEntry, { readonly type: 'file' }>;
}
