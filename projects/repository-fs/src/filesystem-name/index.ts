import { TextDecoder } from 'node:util';

import {
  RepositoryPathException,
  parseRepositoryPath,
  type IRepositoryPath,
} from '@moldea.ai/repository';

import { throwFilesystemRepositoryCreationException } from '../source-exception/index.js';

const filesystemNameDecoder = new TextDecoder('utf-8', {
  fatal: true,
  ignoreBOM: true,
});

/**
 * Decodes one native filesystem name into a lossless logical path segment.
 * @param encodedName The raw name bytes returned by the host filesystem API.
 * @param parentPath The nearest safe logical parent for failure metadata.
 * @returns The decoded Unicode-scalar segment without normalization.
 * @throws
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 */
export const decodeFilesystemName = (
  encodedName: Uint8Array,
  parentPath: IRepositoryPath,
): string => {
  let decodedName: string;

  try {
    decodedName = filesystemNameDecoder.decode(encodedName);
  } catch (cause) {
    return throwFilesystemRepositoryCreationException(
      'INVALID_SOURCE_DATA',
      false,
      parentPath,
      cause,
    );
  }

  if (decodedName.includes('/')) {
    return throwFilesystemRepositoryCreationException('INVALID_SOURCE_DATA', false, parentPath);
  }

  const candidatePath = parentPath === '/' ? `/${decodedName}` : `${parentPath}/${decodedName}`;

  try {
    parseRepositoryPath(candidatePath);
  } catch (cause) {
    if (cause instanceof RepositoryPathException) {
      return throwFilesystemRepositoryCreationException(
        'INVALID_SOURCE_DATA',
        false,
        parentPath,
        cause,
      );
    }

    throw cause;
  }

  return decodedName;
};
