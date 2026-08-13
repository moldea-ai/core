import { stat } from 'node:fs/promises';
import path from 'node:path';

import { hasOnlyUnicodeScalarValues } from '../../command-line/index.js';
import {
  executeGitProcess,
  type IGitProcessExecutor,
  type IGitProcessFailureReason,
} from '../../git-process/index.js';
import { areHostPathsEquivalent } from '../../host-path-identity/index.js';
import type { IMoldeaCliGitErrorCode } from '../../presentation/index.js';
import { MAX_GIT_DISCOVERY_OUTPUT_BYTES } from '../constants.js';
import { parseGitAbsolutePathOutput, parseGitPathOutput } from '../parser.js';

import { GIT_WORKING_TREE_IDENTITY_ARGUMENTS } from './constants.js';
import type {
  IGitWorkingTreeIdentityInspectionFailedResult,
  IGitWorkingTreeIdentityInspectionResult,
  IGitWorkingTreeIdentityInspector,
  IGitWorkingTreeIdentityLocation,
  IGitWorkingTreeIdentityStat,
} from './types.js';

/** Reads one followed directory identity with bigint filesystem fields. */
const inspectDirectoryIdentity: IGitWorkingTreeIdentityStat = async (hostPath) =>
  stat(hostPath, { bigint: true });

/** Creates one immutable identity-inspection failure. */
const createInspectionFailure = (
  errorCode: IMoldeaCliGitErrorCode,
): IGitWorkingTreeIdentityInspectionFailedResult => Object.freeze({ errorCode, kind: 'failed' });

