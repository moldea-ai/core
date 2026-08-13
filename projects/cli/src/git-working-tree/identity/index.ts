// types
export type {
  IGitWorkingTreeIdentity,
  IGitWorkingTreeIdentityInspectionFailedResult,
  IGitWorkingTreeIdentityInspectionInput,
  IGitWorkingTreeIdentityInspectionResult,
  IGitWorkingTreeIdentityInspectedResult,
  IGitWorkingTreeIdentityInspector,
  IGitWorkingTreeIdentityLocation,
  IGitWorkingTreeIdentityMismatchedResult,
  IGitWorkingTreeIdentityStat,
  IGitWorkingTreeIdentityStatResult,
} from './types.js';

// identity comparison
export { areGitWorkingTreeIdentitiesEqual } from './comparator.js';

// identity inspection
export {
  createGitWorkingTreeIdentityInspector,
  inspectGitWorkingTreeIdentity,
} from './inspector.js';
