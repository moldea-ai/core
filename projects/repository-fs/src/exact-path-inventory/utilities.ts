import { Buffer } from 'node:buffer';

import type { IRepositoryPath } from '@moldea.ai/repository';

import type { IFilesystemExactPathSelectionPlanEntry } from '../exact-path-selection/index.js';
import { throwFilesystemRepositoryCreationException } from '../source-exception/index.js';
import type { IFilesystemExactPathDirectoryNameMatch } from './types.js';

const getFilesystemNameEncodingKey = (encodedName: Uint8Array): string => {
  return Buffer.from(encodedName).toString('hex');
};

/**
 * Identifies required children whose exact UTF-8 names were not enumerated.
 * @param encodedNames The host directory names in arbitrary enumeration order.
 * @param requiredEntries The exact logical children required beneath one parent.
 * @returns Frozen missing entries in deterministic required-entry order.
 */
export const getMissingFilesystemExactPathDirectoryEntries = (
  encodedNames: readonly Buffer[],
  requiredEntries: readonly IFilesystemExactPathSelectionPlanEntry[],
): readonly IFilesystemExactPathSelectionPlanEntry[] => {
  const enumeratedEncodingKeys = new Set(
    encodedNames.map((encodedName) => getFilesystemNameEncodingKey(encodedName)),
  );
  const missingEntries = requiredEntries.filter(
    (requiredEntry) =>
      !enumeratedEncodingKeys.has(getFilesystemNameEncodingKey(Buffer.from(requiredEntry.segment))),
  );

  return Object.freeze(missingEntries);
};

/**
 * Matches raw directory names and returns them in deterministic required-entry order.
 * @param encodedNames The host directory names in arbitrary enumeration order.
 * @param requiredEntries The exact logical children required beneath one parent.
 * @param parentPath The safe logical parent used for collision metadata.
 * @returns Frozen matches ordered by required logical entry rather than host enumeration.
 * @throws
 * - ENTRY_NOT_FOUND: The requested repository entry was not found.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 */
export const matchFilesystemExactPathDirectoryNames = (
  encodedNames: readonly Buffer[],
  requiredEntries: readonly IFilesystemExactPathSelectionPlanEntry[],
  parentPath: IRepositoryPath,
): readonly IFilesystemExactPathDirectoryNameMatch[] => {
  const requiredEntriesByEncoding = new Map<string, IFilesystemExactPathSelectionPlanEntry>();

  for (const requiredEntry of requiredEntries) {
    const encodingKey = getFilesystemNameEncodingKey(Buffer.from(requiredEntry.segment));

    if (requiredEntriesByEncoding.has(encodingKey)) {
      return throwFilesystemRepositoryCreationException(
        'INVALID_SOURCE_DATA',
        false,
        requiredEntry.path,
      );
    }

    requiredEntriesByEncoding.set(encodingKey, requiredEntry);
  }

  const encodedNamesByEntry = new Map<IFilesystemExactPathSelectionPlanEntry, Buffer>();

  for (const encodedName of encodedNames) {
    const requiredEntry = requiredEntriesByEncoding.get(getFilesystemNameEncodingKey(encodedName));

    if (requiredEntry === undefined) {
      continue;
    }

    if (encodedNamesByEntry.has(requiredEntry)) {
      return throwFilesystemRepositoryCreationException('INVALID_SOURCE_DATA', false, parentPath);
    }

    encodedNamesByEntry.set(requiredEntry, encodedName);
  }

  const matches = requiredEntries.map((plannedEntry) => {
    const encodedName = encodedNamesByEntry.get(plannedEntry);

    if (encodedName === undefined) {
      return throwFilesystemRepositoryCreationException('ENTRY_NOT_FOUND', true, plannedEntry.path);
    }

    return Object.freeze({ encodedName, plannedEntry });
  });

  return Object.freeze(matches);
};
