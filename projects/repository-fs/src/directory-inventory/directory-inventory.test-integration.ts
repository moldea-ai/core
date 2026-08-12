// @vitest-environment node
import { Buffer } from 'node:buffer';
import { link, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expectToRejectCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import type { IFilesystemInventory } from '../inventory/index.js';
import { prepareFilesystemRepositoryRoot } from '../root/index.js';
import { createFilesystemDirectoryInventory } from './index.js';

const createTemporaryDirectory = (): Promise<string> => {
  return mkdtemp(path.join(tmpdir(), 'moldea-repository-fs-directory-'));
};

const createInventory = async (
  rootDirectory: string,
  maxEntries = 100_000,
): Promise<IFilesystemInventory> => {
  const preparedRoot = await prepareFilesystemRepositoryRoot({
    limits: { maxEntries },
    rootDirectory,
    selection: { kind: 'directory' },
  });

  return createFilesystemDirectoryInventory(preparedRoot);
};

const listenOnSocketPath = (socketPath: string): Promise<Server> => {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once('error', reject);
    server.listen(socketPath, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
};

const closeServer = (server: Server): Promise<void> => {
  return new Promise((resolve, reject) => {
    server.close((cause) => {
      if (cause === undefined) {
        resolve();
      } else {
        reject(cause);
      }
    });
  });
};

describe('filesystem recursive directory inventory construction', () => {
  test('creates one frozen root-only inventory for an empty directory', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const inventory = await createInventory(temporaryDirectory);
      const rootEntry = inventory.entries[0];

      expect(inventory.entries).toHaveLength(1);
      expect(rootEntry).toMatchObject({
        hostPath: await realpath(temporaryDirectory),
        path: parseRepositoryPath('/'),
        type: 'directory',
      });
      expect(rootEntry?.type === 'directory' && Object.isFrozen(rootEntry.identity)).toBe(true);
      expect(Object.isFrozen(inventory)).toBe(true);
      expect(Object.isFrozen(inventory.entries)).toBe(true);
      expect(inventory.entries.every(Object.isFrozen)).toBe(true);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('recursively includes complete raw content in deterministic logical order', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await mkdir(path.join(temporaryDirectory, '.github'));
      await mkdir(path.join(temporaryDirectory, 'nested', 'empty'), { recursive: true });
      await mkdir(path.join(temporaryDirectory, 'node_modules', 'dependency'), {
        recursive: true,
      });
      await writeFile(path.join(temporaryDirectory, '.env'), 'secret-looking', 'utf8');
      await writeFile(path.join(temporaryDirectory, '.gitignore'), 'node_modules', 'utf8');
      await writeFile(path.join(temporaryDirectory, '.github', 'config.yaml'), 'config', 'utf8');
      await writeFile(path.join(temporaryDirectory, 'nested', '项目-😀.txt'), 'unicode', 'utf8');
      await writeFile(
        path.join(temporaryDirectory, 'node_modules', 'dependency', 'index.js'),
        'export {};',
        'utf8',
      );

      const firstInventory = await createInventory(temporaryDirectory);
      const secondInventory = await createInventory(temporaryDirectory);
      const expectedEntries = (
        [
          ['/', 'directory'],
          ['/.env', 'file'],
          ['/.github', 'directory'],
          ['/.github/config.yaml', 'file'],
          ['/.gitignore', 'file'],
          ['/nested', 'directory'],
          ['/nested/empty', 'directory'],
          ['/nested/项目-😀.txt', 'file'],
          ['/node_modules', 'directory'],
          ['/node_modules/dependency', 'directory'],
          ['/node_modules/dependency/index.js', 'file'],
        ] as const
      ).map(([logicalPath, type]) => ({
        path: parseRepositoryPath(logicalPath),
        type,
      }));

      expect(
        firstInventory.entries.map(({ path: logicalPath, type }) => ({
          path: logicalPath,
          type,
        })),
      ).toStrictEqual(expectedEntries);
      expect(firstInventory).toStrictEqual(secondInventory);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('excludes exact .git entries at every depth and for every entry type', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const linkTarget = path.join(temporaryDirectory, 'link-target');

    try {
      await mkdir(path.join(temporaryDirectory, '.git'));
      await mkdir(path.join(temporaryDirectory, 'nested'));
      await mkdir(path.join(temporaryDirectory, 'linked'));
      await mkdir(linkTarget);
      await writeFile(path.join(temporaryDirectory, '.git', 'config'), 'control', 'utf8');
      await writeFile(path.join(temporaryDirectory, 'nested', '.git'), 'control', 'utf8');
      await writeFile(path.join(linkTarget, 'secret.txt'), 'control', 'utf8');
      await symlink(
        linkTarget,
        path.join(temporaryDirectory, 'linked', '.git'),
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      const inventory = await createInventory(temporaryDirectory);

      expect(inventory.entries.some((entry) => entry.path.split('/').includes('.git'))).toBe(false);
      expect(inventory.entries.map((entry) => entry.path)).toContain(
        parseRepositoryPath('/link-target/secret.txt'),
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('preserves non-control names that resemble .git', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await mkdir(path.join(temporaryDirectory, '.GIT'));
      await mkdir(path.join(temporaryDirectory, '.github'));
      await writeFile(path.join(temporaryDirectory, '.GIT', 'config'), 'ordinary', 'utf8');
      await writeFile(path.join(temporaryDirectory, '.gitattributes'), 'ordinary', 'utf8');
      await writeFile(path.join(temporaryDirectory, '.gitignore'), 'ordinary', 'utf8');

      const inventory = await createInventory(temporaryDirectory);

      expect(inventory.entries.map((entry) => entry.path)).toStrictEqual([
        parseRepositoryPath('/'),
        parseRepositoryPath('/.GIT'),
        parseRepositoryPath('/.GIT/config'),
        parseRepositoryPath('/.gitattributes'),
        parseRepositoryPath('/.github'),
        parseRepositoryPath('/.gitignore'),
      ]);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('exposes directory redirects as symlinks without traversing them', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const redirectTarget = path.join(temporaryDirectory, 'redirect-target');
    const redirectPath = path.join(temporaryDirectory, 'redirect');

    try {
      await mkdir(redirectTarget);
      await writeFile(path.join(redirectTarget, 'secret.txt'), 'secret', 'utf8');
      await symlink(
        redirectTarget,
        redirectPath,
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      const inventory = await createInventory(temporaryDirectory);

      expect(inventory.entries).toContainEqual({
        hostPath: redirectPath,
        path: parseRepositoryPath('/redirect'),
        type: 'symlink',
      });
      expect(inventory.entries.some((entry) => entry.path === '/redirect/secret.txt')).toBe(false);
      expect(inventory.entries.some((entry) => entry.path === '/redirect-target/secret.txt')).toBe(
        true,
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test.skipIf(process.platform === 'win32')(
    'includes a broken symlink without resolving its target',
    async () => {
      const temporaryDirectory = await createTemporaryDirectory();

      try {
        await symlink('missing-target', path.join(temporaryDirectory, 'broken-link'));

        const inventory = await createInventory(temporaryDirectory);

        expect(inventory.entries.at(-1)).toMatchObject({
          path: parseRepositoryPath('/broken-link'),
          type: 'symlink',
        });
      } finally {
        await rm(temporaryDirectory, { force: true, recursive: true });
      }
    },
  );

  test('preserves distinct hard-link directory entries', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const firstPath = path.join(temporaryDirectory, 'first.txt');
    const secondPath = path.join(temporaryDirectory, 'second.txt');

    try {
      await writeFile(firstPath, 'shared', 'utf8');
      await link(firstPath, secondPath);

      const inventory = await createInventory(temporaryDirectory);

      expect(
        inventory.entries.map(({ path: logicalPath, type }) => ({ logicalPath, type })),
      ).toStrictEqual([
        { logicalPath: parseRepositoryPath('/'), type: 'directory' },
        { logicalPath: parseRepositoryPath('/first.txt'), type: 'file' },
        { logicalPath: parseRepositoryPath('/second.txt'), type: 'file' },
      ]);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test.skipIf(process.platform !== 'linux')(
    'rejects an invalid raw name because every directory entry is selected',
    async () => {
      const temporaryDirectory = await createTemporaryDirectory();
      const invalidEntryPath = Buffer.concat([
        Buffer.from(temporaryDirectory),
        Buffer.from(path.sep),
        Buffer.from([0x80]),
      ]);

      try {
        await writeFile(invalidEntryPath, 'invalid-name');

        await expectToRejectCode(
          createInventory(temporaryDirectory),
          'INVALID_SOURCE_DATA',
          'The repository source returned invalid data.',
        );
      } finally {
        await rm(temporaryDirectory, { force: true, recursive: true });
      }
    },
  );

  test.skipIf(process.platform === 'win32')(
    'rejects a source name prohibited by the portable logical-path grammar',
    async () => {
      const temporaryDirectory = await createTemporaryDirectory();

      try {
        await writeFile(path.join(temporaryDirectory, 'back\\slash'), 'invalid-name', 'utf8');

        await expectToRejectCode(
          createInventory(temporaryDirectory),
          'INVALID_SOURCE_DATA',
          'The repository source returned invalid data.',
        );
        await expect(createInventory(temporaryDirectory)).rejects.toMatchObject({
          path: parseRepositoryPath('/'),
          retryable: false,
        });
      } finally {
        await rm(temporaryDirectory, { force: true, recursive: true });
      }
    },
  );

  test.skipIf(process.platform === 'win32')(
    'rejects an unsupported socket without returning a partial inventory',
    async () => {
      const temporaryDirectory = await createTemporaryDirectory();
      const socketPath = path.join(temporaryDirectory, 'unsupported.sock');
      let server: Server | undefined;

      try {
        await writeFile(path.join(temporaryDirectory, 'accepted.txt'), 'accepted', 'utf8');
        server = await listenOnSocketPath(socketPath);

        await expectToRejectCode(
          createInventory(temporaryDirectory),
          'INVALID_SOURCE_DATA',
          'The repository source returned invalid data.',
        );
      } finally {
        if (server !== undefined) {
          await closeServer(server);
        }

        await rm(temporaryDirectory, { force: true, recursive: true });
      }
    },
  );

  test('enforces maxEntries without truncating the recursive inventory', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await writeFile(path.join(temporaryDirectory, 'alpha.txt'), 'alpha', 'utf8');
      await writeFile(path.join(temporaryDirectory, 'zeta.txt'), 'zeta', 'utf8');

      const atLimitInventory = await createInventory(temporaryDirectory, 2);

      expect(atLimitInventory.entries.map((entry) => entry.path)).toStrictEqual([
        parseRepositoryPath('/'),
        parseRepositoryPath('/alpha.txt'),
        parseRepositoryPath('/zeta.txt'),
      ]);
      await expectToRejectCode(
        createInventory(temporaryDirectory, 1),
        'RESOURCE_LIMIT_EXCEEDED',
        'A repository reading resource limit was exceeded.',
      );
      await expect(createInventory(temporaryDirectory, 1)).rejects.toMatchObject({
        path: parseRepositoryPath('/zeta.txt'),
        retryable: false,
      });
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('honors cancellation after root preparation and before traversal', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const controller = new AbortController();

    try {
      await writeFile(path.join(temporaryDirectory, 'selected.txt'), 'selected', 'utf8');

      const preparedRoot = await prepareFilesystemRepositoryRoot({
        rootDirectory: temporaryDirectory,
        selection: { kind: 'directory' },
        signal: controller.signal,
      });

      controller.abort('stop-before-directory-inventory');

      await expectToRejectCode(
        createFilesystemDirectoryInventory(preparedRoot),
        'ABORTED',
        'The repository operation was aborted.',
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test.skipIf(process.platform !== 'linux')(
    'does not serialize the private host root through invalid-name failures',
    async () => {
      const temporaryDirectory = await createTemporaryDirectory();
      const invalidEntryPath = Buffer.concat([
        Buffer.from(temporaryDirectory),
        Buffer.from(path.sep),
        Buffer.from([0x80]),
      ]);

      try {
        await writeFile(invalidEntryPath, 'invalid-name');
        let rejection: unknown;

        try {
          await createInventory(temporaryDirectory);
        } catch (cause) {
          rejection = cause;
        }

        expect(rejection).toMatchObject({
          operation: 'create-reader',
          path: parseRepositoryPath('/'),
          retryable: false,
        });
        expect(JSON.stringify(rejection)).not.toContain(temporaryDirectory);
      } finally {
        await rm(temporaryDirectory, { force: true, recursive: true });
      }
    },
  );
});
