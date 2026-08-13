import {
  executeGitStreamingProcess,
  MAX_GIT_PROCESS_DIAGNOSTIC_BYTES,
  type IGitStreamingProcessExecutor,
  type IGitStreamingProcessFailureReason,
} from '../../git-process/index.js';
import { parseGitBooleanOutput } from '../../git-working-tree/index.js';
import type { IGitInventoryProbeErrorCode } from '../types.js';

import { GIT_SYMLINK_CONFIGURATION_ARGUMENTS } from './constants.js';
import type {
  IGitSymlinkConfigurationFailedResult,
  IGitSymlinkConfigurationResolver,
  IGitSymlinkConfigurationResult,
} from './types.js';

/** Creates one immutable effective symlink configuration failure. */
const createConfigurationFailure = (
  errorCode: IGitInventoryProbeErrorCode,
): IGitSymlinkConfigurationFailedResult => Object.freeze({ errorCode, kind: 'failed' });

/** Maps one bounded Git configuration failure to the existing safe CLI contract. */
const mapGitProcessFailure = (
  reason: IGitStreamingProcessFailureReason,
): IGitInventoryProbeErrorCode => {
  switch (reason) {
    case 'aborted':
      return 'GIT_OPERATION_ABORTED';
    case 'not-found':
      return 'GIT_NOT_FOUND';
    case 'access-denied':
      return 'GIT_ACCESS_DENIED';
    case 'output-limit-exceeded':
    case 'stdout-limit-exceeded':
      return 'RESOURCE_LIMIT_EXCEEDED';
    case 'repository-not-found':
    case 'stderr-limit-exceeded':
      return 'GIT_OUTPUT_INVALID';
    case 'command-failed':
      return 'GIT_COMMAND_FAILED';
  }
};

/** Concatenates already bounded Git stdout chunks for strict boolean parsing. */
const concatenateChunks = (chunks: readonly Uint8Array[], byteLength: number): Uint8Array => {
  const output = new Uint8Array(byteLength);
  let offset = 0;

  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return output;
};

/**
 * Creates the bounded effective core.symlinks resolver around a Git process boundary.
 * @param processExecutor The sanitized streamed Git process executor.
 * @returns A resolver for the selected repository's effective symlink behavior.
 */
export const createGitSymlinkConfigurationResolver = (
  processExecutor: IGitStreamingProcessExecutor = executeGitStreamingProcess,
): IGitSymlinkConfigurationResolver => {
  return async (input): Promise<IGitSymlinkConfigurationResult> => {
    if (input.signal?.aborted) {
      return createConfigurationFailure('GIT_OPERATION_ABORTED');
    }

    if (!Number.isSafeInteger(input.maxMetadataBytes) || input.maxMetadataBytes < 0) {
      return createConfigurationFailure('RESOURCE_LIMIT_EXCEEDED');
    }

    const stdoutChunks: Uint8Array[] = [];
    let consumedStdoutBytes = 0;
    const processResult = await processExecutor({
      arguments: ['-C', input.repositoryRoot, ...GIT_SYMLINK_CONFIGURATION_ARGUMENTS],
      consumeStdout: (chunk): void => {
        stdoutChunks.push(Uint8Array.from(chunk));
        consumedStdoutBytes += chunk.byteLength;
      },
      maxStderrBytes: MAX_GIT_PROCESS_DIAGNOSTIC_BYTES,
      maxStdoutBytes: input.maxMetadataBytes,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    if (processResult.kind === 'failed') {
      return createConfigurationFailure(mapGitProcessFailure(processResult.reason));
    }

    if (
      processResult.stderr.byteLength > 0 ||
      processResult.stdoutBytes !== consumedStdoutBytes ||
      processResult.stdoutBytes > input.maxMetadataBytes
    ) {
      return createConfigurationFailure('GIT_OUTPUT_INVALID');
    }

    const isEnabled = parseGitBooleanOutput(concatenateChunks(stdoutChunks, consumedStdoutBytes));

    if (isEnabled === null) {
      return createConfigurationFailure('GIT_OUTPUT_INVALID');
    }

    return Object.freeze({
      gitMetadataBytes: processResult.stdoutBytes,
      isEnabled,
      kind: 'resolved',
    });
  };
};

// default bounded effective core.symlinks resolver
export const resolveGitSymlinkConfiguration = createGitSymlinkConfigurationResolver();
