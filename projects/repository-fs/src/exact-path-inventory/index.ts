// types
export type {
  IFilesystemExactPathDirectoryNameMatch,
  IFilesystemExactPathInventory,
  IFilesystemExactPathInventoryEntry,
} from './types.js';

// inventory construction
export { createFilesystemExactPathInventory } from './exact-path-inventory.js';

// utilities
export {
  getMissingFilesystemExactPathDirectoryEntries,
  matchFilesystemExactPathDirectoryNames,
} from './utilities.js';
