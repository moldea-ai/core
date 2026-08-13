import { lstat } from 'node:fs/promises';
import path from 'node:path';

import type { IGitInventoryProbeErrorCode } from '../types.js';

import type {
  IGitInventoryEntryInspector,
  IGitInventoryEntryLstat,
  IGitInventoryHostEntryInspectionFailedResult,
  IGitInventoryHostEntryInspectionResult,
} from './types.js';

/** Creates one immutable host entry inspection failure. */
const createInspectionFailure = (
  errorCode: IGitInventoryProbeErrorCode,
): IGitInventoryHostEntryInspectionFailedResult => Object.freeze({ errorCode, kind: 'failed' });

/** Maps an unknown no-follow filesystem failure without retaining host diagnostics. */
const mapFilesystemFailure = (
  error: unknown,
): IGitInventoryHostEntryInspectionFailedResult | null => {
  const errorCode = (error as NodeJS.ErrnoException | null)?.code?.toUpperCase();

  if (errorCode === 'ENOENT' || errorCode === 'ENOTDIR') {
    return null;
  }

  if (errorCode === 'EACCES' || errorCode === 'EPERM') {
    return createInspectionFailure('GIT_ACCESS_DENIED');
  }

  if (errorCode === 'ELOOP') {
    return createInspectionFailure('GIT_OUTPUT_INVALID');
  }

  return createInspectionFailure('GIT_COMMAND_FAILED');
};

/** Default no-follow stat boundary for current inventory entries. */
const inspectHostEntry: IGitInventoryEntryLstat = async (hostPath) => lstat(hostPath);

/**
 * Creates current host entry inspection around an injectable no-follow stat boundary.
 * @param inspectEntry The no-follow filesystem stat operation.
 * @returns An inspector for one ownership-filtered candidate path.
 */
export const createGitInventoryEntryInspector = (
  inspectEntry: IGitInventoryEntryLstat = inspectHostEntry,
): IGitInventoryEntryInspector => {
  return async (repositoryRoot, candidatePath): Promise<IGitInventoryHostEntryInspectionResult> => {
    let statistics: Awaited<ReturnType<IGitInventoryEntryLstat>>;

    try {
      statistics = await inspectEntry(path.join(repositoryRoot, candidatePath));
    } catch (error) {
      const failure = mapFilesystemFailure(error);

      return failure ?? Object.freeze({ kind: 'missing' });
    }

    if (statistics.isSymbolicLink()) {
      return Object.freeze({ entryType: 'symlink', kind: 'inspected' });
    }

    if (statistics.isFile()) {
      return Object.freeze({ entryType: 'file', kind: 'inspected' });
    }

    return Object.freeze({ entryType: 'unsupported', kind: 'inspected' });
  };
};

// default no-follow current host entry inspector
export const inspectGitInventoryEntry = createGitInventoryEntryInspector();
