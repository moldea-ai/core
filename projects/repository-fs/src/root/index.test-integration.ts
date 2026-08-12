// @vitest-environment node
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expectToRejectCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { RepositorySourceException, parseRepositoryPath } from '@moldea.ai/repository';

import { prepareFilesystemRepositoryRoot } from './index.js';

const createTemporaryDirectory = (): Promise<string> => {
  return mkdtemp(path.join(tmpdir(), 'moldea-repository-fs-root-'));
};

const createDirectoryOptions = (rootDirectory: string): Record<string, unknown> => ({
  rootDirectory,
  selection: { kind: 'directory' },
});

describe('filesystem repository root preparation', () => {
  test('resolves and freezes one existing directory identity', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const preparedRoot = await prepareFilesystemRepositoryRoot(
        createDirectoryOptions(temporaryDirectory),
      );

      expect(preparedRoot.resolvedRootDirectory).toBe(await realpath(temporaryDirectory));
      expect(preparedRoot.options.rootDirectory).toBe(temporaryDirectory);
      expect(Object.isFrozen(preparedRoot)).toBe(true);
      expect(Object.isFrozen(preparedRoot.identity)).toBe(true);
      expect(Object.isFrozen(preparedRoot.options)).toBe(true);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('resolves an explicitly selected symlink or junction root only once', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const firstTarget = path.join(temporaryDirectory, 'first-target');
    const secondTarget = path.join(temporaryDirectory, 'second-target');
    const rootLink = path.join(temporaryDirectory, 'selected-root');

    try {
      const createdFirstTarget = await mkdtemp(`${firstTarget}-`);
      const createdSecondTarget = await mkdtemp(`${secondTarget}-`);

      await symlink(
        createdFirstTarget,
        rootLink,
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      const preparedRoot = await prepareFilesystemRepositoryRoot(createDirectoryOptions(rootLink));

      await unlink(rootLink);
      await symlink(
        createdSecondTarget,
        rootLink,
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      expect(preparedRoot.resolvedRootDirectory).toBe(await realpath(createdFirstTarget));
      expect(preparedRoot.resolvedRootDirectory).not.toBe(await realpath(createdSecondTarget));
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('maps an absent root to the common creation error contract', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const missingRoot = path.join(temporaryDirectory, 'missing-root');

    try {
      await expectToRejectCode(
        prepareFilesystemRepositoryRoot(createDirectoryOptions(missingRoot)),
        'ENTRY_NOT_FOUND',
        'The requested repository entry was not found.',
      );
      await expect(
        prepareFilesystemRepositoryRoot(createDirectoryOptions(missingRoot)),
      ).rejects.toMatchObject({
        operation: 'create-reader',
        path: null,
        retryable: true,
      });
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('maps a regular-file root to the common non-directory contract', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const fileRoot = path.join(temporaryDirectory, 'file-root');

    try {
      await writeFile(fileRoot, 'content', 'utf8');

      await expectToRejectCode(
        prepareFilesystemRepositoryRoot(createDirectoryOptions(fileRoot)),
        'ENTRY_NOT_DIRECTORY',
        'The requested repository entry is not a directory.',
      );
      await expect(
        prepareFilesystemRepositoryRoot(createDirectoryOptions(fileRoot)),
      ).rejects.toMatchObject({
        operation: 'create-reader',
        path: null,
        retryable: false,
      });
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test.skipIf(
    process.platform === 'win32' ||
      typeof process.geteuid !== 'function' ||
      process.geteuid() === 0,
  )('maps an inaccessible root without exposing its host path', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const inaccessibleParent = path.join(temporaryDirectory, 'inaccessible-parent');
    const inaccessibleRoot = path.join(inaccessibleParent, 'repository-root');

    try {
      await mkdir(inaccessibleRoot, { recursive: true });
      await chmod(inaccessibleParent, 0o000);

      const preparation = prepareFilesystemRepositoryRoot(createDirectoryOptions(inaccessibleRoot));

      await expectToRejectCode(
        preparation,
        'ACCESS_DENIED',
        'Access to the repository source was denied.',
      );
      const rejection: unknown = await preparation.then(
        () => new Error('The inaccessible-root preparation unexpectedly succeeded.'),
        (cause: unknown) => cause,
      );

      expect(rejection).toBeInstanceOf(RepositorySourceException);
      expect(rejection).toMatchObject({
        operation: 'create-reader',
        path: null,
        retryable: true,
      });
      expect(JSON.stringify(rejection)).not.toContain(inaccessibleRoot);
      expect(Object.keys(rejection as RepositorySourceException)).not.toContain('cause');
    } finally {
      await chmod(inaccessibleParent, 0o700).catch(() => undefined);
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('honors an already-aborted signal before touching a missing root', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const controller = new AbortController();

    controller.abort('stop-before-filesystem-work');

    try {
      await expectToRejectCode(
        prepareFilesystemRepositoryRoot({
          ...createDirectoryOptions(path.join(temporaryDirectory, 'missing-root')),
          signal: controller.signal,
        }),
        'ABORTED',
        'The repository operation was aborted.',
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('isolates in-progress root preparation from caller option mutation', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const selectedPaths = [parseRepositoryPath('/zeta.txt')];
    const limits = { maxEntries: 4 };
    const selection = { kind: 'paths', paths: selectedPaths };
    const options = { limits, rootDirectory: temporaryDirectory, selection };

    try {
      const preparation = prepareFilesystemRepositoryRoot(options);

      options.rootDirectory = path.join(temporaryDirectory, 'missing-root');
      limits.maxEntries = 8;
      selection.kind = 'directory';
      selectedPaths.push(parseRepositoryPath('/later.txt'));

      const preparedRoot = await preparation;

      expect(preparedRoot.options.rootDirectory).toBe(temporaryDirectory);
      expect(preparedRoot.options.limits.maxEntries).toBe(4);
      expect(preparedRoot.options.selection).toStrictEqual({
        kind: 'paths',
        paths: [parseRepositoryPath('/zeta.txt')],
      });
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('does not serialize an invalid host root through safe exception fields', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const missingRoot = path.join(temporaryDirectory, 'private-host-root');

    try {
      await expectToRejectCode(
        prepareFilesystemRepositoryRoot(createDirectoryOptions(missingRoot)),
        'ENTRY_NOT_FOUND',
      );

      let rejection: unknown;

      try {
        await prepareFilesystemRepositoryRoot(createDirectoryOptions(missingRoot));
      } catch (cause) {
        rejection = cause;
      }

      expect(rejection).toBeInstanceOf(RepositorySourceException);
      expect(JSON.stringify(rejection)).not.toContain(missingRoot);
      expect(Object.keys(rejection as RepositorySourceException)).not.toContain('cause');
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
