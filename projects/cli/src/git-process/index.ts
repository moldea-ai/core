// types
export type {
  IExecuteGitProcessOptions,
  IGitProcessCompletedResult,
  IGitProcessEnvironment,
  IGitProcessExecutor,
  IGitProcessFailedResult,
  IGitProcessFailureReason,
  IGitProcessResult,
  IExecuteGitStreamingProcessOptions,
  IGitProcessStdoutConsumer,
  IGitStreamingProcessCompletedResult,
  IGitStreamingProcessExecutor,
  IGitStreamingProcessFailedResult,
  IGitStreamingProcessFailureReason,
  IGitStreamingProcessResult,
} from './types.js';

// constants
export {
  GIT_PROCESS_ENVIRONMENT_OVERRIDES,
  GIT_PROCESS_GLOBAL_ARGUMENTS,
  MAX_GIT_PROCESS_DIAGNOSTIC_BYTES,
  GIT_PROCESS_REMOVED_ENVIRONMENT_NAMES,
  GIT_PROCESS_REMOVED_ENVIRONMENT_PREFIXES,
} from './constants.js';

// environment
export { createGitProcessEnvironment } from './environment.js';

// process execution
export { executeGitProcess } from './executor.js';
export { executeGitStreamingProcess } from './streaming-executor.js';
