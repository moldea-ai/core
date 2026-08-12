// types
export type {
  IGitVersion,
  IGitVersionFailedResult,
  IGitVersionPreflight,
  IGitVersionPreflightResult,
  IGitVersionSupportedResult,
} from './types.js';

// constants
export { MAX_GIT_VERSION_OUTPUT_BYTES, MINIMUM_GIT_VERSION } from './constants.js';

// parsing
export { parseGitVersionOutput } from './parser.js';

// prerequisite checks
export { checkGitVersion, createGitVersionPreflight } from './preflight.js';
