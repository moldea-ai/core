import type { Buffer } from 'node:buffer';

import type { IRepositoryEntryType, IRepositoryPath } from '@moldea.ai/repository';

import type { IFilesystemExactPathSelectionPlanEntry } from '../exact-path-selection/index.js';

// one exact raw source name paired with its deterministic logical selection entry
export interface IFilesystemExactPathDirectoryNameMatch {
  readonly encodedName: Buffer;
  readonly plannedEntry: IFilesystemExactPathSelectionPlanEntry;
}

// private no-follow filesystem observation for one frozen logical inventory path
export interface IFilesystemExactPathInventoryEntry {
  readonly hostPath: string;
  readonly path: IRepositoryPath;
  readonly type: IRepositoryEntryType;
}

// private exact-path inventory retained for later fingerprint and reader phases
export interface IFilesystemExactPathInventory {
  readonly entries: readonly IFilesystemExactPathInventoryEntry[];
}
