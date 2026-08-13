import {
  executeGitProcess,
  type IGitProcessExecutor,
  type IGitProcessFailureReason,
} from '../git-process/index.js';
import type { IMoldeaCliGitErrorCode } from '../presentation/index.js';

import { MAX_GIT_VERSION_OUTPUT_BYTES, MINIMUM_GIT_VERSION_COMPONENTS } from './constants.js';
import { parseGitVersionOutput } from './parser.js';
import type { IGitVersion, IGitVersionPreflight, IGitVersionPreflightResult } from './types.js';

/**
 * Maps process failures to stable safe CLI errors.
 * @param reason The normalized subprocess failure reason.
 * @returns The public Git error code.
 */
const mapGitProcessFailure = (reason: IGitProcessFailureReason): IMoldeaCliGitErrorCode => {
  switch (reason) {
    case 'aborted':
      return 'GIT_OPERATION_ABORTED';
    case 'not-found':
      return 'GIT_NOT_FOUND';
    case 'repository-not-found':
      return 'GIT_COMMAND_FAILED';
    case 'access-denied':
      return 'GIT_ACCESS_DENIED';
    case 'output-limit-exceeded':
      return 'GIT_VERSION_INVALID';
    case 'command-failed':
      return 'GIT_COMMAND_FAILED';
  }
};

/**
 * Determines whether a parsed Git version meets the supported minimum.
 * @param version The parsed Git version.
 * @returns Whether the numeric version is supported.
 */
const isGitVersionSupported = (version: IGitVersion): boolean => {
  if (version.major !== MINIMUM_GIT_VERSION_COMPONENTS.major) {
    return version.major > MINIMUM_GIT_VERSION_COMPONENTS.major;
  }

  if (version.minor !== MINIMUM_GIT_VERSION_COMPONENTS.minor) {
    return version.minor > MINIMUM_GIT_VERSION_COMPONENTS.minor;
  }

  return version.patch >= MINIMUM_GIT_VERSION_COMPONENTS.patch;
};

/**
 * Creates a Git prerequisite check around an injectable process boundary.
 * @param processExecutor The normalized Git subprocess executor.
 * @returns A preflight that validates the installed Git version.
 */
export const createGitVersionPreflight =
  (processExecutor: IGitProcessExecutor = executeGitProcess): IGitVersionPreflight =>
  async (signal): Promise<IGitVersionPreflightResult> => {
    const processResult = await processExecutor({
      arguments: ['--version'],
      maxBufferBytes: MAX_GIT_VERSION_OUTPUT_BYTES,
      ...(signal === undefined ? {} : { signal }),
    });

    if (processResult.kind === 'failed') {
      return Object.freeze({
        errorCode: mapGitProcessFailure(processResult.reason),
        kind: 'failed',
      });
    }

    if (processResult.stderr.byteLength > 0) {
      return Object.freeze({
        errorCode: 'GIT_VERSION_INVALID',
        kind: 'failed',
      });
    }

    const version = parseGitVersionOutput(processResult.stdout);

    if (version === null) {
      return Object.freeze({
        errorCode: 'GIT_VERSION_INVALID',
        kind: 'failed',
      });
    }

    if (!isGitVersionSupported(version)) {
      return Object.freeze({
        errorCode: 'GIT_VERSION_UNSUPPORTED',
        kind: 'failed',
      });
    }

    return Object.freeze({ kind: 'supported', version });
  };

// default Git prerequisite preflight used by command execution
export const checkGitVersion = createGitVersionPreflight();
