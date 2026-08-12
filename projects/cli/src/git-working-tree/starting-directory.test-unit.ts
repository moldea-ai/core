// @vitest-environment node
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';

import { createGitStartingDirectoryInspector } from './starting-directory.js';
import type { IGitStartingDirectoryStat } from './types.js';

const INVOCATION_DIRECTORY = path.resolve('workspace');

describe('createGitStartingDirectoryInspector', () => {
  test('uses the invocation directory when no repository path is selected', async () => {
    const inspectPath = vi
      .fn<IGitStartingDirectoryStat>()
      .mockResolvedValue({ isDirectory: () => true });
    const inspectStartingDirectory = createGitStartingDirectoryInspector(inspectPath);

    const result = await inspectStartingDirectory({
      invocationDirectory: INVOCATION_DIRECTORY,
      repositoryDirectory: null,
    });

    expect(result).toStrictEqual({ directory: INVOCATION_DIRECTORY, kind: 'found' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(inspectPath).toHaveBeenCalledWith(INVOCATION_DIRECTORY);
  });

  test('resolves a relative repository path against the invocation directory', async () => {
    const inspectPath = vi
      .fn<IGitStartingDirectoryStat>()
      .mockResolvedValue({ isDirectory: () => true });
    const inspectStartingDirectory = createGitStartingDirectoryInspector(inspectPath);
    const expectedDirectory = path.resolve(INVOCATION_DIRECTORY, 'nested', 'repository');

    await expect(
      inspectStartingDirectory({
        invocationDirectory: INVOCATION_DIRECTORY,
        repositoryDirectory: path.join('nested', 'repository'),
      }),
    ).resolves.toStrictEqual({ directory: expectedDirectory, kind: 'found' });
  });

  test('preserves an absolute selected repository path', async () => {
    const inspectPath = vi
      .fn<IGitStartingDirectoryStat>()
      .mockResolvedValue({ isDirectory: () => true });
    const inspectStartingDirectory = createGitStartingDirectoryInspector(inspectPath);
    const selectedDirectory = path.join(path.resolve('selected'), '..', 'repository');

    await expect(
      inspectStartingDirectory({
        invocationDirectory: INVOCATION_DIRECTORY,
        repositoryDirectory: selectedDirectory,
      }),
    ).resolves.toStrictEqual({ directory: selectedDirectory, kind: 'found' });
    expect(inspectPath).toHaveBeenCalledWith(selectedDirectory);
  });

  test('rejects a regular file as a repository starting directory', async () => {
    const inspectPath = vi
      .fn<IGitStartingDirectoryStat>()
      .mockResolvedValue({ isDirectory: () => false });

    await expect(
      createGitStartingDirectoryInspector(inspectPath)({
        invocationDirectory: INVOCATION_DIRECTORY,
        repositoryDirectory: null,
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_REPOSITORY_NOT_FOUND', kind: 'failed' });
  });

  test.each([
    ['ENOENT', 'GIT_REPOSITORY_NOT_FOUND'],
    ['ENOTDIR', 'GIT_REPOSITORY_NOT_FOUND'],
    ['EACCES', 'GIT_ACCESS_DENIED'],
    ['EPERM', 'GIT_ACCESS_DENIED'],
    ['EIO', 'GIT_COMMAND_FAILED'],
  ] as const)('normalizes filesystem failure %s', async (code, errorCode) => {
    const inspectPath = vi
      .fn<IGitStartingDirectoryStat>()
      .mockRejectedValue(Object.assign(new Error('private path diagnostic'), { code }));
    const result = await createGitStartingDirectoryInspector(inspectPath)({
      invocationDirectory: INVOCATION_DIRECTORY,
      repositoryDirectory: null,
    });

    expect(result).toStrictEqual({ errorCode, kind: 'failed' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(JSON.stringify(result)).not.toContain('private');
  });

  test.each([
    ['relative invocation directory', 'relative', null],
    ['NUL in invocation directory', `${INVOCATION_DIRECTORY}\0private`, null],
    ['invalid selected directory', INVOCATION_DIRECTORY, '\ud800'],
  ] as const)(
    'rejects %s before filesystem access',
    async (_description, invocationDirectory, repositoryDirectory) => {
      const inspectPath = vi.fn<IGitStartingDirectoryStat>();

      await expect(
        createGitStartingDirectoryInspector(inspectPath)({
          invocationDirectory,
          repositoryDirectory,
        }),
      ).resolves.toStrictEqual({ errorCode: 'GIT_REPOSITORY_NOT_FOUND', kind: 'failed' });
      expect(inspectPath).not.toHaveBeenCalled();
    },
  );
});
