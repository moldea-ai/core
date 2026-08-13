// @vitest-environment node
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';

import { createGitInventoryEntryInspector } from './entry-inspector.js';
import type { IGitInventoryEntryLstat, IGitInventoryEntryStatistics } from './types.js';

/** Creates one minimal no-follow stat fixture. */
const createStatistics = (
  entryType: 'directory' | 'file' | 'symlink',
): IGitInventoryEntryStatistics => ({
  isFile: () => entryType === 'file',
  isSymbolicLink: () => entryType === 'symlink',
});

/** Creates one filesystem error fixture with a stable Node error code. */
const createFilesystemError = (code: string): NodeJS.ErrnoException =>
  Object.assign(new Error('private host diagnostic'), { code });

describe('createGitInventoryEntryInspector', () => {
  test.each([
    ['file', 'file'],
    ['symlink', 'symlink'],
    ['directory', 'unsupported'],
  ] as const)('classifies a no-follow %s as %s', async (hostType, entryType) => {
    const inspectEntry = vi
      .fn<IGitInventoryEntryLstat>()
      .mockResolvedValue(createStatistics(hostType));
    const inspectCandidate = createGitInventoryEntryInspector(inspectEntry);

    await expect(inspectCandidate('/repository', 'nested/entry')).resolves.toStrictEqual({
      entryType,
      kind: 'inspected',
    });
    expect(inspectEntry).toHaveBeenCalledWith(path.join('/repository', 'nested/entry'));
  });

  test.each(['ENOENT', 'ENOTDIR'])('treats %s as a missing current entry', async (code) => {
    const inspectEntry = vi
      .fn<IGitInventoryEntryLstat>()
      .mockRejectedValue(createFilesystemError(code));
    const inspectCandidate = createGitInventoryEntryInspector(inspectEntry);

    await expect(inspectCandidate('/repository', 'missing')).resolves.toStrictEqual({
      kind: 'missing',
    });
  });

  test.each([
    ['EACCES', 'GIT_ACCESS_DENIED'],
    ['EPERM', 'GIT_ACCESS_DENIED'],
    ['ELOOP', 'GIT_OUTPUT_INVALID'],
    ['EIO', 'GIT_COMMAND_FAILED'],
  ] as const)('maps %s to %s without host diagnostics', async (code, errorCode) => {
    const inspectEntry = vi
      .fn<IGitInventoryEntryLstat>()
      .mockRejectedValue(createFilesystemError(code));
    const inspectCandidate = createGitInventoryEntryInspector(inspectEntry);

    await expect(inspectCandidate('/private', 'entry')).resolves.toStrictEqual({
      errorCode,
      kind: 'failed',
    });
  });
});
