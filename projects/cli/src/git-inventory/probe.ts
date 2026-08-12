import {
  executeGitStreamingProcess,
  MAX_GIT_PROCESS_DIAGNOSTIC_BYTES,
  type IGitStreamingProcessExecutor,
  type IGitStreamingProcessFailureReason,
} from '../git-process/index.js';
import { GIT_TRACKED_INVENTORY_ARGUMENTS, GIT_UNTRACKED_INVENTORY_ARGUMENTS } from './constants.js';
import { createTrackedGitInventoryParser, createUntrackedGitInventoryParser } from './parser.js';
import type {
  IGitInventoryCandidate,
  IGitInventoryParserResult,
  IGitInventoryProbe,
  IGitInventoryProbeErrorCode,
  IGitInventoryProbeFailedResult,
  IGitInventoryProbeResult,
} from './types.js';

/** Maps one normalized streamed Git failure to a safe inventory error. */
const mapGitProcessFailure = (
  reason: IGitStreamingProcessFailureReason,
): IGitInventoryProbeErrorCode => {
  switch (reason) {
    case 'not-found':
      return 'GIT_NOT_FOUND';
    case 'repository-not-found':
      return 'GIT_REPOSITORY_NOT_FOUND';
    case 'access-denied':
      return 'GIT_ACCESS_DENIED';
    case 'stderr-limit-exceeded':
      return 'GIT_OUTPUT_INVALID';
    case 'output-limit-exceeded':
    case 'stdout-limit-exceeded':
      return 'RESOURCE_LIMIT_EXCEEDED';
    case 'command-failed':
      return 'GIT_COMMAND_FAILED';
  }
};

/** Creates one immutable inventory-probe failure. */
const createProbeFailure = (
  errorCode: IGitInventoryProbeErrorCode,
): IGitInventoryProbeFailedResult => Object.freeze({ errorCode, kind: 'failed' });

/** Maps one completed parser result into immutable candidates or a safe failure. */
const resolveParserResult = <TCandidate extends IGitInventoryCandidate>(
  parserResult: IGitInventoryParserResult<TCandidate>,
): readonly TCandidate[] | IGitInventoryProbeFailedResult => {
  if (parserResult.kind === 'completed') {
    return parserResult.candidates;
  }

  return createProbeFailure(
    parserResult.reason === 'entry-limit-exceeded'
      ? 'RESOURCE_LIMIT_EXCEEDED'
      : 'GIT_OUTPUT_INVALID',
  );
};

/** Identifies a parser resolution failure without relying on array contents. */
const isProbeFailure = (
  result: readonly IGitInventoryCandidate[] | IGitInventoryProbeFailedResult,
): result is IGitInventoryProbeFailedResult => !Array.isArray(result);

/**
 * Creates the strict raw Git inventory probe around an injectable streamed process boundary.
 * @param processExecutor The bounded incremental Git process executor.
 * @returns An all-or-nothing tracked and untracked candidate probe.
 */
export const createGitInventoryProbe =
  (
    processExecutor: IGitStreamingProcessExecutor = executeGitStreamingProcess,
  ): IGitInventoryProbe =>
  async (input): Promise<IGitInventoryProbeResult> => {
    const trackedParser = createTrackedGitInventoryParser(input.maxEntries);
    const trackedProcessResult = await processExecutor({
      arguments: ['-C', input.repositoryRoot, ...GIT_TRACKED_INVENTORY_ARGUMENTS],
      consumeStdout: (chunk) => trackedParser.consume(chunk),
      maxStderrBytes: MAX_GIT_PROCESS_DIAGNOSTIC_BYTES,
      maxStdoutBytes: input.maxMetadataBytes,
    });

    if (trackedProcessResult.kind === 'failed') {
      return createProbeFailure(mapGitProcessFailure(trackedProcessResult.reason));
    }

    if (trackedProcessResult.stderr.byteLength > 0) {
      return createProbeFailure('GIT_OUTPUT_INVALID');
    }

    const trackedCandidates = resolveParserResult(trackedParser.finish());

    if (isProbeFailure(trackedCandidates)) {
      return trackedCandidates;
    }

    const untrackedParser = createUntrackedGitInventoryParser(
      input.maxEntries - trackedCandidates.length,
    );
    const untrackedProcessResult = await processExecutor({
      arguments: ['-C', input.repositoryRoot, ...GIT_UNTRACKED_INVENTORY_ARGUMENTS],
      consumeStdout: (chunk) => untrackedParser.consume(chunk),
      maxStderrBytes: MAX_GIT_PROCESS_DIAGNOSTIC_BYTES,
      maxStdoutBytes: input.maxMetadataBytes - trackedProcessResult.stdoutBytes,
    });

    if (untrackedProcessResult.kind === 'failed') {
      return createProbeFailure(mapGitProcessFailure(untrackedProcessResult.reason));
    }

    if (untrackedProcessResult.stderr.byteLength > 0) {
      return createProbeFailure('GIT_OUTPUT_INVALID');
    }

    const untrackedCandidates = resolveParserResult(untrackedParser.finish());

    if (isProbeFailure(untrackedCandidates)) {
      return untrackedCandidates;
    }

    return Object.freeze({
      candidates: Object.freeze([...trackedCandidates, ...untrackedCandidates]),
      kind: 'probed',
    });
  };

// default raw Git inventory probe used by command execution
export const probeGitInventory = createGitInventoryProbe();