/** Maps one normalized Git process failure to the discovery error contract. */
const mapGitProcessFailure = (reason: IGitProcessFailureReason): IMoldeaCliGitErrorCode => {
  switch (reason) {
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

/** Maps one private filesystem failure without exposing its host diagnostics. */
const mapFilesystemFailure = (error: unknown): IMoldeaCliGitErrorCode => {
  let errorCode: string | undefined;

  try {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const unknownCode: unknown = error.code;

      errorCode = typeof unknownCode === 'string' ? unknownCode.toUpperCase() : undefined;
    }
  } catch {
    return 'GIT_COMMAND_FAILED';
  }

  if (errorCode === 'ENOENT' || errorCode === 'ENOTDIR') {
    return 'GIT_REPOSITORY_NOT_FOUND';
  }

  if (errorCode === 'EACCES' || errorCode === 'EPERM') {
    return 'GIT_ACCESS_DENIED';
  }

  return 'GIT_COMMAND_FAILED';
};

/** Executes one bounded Git identity-path query. */
const queryGitPath = async (
  processExecutor: IGitProcessExecutor,
  repositoryRoot: string,
  arguments_: readonly string[],
  isAbsoluteRequired: boolean,
): Promise<string | IGitWorkingTreeIdentityInspectionFailedResult> => {
  const result = await processExecutor({
    arguments: ['-C', repositoryRoot, ...arguments_],
    maxBufferBytes: MAX_GIT_DISCOVERY_OUTPUT_BYTES,
  });

  if (result.kind === 'failed') {
    return createInspectionFailure(mapGitProcessFailure(result.reason));
  }

  if (result.stderr.byteLength > 0) {
    return createInspectionFailure('GIT_OUTPUT_INVALID');
  }

  const gitPath = isAbsoluteRequired
    ? parseGitAbsolutePathOutput(result.stdout)
    : parseGitPathOutput(result.stdout);

  return gitPath ?? createInspectionFailure('GIT_OUTPUT_INVALID');
};

/** Captures one directory path and stable filesystem identity. */
const captureLocation = async (
  inspectPath: IGitWorkingTreeIdentityStat,
  hostPath: string,
  invalidTypeCode: IMoldeaCliGitErrorCode,
): Promise<IGitWorkingTreeIdentityLocation | IGitWorkingTreeIdentityInspectionFailedResult> => {
  try {
    const statistics = await inspectPath(hostPath);

    if (!statistics.isDirectory() || statistics.ino === 0n) {
      return createInspectionFailure(invalidTypeCode);
    }

    return Object.freeze({ dev: statistics.dev, ino: statistics.ino, path: hostPath });
  } catch (error) {
    return createInspectionFailure(mapFilesystemFailure(error));
  }
};

/** Determines whether an identity helper returned a safe failure. */
const isInspectionFailure = (
  result: string | IGitWorkingTreeIdentityLocation | IGitWorkingTreeIdentityInspectionFailedResult,
): result is IGitWorkingTreeIdentityInspectionFailedResult =>
  typeof result === 'object' && 'kind' in result && result.kind === 'failed';

/**
 * Creates a bounded working-tree identity inspector around Git and filesystem boundaries.
 * @param processExecutor The sanitized bounded Git process executor.
 * @param inspectPath The followed directory identity operation.
 * @returns An inspector that captures one private immutable identity.
 */
export const createGitWorkingTreeIdentityInspector = (
  processExecutor: IGitProcessExecutor = executeGitProcess,
  inspectPath: IGitWorkingTreeIdentityStat = inspectDirectoryIdentity,
): IGitWorkingTreeIdentityInspector => {
  return async (input): Promise<IGitWorkingTreeIdentityInspectionResult> => {
    if (
      !path.isAbsolute(input.repositoryRoot) ||
      input.repositoryRoot.includes('\0') ||
      !hasOnlyUnicodeScalarValues(input.repositoryRoot)
    ) {
      return createInspectionFailure('GIT_OUTPUT_INVALID');
    }

    const discoveredRoot = await queryGitPath(
      processExecutor,
      input.repositoryRoot,
      GIT_WORKING_TREE_IDENTITY_ARGUMENTS.RepositoryRoot,
      true,
    );

    if (isInspectionFailure(discoveredRoot)) {
      return discoveredRoot;
    }

    if (!areHostPathsEquivalent(discoveredRoot, input.repositoryRoot)) {
      return Object.freeze({ kind: 'mismatched' });
    }

    const gitDirectoryPath = await queryGitPath(
      processExecutor,
      input.repositoryRoot,
      GIT_WORKING_TREE_IDENTITY_ARGUMENTS.GitDirectory,
      true,
    );

    if (isInspectionFailure(gitDirectoryPath)) {
      return gitDirectoryPath;
    }

    const commonDirectoryOutput = await queryGitPath(
      processExecutor,
      input.repositoryRoot,
      GIT_WORKING_TREE_IDENTITY_ARGUMENTS.CommonDirectory,
      false,
    );

    if (isInspectionFailure(commonDirectoryOutput)) {
      return commonDirectoryOutput;
    }

    const commonDirectoryPath = path.isAbsolute(commonDirectoryOutput)
      ? commonDirectoryOutput
      : path.resolve(input.repositoryRoot, commonDirectoryOutput);
    const repositoryRoot = await captureLocation(
      inspectPath,
      discoveredRoot,
      'GIT_WORK_TREE_REQUIRED',
    );

    if (isInspectionFailure(repositoryRoot)) {
      return repositoryRoot;
    }

    const gitDirectory = await captureLocation(inspectPath, gitDirectoryPath, 'GIT_OUTPUT_INVALID');

    if (isInspectionFailure(gitDirectory)) {
      return gitDirectory;
    }

    const commonDirectory = await captureLocation(
      inspectPath,
      commonDirectoryPath,
      'GIT_OUTPUT_INVALID',
    );

    if (isInspectionFailure(commonDirectory)) {
      return commonDirectory;
    }

    return Object.freeze({
      identity: Object.freeze({ commonDirectory, gitDirectory, repositoryRoot }),
      kind: 'inspected',
    });
  };
};

// default identity inspector used by snapshot execution
export const inspectGitWorkingTreeIdentity = createGitWorkingTreeIdentityInspector();
