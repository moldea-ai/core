import {
  executeGitProcess,
  type IGitProcessExecutor,
  type IGitProcessFailureReason,
} from '../git-process/index.js';
import { createGitVersionPreflight, type IGitVersionPreflight } from '../git-version/index.js';
import type { IMoldeaCliGitErrorCode } from '../presentation/index.js';

import { MAX_GIT_DISCOVERY_OUTPUT_BYTES } from './constants.js';
import { parseGitAbsolutePathOutput, parseGitBooleanOutput } from './parser.js';
import { inspectGitStartingDirectory } from './starting-directory.js';
import type {
  IGitStartingDirectoryInspector,
  IGitWorkingTreeDiscovery,
  IGitWorkingTreeDiscoveryFailedResult,
  IGitWorkingTreeDiscoveryResult,
} from './types.js';

/** Maps a normalized Git process failure to a safe discovery error. */
const mapGitProcessFailure = (reason: IGitProcessFailureReason): IMoldeaCliGitErrorCode => {
  switch (reason) {
    case 'aborted':
      return 'GIT_OPERATION_ABORTED';
    case 'not-found':
      return 'GIT_NOT_FOUND';
    case 'repository-not-found':
      return 'GIT_REPOSITORY_NOT_FOUND';
    case 'access-denied':
      return 'GIT_ACCESS_DENIED';
    case 'output-limit-exceeded':
      return 'GIT_OUTPUT_INVALID';
    case 'command-failed':
      return 'GIT_COMMAND_FAILED';
  }
};

/** Creates one immutable discovery failure. */
const createDiscoveryFailure = (
  errorCode: IMoldeaCliGitErrorCode,
): IGitWorkingTreeDiscoveryFailedResult => Object.freeze({ errorCode, kind: 'failed' });

/**
 * Creates Git working-tree discovery around injectable process and filesystem boundaries.
 * @param processExecutor The normalized Git subprocess executor.
 * @param startingDirectoryInspector The safe directory inspection boundary.
 * @param gitVersionPreflight The Git version prerequisite check.
 * @returns A working-tree discovery operation.
 */
export const createGitWorkingTreeDiscovery =
  (
    processExecutor: IGitProcessExecutor = executeGitProcess,
    startingDirectoryInspector: IGitStartingDirectoryInspector = inspectGitStartingDirectory,
    gitVersionPreflight: IGitVersionPreflight = createGitVersionPreflight(processExecutor),
  ): IGitWorkingTreeDiscovery =>
  async (input): Promise<IGitWorkingTreeDiscoveryResult> => {
    const startingDirectoryResult = await startingDirectoryInspector(input);

    if (startingDirectoryResult.kind === 'failed') {
      return createDiscoveryFailure(startingDirectoryResult.errorCode);
    }

    const workTreeResult = await processExecutor({
      arguments: ['-C', startingDirectoryResult.directory, 'rev-parse', '--is-inside-work-tree'],
      maxBufferBytes: MAX_GIT_DISCOVERY_OUTPUT_BYTES,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    if (workTreeResult.kind === 'failed') {
      return createDiscoveryFailure(mapGitProcessFailure(workTreeResult.reason));
    }

    if (workTreeResult.stderr.byteLength > 0) {
      return createDiscoveryFailure('GIT_OUTPUT_INVALID');
    }

    const isInsideWorkTree = parseGitBooleanOutput(workTreeResult.stdout);

    if (isInsideWorkTree === null) {
      return createDiscoveryFailure('GIT_OUTPUT_INVALID');
    }

    if (!isInsideWorkTree) {
      return createDiscoveryFailure('GIT_WORK_TREE_REQUIRED');
    }

    const rootResult = await processExecutor({
      arguments: ['-C', startingDirectoryResult.directory, 'rev-parse', '--show-toplevel'],
      maxBufferBytes: MAX_GIT_DISCOVERY_OUTPUT_BYTES,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    if (rootResult.kind === 'failed') {
      return createDiscoveryFailure(mapGitProcessFailure(rootResult.reason));
    }

    if (rootResult.stderr.byteLength > 0) {
      return createDiscoveryFailure('GIT_OUTPUT_INVALID');
    }

    const repositoryRoot = parseGitAbsolutePathOutput(rootResult.stdout);

    if (repositoryRoot === null) {
      return createDiscoveryFailure('GIT_OUTPUT_INVALID');
    }

    const rootDirectoryResult = await startingDirectoryInspector({
      invocationDirectory: startingDirectoryResult.directory,
      repositoryDirectory: repositoryRoot,
    });

    if (rootDirectoryResult.kind === 'failed') {
      return createDiscoveryFailure(rootDirectoryResult.errorCode);
    }

    const versionResult = await gitVersionPreflight(input.signal);

    if (versionResult.kind === 'failed') {
      return createDiscoveryFailure(versionResult.errorCode);
    }

    const sparseCheckoutResult = await processExecutor({
      arguments: [
        '-C',
        rootDirectoryResult.directory,
        'config',
        '--type=bool',
        '--default=false',
        '--get',
        'core.sparseCheckout',
      ],
      maxBufferBytes: MAX_GIT_DISCOVERY_OUTPUT_BYTES,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    if (sparseCheckoutResult.kind === 'failed') {
      return createDiscoveryFailure(mapGitProcessFailure(sparseCheckoutResult.reason));
    }

    if (sparseCheckoutResult.stderr.byteLength > 0) {
      return createDiscoveryFailure('GIT_OUTPUT_INVALID');
    }

    const isSparseCheckout = parseGitBooleanOutput(sparseCheckoutResult.stdout);

    if (isSparseCheckout === null) {
      return createDiscoveryFailure('GIT_OUTPUT_INVALID');
    }

    if (isSparseCheckout) {
      return createDiscoveryFailure('GIT_SPARSE_CHECKOUT_UNSUPPORTED');
    }

    return Object.freeze({ kind: 'discovered', repositoryRoot });
  };

// default Git working-tree discovery used by command execution
export const discoverGitWorkingTree = createGitWorkingTreeDiscovery();
