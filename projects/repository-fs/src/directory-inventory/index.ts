// types
export type { IFilesystemDirectoryEntryCandidate, IFilesystemDirectoryIdentity } from './types.js';

// constants
export { FILESYSTEM_GIT_CONTROL_ENTRY_NAME } from './constants.js';

// utilities
export {
  createFilesystemDirectoryEntryCandidates,
  registerFilesystemDirectoryIdentity,
} from './utilities.js';

// inventory construction
export { createFilesystemDirectoryInventory } from './directory-inventory.js';
