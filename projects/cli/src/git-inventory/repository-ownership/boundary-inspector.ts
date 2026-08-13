import { Buffer } from 'node:buffer';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';

import {
  executeGitStreamingProcess,
  MAX_GIT_PROCESS_DIAGNOSTIC_BYTES,
  type IGitStreamingProcessExecutor,
  type IGitStreamingProcessFailureReason,
} from '../../git-process/index.js';
import { parseGitRepositoryRootOutput } from '../../git-working-tree/index.js';
import type { IGitInventoryProbeErrorCode } from '../types.js';

import type {
  IGitInventoryBoundaryInspectedResult,
  IGitInventoryBoundaryInspectionFailedResult,
  IGitInventoryBoundaryInspectionResult,
  IGitInventoryBoundaryInspector,
  IGitInventoryBoundaryOwnership,
  IGitInventoryOwnershipLstat,
  IGitInventoryOwnershipReadDirectory,
  IGitInventoryOwnershipStatistics,
} from './types.js';

const GIT_CONTROL_SEGMENT = '.git';
const GIT_REPOSITORY_ROOT_ARGUMENTS = ['rev-parse', '--show-toplevel'] as const;

interface IGitInventoryDirectoryObservation {
  readonly encodedNameKeys: ReadonlySet<string>;
  readonly hostPath: string;
  readonly ownership: IGitInventoryBoundaryOwnership;
}

interface IGitInventoryDirectoryReadResult {
  readonly encodedNameKeys: ReadonlySet<string>;
  readonly kind: 'read';
}

interface IGitInventoryPathInspectedResult {
  readonly kind: 'inspected';
  readonly statistics: IGitInventoryOwnershipStatistics;
}

type IGitInventoryDirectoryReadAttempt =
  IGitInventoryBoundaryInspectionFailedResult | IGitInventoryDirectoryReadResult;

type IGitInventoryPathInspectionAttempt =
  IGitInventoryBoundaryInspectionFailedResult | IGitInventoryPathInspectedResult;

interface IGitInventoryBoundaryValidationResult {
  readonly gitMetadataBytes: number;
  readonly kind: 'validated';
  readonly ownership: IGitInventoryBoundaryOwnership;
}

type IGitInventoryBoundaryValidationAttempt =
  IGitInventoryBoundaryInspectionFailedResult | IGitInventoryBoundaryValidationResult;

/** Identifies one safe inspection failure in a filesystem result union. */
const isInspectionFailure = (
  result: IGitInventoryBoundaryInspectionFailedResult | IGitInventoryDirectoryObservation,
): result is IGitInventoryBoundaryInspectionFailedResult => 'kind' in result;

/** Creates one immutable ownership-inspection failure. */
const createInspectionFailure = (
  errorCode: IGitInventoryProbeErrorCode,
): IGitInventoryBoundaryInspectionFailedResult => Object.freeze({ errorCode, kind: 'failed' });

/** Maps an unknown filesystem failure without retaining host diagnostics. */
const mapFilesystemFailure = (error: unknown): IGitInventoryProbeErrorCode => {
  const errorCode = (error as NodeJS.ErrnoException | null)?.code?.toUpperCase();

  if (errorCode === 'EACCES' || errorCode === 'EPERM') {
    return 'GIT_ACCESS_DENIED';
  }

  if (errorCode === 'ENOENT' || errorCode === 'ENOTDIR' || errorCode === 'ELOOP') {
    return 'GIT_OUTPUT_INVALID';
  }

  return 'GIT_COMMAND_FAILED';
};

