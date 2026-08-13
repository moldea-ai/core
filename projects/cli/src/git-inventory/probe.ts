import {
  executeGitStreamingProcess,
  MAX_GIT_PROCESS_DIAGNOSTIC_BYTES,
  type IGitStreamingProcessExecutor,
  type IGitStreamingProcessFailureReason,
} from '../git-process/index.js';
import { GIT_TRACKED_INVENTORY_ARGUMENTS, GIT_UNTRACKED_INVENTORY_ARGUMENTS } from './constants.js';
import {
  createGitContentTransformationClassifier,
  type IGitContentTransformationClassifier,
} from './content-transformation/index.js';
import {
  createGitInventoryEntryTypeNormalizer,
  createGitSymlinkConfigurationResolver,
  inspectGitInventoryEntry,
  type IGitInventoryEntryTypeNormalizer,
} from './entry-type/index.js';
import {
  normalizeGitInventoryLogicalPaths,
  type IGitInventoryLogicalPathNormalizer,
  validateGitInventoryCandidateLogicalPaths,
} from './logical-path/index.js';
import { createTrackedGitInventoryParser, createUntrackedGitInventoryParser } from './parser.js';
import {
  createGitInventoryBoundaryInspector,
  createGitInventoryOwnershipFilter,
  type IGitInventoryOwnershipFilter,
} from './repository-ownership/index.js';
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
    case 'aborted':
      return 'GIT_OPERATION_ABORTED';
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
 * Creates the strict normalized Git inventory probe around injectable boundaries.
 * @param processExecutor The bounded incremental Git process executor.
 * @param ownershipFilter The submodule and nested-repository ownership filter.
 * @param entryTypeNormalizer The current filesystem and Git mode entry-type normalizer.
 * @param contentTransformationClassifier The bounded effective Git attribute classifier.
 * @param logicalPathNormalizer The portable repository logical-path normalizer.
 * @returns An all-or-nothing selected-repository entry probe.
 */
export const createGitInventoryProbe =
  (
    processExecutor: IGitStreamingProcessExecutor = executeGitStreamingProcess,
    ownershipFilter: IGitInventoryOwnershipFilter = createGitInventoryOwnershipFilter(
      createGitInventoryBoundaryInspector(processExecutor),
    ),
    entryTypeNormalizer: IGitInventoryEntryTypeNormalizer = createGitInventoryEntryTypeNormalizer(
      inspectGitInventoryEntry,
      createGitSymlinkConfigurationResolver(processExecutor),
    ),
    contentTransformationClassifier: IGitContentTransformationClassifier = createGitContentTransformationClassifier(
      processExecutor,
    ),
    logicalPathNormalizer: IGitInventoryLogicalPathNormalizer = normalizeGitInventoryLogicalPaths,
  ): IGitInventoryProbe =>
  async (input): Promise<IGitInventoryProbeResult> => {
    if (input.signal?.aborted) {
      return createProbeFailure('GIT_OPERATION_ABORTED');
    }

    const trackedParser = createTrackedGitInventoryParser(input.maxEntries);
    const trackedProcessResult = await processExecutor({
      arguments: ['-C', input.repositoryRoot, ...GIT_TRACKED_INVENTORY_ARGUMENTS],
      consumeStdout: (chunk) => trackedParser.consume(chunk),
      maxStderrBytes: MAX_GIT_PROCESS_DIAGNOSTIC_BYTES,
      maxStdoutBytes: input.maxMetadataBytes,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
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
      ...(input.signal === undefined ? {} : { signal: input.signal }),
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

    const candidates = Object.freeze([...trackedCandidates, ...untrackedCandidates]);
    const logicalPathValidationResult = validateGitInventoryCandidateLogicalPaths({ candidates });

    if (logicalPathValidationResult.kind === 'failed') {
      return logicalPathValidationResult;
    }

    const ownershipResult = await ownershipFilter({
      candidates,
      maxMetadataBytes:
        input.maxMetadataBytes -
        trackedProcessResult.stdoutBytes -
        untrackedProcessResult.stdoutBytes,
      repositoryRoot: input.repositoryRoot,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    if (ownershipResult.kind === 'failed') {
      return ownershipResult;
    }

    const entryTypeResult = await entryTypeNormalizer({
      candidates: ownershipResult.candidates,
      maxMetadataBytes:
        input.maxMetadataBytes -
        trackedProcessResult.stdoutBytes -
        untrackedProcessResult.stdoutBytes -
        ownershipResult.gitMetadataBytes,
      repositoryRoot: input.repositoryRoot,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    if (entryTypeResult.kind === 'failed') {
      return entryTypeResult;
    }

    const contentTransformationResult = await contentTransformationClassifier({
      entries: entryTypeResult.entries,
      maxMetadataBytes:
        input.maxMetadataBytes -
        trackedProcessResult.stdoutBytes -
        untrackedProcessResult.stdoutBytes -
        ownershipResult.gitMetadataBytes -
        entryTypeResult.gitMetadataBytes,
      repositoryRoot: input.repositoryRoot,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });

    if (contentTransformationResult.kind === 'failed') {
      return contentTransformationResult;
    }

    const logicalPathResult = logicalPathNormalizer({
      entries: contentTransformationResult.entries,
    });

    if (logicalPathResult.kind === 'failed') {
      return logicalPathResult;
    }

    return Object.freeze({ entries: logicalPathResult.entries, kind: 'probed' });
  };

// default normalized Git inventory probe used by command execution
export const probeGitInventory = createGitInventoryProbe();
