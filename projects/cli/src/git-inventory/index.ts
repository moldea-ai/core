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

// ownership-filtered inventory probe
export { createGitInventoryProbe, probeGitInventory } from './probe.js';
