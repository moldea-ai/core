// constants
export { MAX_GIT_DISCOVERY_OUTPUT_BYTES } from './constants.js';

// types
export type {
  IGitStartingDirectoryFailedResult,
  IGitStartingDirectoryFoundResult,
  IGitStartingDirectoryInspectionInput,
  IGitStartingDirectoryInspectionResult,
  IGitStartingDirectoryInspector,
  IGitStartingDirectoryStat,
  IGitWorkingTreeDiscoveredResult,
  IGitWorkingTreeDiscovery,
  IGitWorkingTreeDiscoveryFailedResult,
  IGitWorkingTreeDiscoveryInput,
  IGitWorkingTreeDiscoveryResult,
} from './types.js';

// parsers
export { parseGitAbsolutePathOutput, parseGitBooleanOutput, parseGitPathOutput } from './parser.js';

// starting-directory inspection
export {
  createGitStartingDirectoryInspector,
  inspectGitStartingDirectory,
} from './starting-directory.js';

// working-tree discovery
export { createGitWorkingTreeDiscovery, discoverGitWorkingTree } from './discovery.js';

// working-tree identity
export {
  areGitWorkingTreeIdentitiesEqual,
  createGitWorkingTreeIdentityInspector,
  inspectGitWorkingTreeIdentity,
  type IGitWorkingTreeIdentity,
  type IGitWorkingTreeIdentityInspectionResult,
  type IGitWorkingTreeIdentityInspector,
} from './identity/index.js';
