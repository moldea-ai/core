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
export { parseGitBooleanOutput, parseGitRepositoryRootOutput } from './parser.js';

// starting-directory inspection
export {
  createGitStartingDirectoryInspector,
  inspectGitStartingDirectory,
} from './starting-directory.js';

// working-tree discovery
export { createGitWorkingTreeDiscovery, discoverGitWorkingTree } from './discovery.js';
