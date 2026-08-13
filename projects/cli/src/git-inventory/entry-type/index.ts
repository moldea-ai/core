// types
export type {
  IGitInventoryEntry,
  IGitInventoryEntryInspector,
  IGitInventoryEntryTypeNormalizer,
  IGitInventoryIndexEntry,
  IGitTrackedInventoryEntry,
  IGitUntrackedInventoryEntry,
} from './types.js';

// candidate collapse
export { collapseGitInventoryCandidates } from './candidate-collapser.js';

// host entry inspection
export { createGitInventoryEntryInspector, inspectGitInventoryEntry } from './entry-inspector.js';

// effective Git symlink configuration
export {
  createGitSymlinkConfigurationResolver,
  resolveGitSymlinkConfiguration,
} from './symlink-configuration.js';

// effective entry-type normalization
export {
  createGitInventoryEntryTypeNormalizer,
  normalizeGitInventoryEntryTypes,
} from './normalizer.js';
