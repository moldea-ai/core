import type { IRepositoryEntryType, IRepositoryPath } from '@moldea.ai/repository';

import { throwFilesystemRepositoryCreationException } from '../source-exception/index.js';

interface IFilesystemEntryClassificationSource {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
}

/**
 * Classifies one no-follow filesystem observation into the common entry model.
 * @param statistics The lstat-equivalent entry observation.
 * @param logicalPath The safe logical path represented by the observation.
 * @returns The supported common repository entry type.
 * @throws
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 */
export const classifyFilesystemEntry = (
  statistics: IFilesystemEntryClassificationSource,
  logicalPath: IRepositoryPath,
): IRepositoryEntryType => {
  if (statistics.isFile()) {
    return 'file';
  }

  if (statistics.isDirectory()) {
    return 'directory';
  }

  if (statistics.isSymbolicLink()) {
    return 'symlink';
  }

  return throwFilesystemRepositoryCreationException('INVALID_SOURCE_DATA', false, logicalPath);
};
