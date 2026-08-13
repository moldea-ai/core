// types
export type {
  IGitInventoryEntry,
  IGitInventoryLogicalPathNormalizer,
  IGitTrackedInventoryEntry,
  IGitUntrackedInventoryEntry,
} from './types.js';

// logical-path normalization
export {
  normalizeGitInventoryLogicalPaths,
  validateGitInventoryCandidateLogicalPaths,
} from './normalizer.js';
