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

// normalized entry types
export type {
  IGitInventoryEntry,
  IGitInventoryIndexEntry,
  IGitTrackedInventoryEntry,
  IGitUntrackedInventoryEntry,
} from './entry-type/index.js';

// normalized inventory probe
export { createGitInventoryProbe, probeGitInventory } from './probe.js';
