import { stat } from 'node:fs/promises';
import path from 'node:path';

import {
  hasOnlyUnicodeScalarValues,
  isRepositoryDirectoryInputValid,
} from '../command-line/index.js';

import type {
  IGitStartingDirectoryInspectionResult,
  IGitStartingDirectoryInspector,
  IGitStartingDirectoryStat,
} from './types.js';

/**
 * Maps a filesystem failure without retaining host diagnostics or paths.
 * @param error The unknown filesystem failure.
 * @returns An immutable safe discovery failure.
 */
const mapFilesystemFailure = (error: unknown): IGitStartingDirectoryInspectionResult => {
  const errorCode = (error as NodeJS.ErrnoException | null)?.code?.toUpperCase();

  if (errorCode === 'ENOENT' || errorCode === 'ENOTDIR') {
    return Object.freeze({ errorCode: 'GIT_REPOSITORY_NOT_FOUND', kind: 'failed' });
  }

  if (errorCode === 'EACCES' || errorCode === 'EPERM') {
    return Object.freeze({ errorCode: 'GIT_ACCESS_DENIED', kind: 'failed' });
  }

  return Object.freeze({ errorCode: 'GIT_COMMAND_FAILED', kind: 'failed' });
};

/**
 * Creates a starting-directory inspector around an injectable filesystem boundary.
 * @param inspectPath The filesystem stat operation.
 * @returns A safe inspector that resolves and verifies the selected directory.
 */
export const createGitStartingDirectoryInspector =
  (inspectPath: IGitStartingDirectoryStat = stat): IGitStartingDirectoryInspector =>
  async (input): Promise<IGitStartingDirectoryInspectionResult> => {
    if (
      !path.isAbsolute(input.invocationDirectory) ||
      input.invocationDirectory.includes('\0') ||
      !hasOnlyUnicodeScalarValues(input.invocationDirectory) ||
      (input.repositoryDirectory !== null &&
        !isRepositoryDirectoryInputValid(input.repositoryDirectory))
    ) {
      return Object.freeze({ errorCode: 'GIT_REPOSITORY_NOT_FOUND', kind: 'failed' });
    }

    const selectedDirectory =
      input.repositoryDirectory === null
        ? input.invocationDirectory
        : path.isAbsolute(input.repositoryDirectory)
          ? input.repositoryDirectory
          : path.resolve(input.invocationDirectory, input.repositoryDirectory);

    try {
      const directoryStats = await inspectPath(selectedDirectory);

      if (!directoryStats.isDirectory()) {
        return Object.freeze({ errorCode: 'GIT_REPOSITORY_NOT_FOUND', kind: 'failed' });
      }
    } catch (error) {
      return mapFilesystemFailure(error);
    }

    return Object.freeze({ directory: selectedDirectory, kind: 'found' });
  };

// default starting-directory inspection boundary
export const inspectGitStartingDirectory = createGitStartingDirectoryInspector();