/** Maps a streamed nested-root check failure into the existing safe CLI contract. */
const mapGitProcessFailure = (
  reason: IGitStreamingProcessFailureReason,
): IGitInventoryProbeErrorCode => {
  switch (reason) {
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

/** Reads one directory as native names without decoding unrelated entries. */
const readDirectoryNames = async (
  hostPath: string,
  readDirectory: IGitInventoryOwnershipReadDirectory,
): Promise<IGitInventoryDirectoryReadAttempt> => {
  try {
    const encodedNames = await readDirectory(hostPath);

    return Object.freeze({
      encodedNameKeys: new Set(encodedNames.map((encodedName) => encodedName.toString('hex'))),
      kind: 'read',
    });
  } catch (error) {
    return createInspectionFailure(mapFilesystemFailure(error));
  }
};

/** Captures one path without following its final filesystem entry. */
const inspectPath = async (
  hostPath: string,
  inspectHostPath: IGitInventoryOwnershipLstat,
): Promise<IGitInventoryPathInspectionAttempt> => {
  try {
    return Object.freeze({
      kind: 'inspected',
      statistics: await inspectHostPath(hostPath),
    });
  } catch (error) {
    return createInspectionFailure(mapFilesystemFailure(error));
  }
};

/** Determines whether native names contain one exact UTF-8 segment spelling. */
const hasExactDirectoryName = (encodedNameKeys: ReadonlySet<string>, segment: string): boolean =>
  encodedNameKeys.has(Buffer.from(segment, 'utf8').toString('hex'));

/** Confirms that one directory observation retained its no-follow identity. */
const hasStableDirectoryIdentity = (
  initialStatistics: IGitInventoryOwnershipStatistics,
  revalidatedStatistics: IGitInventoryOwnershipStatistics,
): boolean =>
  initialStatistics.isDirectory() &&
  !initialStatistics.isSymbolicLink() &&
  revalidatedStatistics.isDirectory() &&
  !revalidatedStatistics.isSymbolicLink() &&
  initialStatistics.dev === revalidatedStatistics.dev &&
  initialStatistics.ino === revalidatedStatistics.ino;

/** Concatenates already bounded Git stdout chunks for strict root parsing. */
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
 * Confirms whether a directory with an exact `.git` marker owns another working tree.
 * @param directory The exact no-follow directory being classified.
 * @param repositoryRoot The selected repository root.
 * @param maxMetadataBytes The remaining bounded Git stdout budget.
 * @param processExecutor The sanitized streamed Git boundary.
 * @returns A safe ownership classification and the consumed Git metadata bytes.
 */
const validateGitBoundary = async (
  directory: string,
  repositoryRoot: string,
  maxMetadataBytes: number,
  processExecutor: IGitStreamingProcessExecutor,
): Promise<IGitInventoryBoundaryValidationAttempt> => {
  if (!Number.isSafeInteger(maxMetadataBytes) || maxMetadataBytes < 0) {
    return createInspectionFailure('RESOURCE_LIMIT_EXCEEDED');
  }

  const stdoutChunks: Uint8Array[] = [];
  let consumedStdoutBytes = 0;
  const processResult = await processExecutor({
    arguments: ['-C', directory, ...GIT_REPOSITORY_ROOT_ARGUMENTS],
    consumeStdout: (chunk): void => {
      stdoutChunks.push(Uint8Array.from(chunk));
      consumedStdoutBytes += chunk.byteLength;
    },
    maxStderrBytes: MAX_GIT_PROCESS_DIAGNOSTIC_BYTES,
    maxStdoutBytes: maxMetadataBytes,
  });

  if (processResult.kind === 'failed') {
    return createInspectionFailure(mapGitProcessFailure(processResult.reason));
  }

  if (processResult.stderr.byteLength > 0 || processResult.stdoutBytes !== consumedStdoutBytes) {
    return createInspectionFailure('GIT_OUTPUT_INVALID');
  }

  const discoveredRoot = parseGitRepositoryRootOutput(
    concatenateChunks(stdoutChunks, consumedStdoutBytes),
  );

  if (discoveredRoot === null) {
    return createInspectionFailure('GIT_OUTPUT_INVALID');
  }

  const normalizedDiscoveredRoot = path.resolve(discoveredRoot);
  const normalizedDirectory = path.resolve(directory);
  const normalizedRepositoryRoot = path.resolve(repositoryRoot);

  if (normalizedDiscoveredRoot === normalizedDirectory) {
    return Object.freeze({
      gitMetadataBytes: processResult.stdoutBytes,
      kind: 'validated',
      ownership: 'nested-repository',
    });
  }

  if (normalizedDiscoveredRoot === normalizedRepositoryRoot) {
    return Object.freeze({
      gitMetadataBytes: processResult.stdoutBytes,
      kind: 'validated',
      ownership: 'selected-repository',
    });
  }

  return createInspectionFailure('GIT_OUTPUT_INVALID');
};

/** Default no-follow stat boundary for ownership inspection. */
const inspectOwnershipPath: IGitInventoryOwnershipLstat = async (hostPath) =>
  lstat(hostPath, { bigint: true });

/** Default raw directory-name boundary for ownership inspection. */
const readOwnershipDirectory: IGitInventoryOwnershipReadDirectory = async (hostPath) =>
  readdir(hostPath, { encoding: 'buffer' });

/**
 * Creates nested-repository inspection around injectable filesystem and Git boundaries.
 * @param processExecutor The sanitized bounded Git process executor.
 * @param inspectHostPath The no-follow filesystem stat operation.
 * @param readDirectory The raw native-name directory operation.
 * @returns An all-or-nothing ownership inspector for untracked candidate paths.
 */
export const createGitInventoryBoundaryInspector = (
  processExecutor: IGitStreamingProcessExecutor = executeGitStreamingProcess,
  inspectHostPath: IGitInventoryOwnershipLstat = inspectOwnershipPath,
  readDirectory: IGitInventoryOwnershipReadDirectory = readOwnershipDirectory,
): IGitInventoryBoundaryInspector => {
  return async (input): Promise<IGitInventoryBoundaryInspectionResult> => {
    const directoryObservations = new Map<string, IGitInventoryDirectoryObservation>();
    const ownership: IGitInventoryBoundaryOwnership[] = [];
    let gitMetadataBytes = 0;
    let rootEncodedNameKeys: ReadonlySet<string> | null = null;

    const getRootEncodedNames = async (): Promise<IGitInventoryDirectoryReadAttempt> => {
      if (rootEncodedNameKeys !== null) {
        return Object.freeze({ encodedNameKeys: rootEncodedNameKeys, kind: 'read' });
      }

      const readResult = await readDirectoryNames(input.repositoryRoot, readDirectory);

      if (readResult.kind === 'read') {
        rootEncodedNameKeys = readResult.encodedNameKeys;
      }

      return readResult;
    };

    const inspectDirectory = async (
      parentObservation: IGitInventoryDirectoryObservation | null,
      parentPrefix: string,
      segment: string,
    ): Promise<IGitInventoryBoundaryInspectionFailedResult | IGitInventoryDirectoryObservation> => {
      const prefix = parentPrefix.length === 0 ? segment : `${parentPrefix}/${segment}`;
      const cachedObservation = directoryObservations.get(prefix);

      if (cachedObservation !== undefined) {
        return cachedObservation;
      }

      const parentNamesResult =
        parentObservation === null
          ? await getRootEncodedNames()
          : Object.freeze({
              encodedNameKeys: parentObservation.encodedNameKeys,
              kind: 'read' as const,
            });

      if (parentNamesResult.kind === 'failed') {
        return parentNamesResult;
      }

      if (!hasExactDirectoryName(parentNamesResult.encodedNameKeys, segment)) {
        return createInspectionFailure('GIT_OUTPUT_INVALID');
      }

      const parentHostPath = parentObservation?.hostPath ?? input.repositoryRoot;
      const hostPath = path.join(parentHostPath, segment);
      const initialInspection = await inspectPath(hostPath, inspectHostPath);

      if (initialInspection.kind === 'failed') {
        return initialInspection;
      }

      if (
        !initialInspection.statistics.isDirectory() ||
        initialInspection.statistics.isSymbolicLink()
      ) {
        return createInspectionFailure('GIT_OUTPUT_INVALID');
      }

      const directoryNamesResult = await readDirectoryNames(hostPath, readDirectory);

      if (directoryNamesResult.kind === 'failed') {
        return directoryNamesResult;
      }

      const revalidatedInspection = await inspectPath(hostPath, inspectHostPath);

      if (revalidatedInspection.kind === 'failed') {
        return revalidatedInspection;
      }

      if (
        !hasStableDirectoryIdentity(initialInspection.statistics, revalidatedInspection.statistics)
      ) {
        return createInspectionFailure('GIT_OUTPUT_INVALID');
      }

      const gitControlPath = path.join(hostPath, GIT_CONTROL_SEGMENT);
      const hasExactGitControlSegment = hasExactDirectoryName(
        directoryNamesResult.encodedNameKeys,
        GIT_CONTROL_SEGMENT,
      );
      let directoryOwnership: IGitInventoryBoundaryOwnership = 'selected-repository';

      if (!hasExactGitControlSegment) {
        try {
          await inspectHostPath(gitControlPath);

          return createInspectionFailure('GIT_OUTPUT_INVALID');
        } catch (error) {
          const errorCode = (error as NodeJS.ErrnoException | null)?.code?.toUpperCase();

          if (errorCode !== 'ENOENT' && errorCode !== 'ENOTDIR') {
            return createInspectionFailure(mapFilesystemFailure(error));
          }
        }
      } else {
        const gitControlInspection = await inspectPath(gitControlPath, inspectHostPath);

        if (gitControlInspection.kind === 'failed') {
          return gitControlInspection;
        }

        if (
          gitControlInspection.statistics.isSymbolicLink() ||
          (!gitControlInspection.statistics.isDirectory() &&
            !gitControlInspection.statistics.isFile())
        ) {
          return createInspectionFailure('GIT_OUTPUT_INVALID');
        }

        const boundaryValidation = await validateGitBoundary(
          hostPath,
          input.repositoryRoot,
          input.maxMetadataBytes - gitMetadataBytes,
          processExecutor,
        );

        if (boundaryValidation.kind === 'failed') {
          return boundaryValidation;
        }

        gitMetadataBytes += boundaryValidation.gitMetadataBytes;
        directoryOwnership = boundaryValidation.ownership;
      }

      const observation = Object.freeze({
        encodedNameKeys: directoryNamesResult.encodedNameKeys,
        hostPath,
        ownership: directoryOwnership,
      });

      directoryObservations.set(prefix, observation);

      return observation;
    };

    for (const plan of input.plans) {
      let candidateOwnership: IGitInventoryBoundaryOwnership = 'selected-repository';
      let parentObservation: IGitInventoryDirectoryObservation | null = null;
      let parentPrefix = '';

      for (const segment of plan.directorySegments) {
        const observation = await inspectDirectory(parentObservation, parentPrefix, segment);

        if (isInspectionFailure(observation)) {
          return observation;
        }

        parentObservation = observation;
        parentPrefix = parentPrefix.length === 0 ? segment : `${parentPrefix}/${segment}`;

        if (observation.ownership === 'nested-repository') {
          candidateOwnership = 'nested-repository';
          break;
        }
      }

      if (plan.isDirectoryRecord && candidateOwnership !== 'nested-repository') {
        return createInspectionFailure('GIT_OUTPUT_INVALID');
      }

      ownership.push(candidateOwnership);
    }

    const result: IGitInventoryBoundaryInspectedResult = Object.freeze({
      gitMetadataBytes,
      kind: 'inspected',
      ownership: Object.freeze([...ownership]),
    });

    return result;
  };
};

// default nested-repository ownership boundary used by inventory filtering
export const inspectGitInventoryBoundaries = createGitInventoryBoundaryInspector();
