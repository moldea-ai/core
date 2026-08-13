// types
export type {
  IGitInventoryCandidate,
  IGitInventoryProbe,
  IGitInventoryProbeErrorCode,
  IGitInventoryProbeFailedResult,
  IGitInventoryProbeInput,
  IGitInventoryProbedResult,
  IGitInventoryProbeResult,
  IGitTrackedEntryMode,
  IGitTrackedEntryStage,
  IGitTrackedInventoryCandidate,
  IGitUntrackedInventoryCandidate,
} from './types.js';

// entry-type normalization
export type { IGitInventoryIndexEntry } from './entry-type/index.js';

// content-transformation classification
export type { IGitContentTransformationClassification } from './content-transformation/index.js';

// logical-path-normalized inventory
export type {
  IGitInventoryEntry,
  IGitTrackedInventoryEntry,
  IGitUntrackedInventoryEntry,
} from './logical-path/index.js';

// normalized inventory probe
export { createGitInventoryProbe, probeGitInventory } from './probe.js';
