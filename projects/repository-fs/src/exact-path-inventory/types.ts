import type { Buffer } from 'node:buffer';

import type { IFilesystemExactPathSelectionPlanEntry } from '../exact-path-selection/index.js';

// one exact raw source name paired with its deterministic logical selection entry
export interface IFilesystemExactPathDirectoryNameMatch {
  readonly encodedName: Buffer;
  readonly plannedEntry: IFilesystemExactPathSelectionPlanEntry;
}
