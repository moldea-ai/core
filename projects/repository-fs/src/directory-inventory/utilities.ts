import { Buffer } from 'node:buffer';

import { parseRepositoryPath, type IRepositoryPath } from '@moldea.ai/repository';

import { decodeFilesystemName } from '../filesystem-name/index.js';
import type { IFilesystemDirectoryIdentity } from '../filesystem-fingerprint/index.js';
import { throwFilesystemRepositoryCreationException } from '../source-exception/index.js';
import { FILESYSTEM_GIT_CONTROL_ENTRY_NAME } from './constants.js';
import type { IFilesystemDirectoryEntryCandidate } from './types.js';

const gitControlEntryNameBytes = Buffer.from(FILESYSTEM_GIT_CONTROL_ENTRY_NAME, 'utf8');

/**
 * Decodes and orders one directory's complete eligible child-name set.
 * @param encodedNames The raw host names in arbitrary enumeration order.
 * @param parentPath The safe logical directory containing the names.
 * @returns Frozen non-control candidates ordered by exact logical path.
 * @throws
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 */
export const createFilesystemDirectoryEntryCandidates = (
  encodedNames: readonly Buffer[],
  parentPath: IRepositoryPath,
): readonly IFilesystemDirectoryEntryCandidate[] => {
  const candidatesByPath = new Map<IRepositoryPath, IFilesystemDirectoryEntryCandidate>();

  for (const encodedName of encodedNames) {
    if (encodedName.equals(gitControlEntryNameBytes)) {
      continue;
    }

    const hostName = decodeFilesystemName(encodedName, parentPath);
    const logicalPath = parseRepositoryPath(
      parentPath === '/' ? `/${hostName}` : `${parentPath}/${hostName}`,
    );

    if (candidatesByPath.has(logicalPath)) {
      return throwFilesystemRepositoryCreationException('INVALID_SOURCE_DATA', false, logicalPath);
    }

    candidatesByPath.set(
      logicalPath,
      Object.freeze({
        hostName,
        path: logicalPath,
      }),
    );
  }

  const candidates = [...candidatesByPath.values()].sort((firstCandidate, secondCandidate) => {
    if (firstCandidate.path < secondCandidate.path) {
      return -1;
    }

    return firstCandidate.path > secondCandidate.path ? 1 : 0;
  });

  return Object.freeze(candidates);
};

/**
 * Registers one traversable directory identity and rejects a repeated physical directory.
 * @param registeredIdentityKeys The identities already reachable in the traversal.
 * @param identity The directory identity to register.
 * @param logicalPath The safe logical path represented by the directory.
 * @mutates registeredIdentityKeys
 * @throws
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 */
export const registerFilesystemDirectoryIdentity = (
  registeredIdentityKeys: Set<string>,
  identity: IFilesystemDirectoryIdentity,
  logicalPath: IRepositoryPath,
): void => {
  const identityKey = `${identity.device}:${identity.inode}:${identity.birthtimeNanoseconds}`;

  if (registeredIdentityKeys.has(identityKey)) {
    return throwFilesystemRepositoryCreationException('INVALID_SOURCE_DATA', false, logicalPath);
  }

  registeredIdentityKeys.add(identityKey);
};
