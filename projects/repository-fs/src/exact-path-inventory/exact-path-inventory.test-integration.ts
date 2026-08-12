// @vitest-environment node
import { Buffer } from 'node:buffer';
import type { BigIntStats } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { lstat, mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expectToRejectCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath, type IRepositoryPath } from '@moldea.ai/repository';

import { createFilesystemExactPathSelectionPlan } from '../exact-path-selection/index.js';
import type { IFilesystemInventory } from '../inventory/index.js';
import { prepareFilesystemRepositoryRoot } from '../root/index.js';
import { createFilesystemExactPathInventory } from './index.js';

const createTemporaryDirectory = (): Promise<string> => {
  return mkdtemp(path.join(tmpdir(), 'moldea-repository-fs-exact-'));
};

const createInventory = async (
  rootDirectory: string,
  selectedPaths: readonly IRepositoryPath[],
  maxEntries = 100_000,
): Promise<IFilesystemInventory> => {
  const preparedRoot = await prepareFilesystemRepositoryRoot({
    limits: { maxEntries },
    rootDirectory,
    selection: { kind: 'paths', paths: selectedPaths },
  });

  if (preparedRoot.options.selection.kind !== 'paths') {
    throw new Error('Expected normalized exact-path selection.');
  }

  const selectionPlan = createFilesystemExactPathSelectionPlan(
    preparedRoot.options.selection,
    preparedRoot.options.limits.maxEntries,
  );

  return createFilesystemExactPathInventory(preparedRoot, selectionPlan);
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

describe('filesystem exact-path inventory construction', () => {
  test('creates a frozen root-only inventory without enumerating descendants', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await writeFile(path.join(temporaryDirectory, 'unselected.txt'), 'unselected', 'utf8');

      const inventory = await createInventory(temporaryDirectory, []);

      expect(inventory.entries).toStrictEqual([
        {
          hostPath: await realpath(temporaryDirectory),
          path: parseRepositoryPath('/'),
          type: 'directory',
        },
      ]);
      expect(Object.isFrozen(inventory)).toBe(true);
      expect(Object.isFrozen(inventory.entries)).toBe(true);
      expect(inventory.entries.every(Object.isFrozen)).toBe(true);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('classifies selected entries, synthesizes parents, and does not recurse into directories', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const sourceDirectory = path.join(temporaryDirectory, 'src');
    const selectedDirectory = path.join(temporaryDirectory, 'selected-directory');
    const redirectTarget = path.join(temporaryDirectory, 'redirect-target');
    const redirectPath = path.join(temporaryDirectory, 'redirect');

    try {
      await mkdir(sourceDirectory);
      await mkdir(selectedDirectory);
      await mkdir(redirectTarget);
      await writeFile(path.join(sourceDirectory, 'file.ts'), 'export {};', 'utf8');
      await writeFile(path.join(selectedDirectory, 'unselected.txt'), 'unselected', 'utf8');
      await symlink(
        redirectTarget,
        redirectPath,
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      const inventory = await createInventory(temporaryDirectory, [
        parseRepositoryPath('/src/file.ts'),
        parseRepositoryPath('/selected-directory'),
        parseRepositoryPath('/redirect'),
      ]);

      expect(
        inventory.entries.map(({ path: logicalPath, type }) => ({ logicalPath, type })),
      ).toStrictEqual([
        { logicalPath: parseRepositoryPath('/'), type: 'directory' },
        { logicalPath: parseRepositoryPath('/redirect'), type: 'symlink' },
        { logicalPath: parseRepositoryPath('/selected-directory'), type: 'directory' },
        { logicalPath: parseRepositoryPath('/src'), type: 'directory' },
        { logicalPath: parseRepositoryPath('/src/file.ts'), type: 'file' },
      ]);
      expect(inventory.entries.some((entry) => entry.path.endsWith('/unselected.txt'))).toBe(false);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('resolves exact multibyte Unicode directory and file names', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const directoryName = '项目-😀';
    const fileName = '配置-λ.yaml';
    const logicalDirectoryPath = parseRepositoryPath(`/${directoryName}`);
    const logicalFilePath = parseRepositoryPath(`/${directoryName}/${fileName}`);

    try {
      await mkdir(path.join(temporaryDirectory, directoryName));
      await writeFile(
        path.join(temporaryDirectory, directoryName, fileName),
        'unicode-content',
        'utf8',
      );

      const inventory = await createInventory(temporaryDirectory, [logicalFilePath]);

      expect(
        inventory.entries.map(({ path: logicalPath, type }) => ({ logicalPath, type })),
      ).toStrictEqual([
        { logicalPath: parseRepositoryPath('/'), type: 'directory' },
        { logicalPath: logicalDirectoryPath, type: 'directory' },
        { logicalPath: logicalFilePath, type: 'file' },
      ]);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('produces equivalent logical inventories regardless of selected-path order', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const firstPath = parseRepositoryPath('/first.txt');
    const secondPath = parseRepositoryPath('/nested/second.txt');

    try {
      await mkdir(path.join(temporaryDirectory, 'nested'));
      await writeFile(path.join(temporaryDirectory, 'first.txt'), 'first', 'utf8');
      await writeFile(path.join(temporaryDirectory, 'nested', 'second.txt'), 'second', 'utf8');

      const firstInventory = await createInventory(temporaryDirectory, [secondPath, firstPath]);
      const secondInventory = await createInventory(temporaryDirectory, [firstPath, secondPath]);

      expect(firstInventory).toStrictEqual(secondInventory);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('treats synthesized and explicitly selected parents identically', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const parentPath = parseRepositoryPath('/parent');
    const childPath = parseRepositoryPath('/parent/child.txt');

    try {
      await mkdir(path.join(temporaryDirectory, 'parent'));
      await writeFile(path.join(temporaryDirectory, 'parent', 'child.txt'), 'child', 'utf8');

      const synthesizedInventory = await createInventory(temporaryDirectory, [childPath]);
      const explicitInventory = await createInventory(temporaryDirectory, [parentPath, childPath]);

      expect(synthesizedInventory).toStrictEqual(explicitInventory);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test.each([
    ['/missing.txt', 'present.txt'],
    ['/case.txt', 'Case.txt'],
  ])('rejects absent exact spelling %s when the source contains %s', async (selected, actual) => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await writeFile(path.join(temporaryDirectory, actual), 'content', 'utf8');

      await expectToRejectCode(
        createInventory(temporaryDirectory, [parseRepositoryPath(selected)]),
        'ENTRY_NOT_FOUND',
        'The requested repository entry was not found.',
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('rejects Unicode-normalization spelling mismatches without correcting them', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const composedName = 'é.txt';
    const decomposedName = 'é.txt';

    try {
      await writeFile(path.join(temporaryDirectory, composedName), 'content', 'utf8');

      const [encodedActualName] = await readdir(temporaryDirectory, { encoding: 'buffer' });

      if (encodedActualName === undefined) {
        throw new Error('Expected the normalization fixture to exist.');
      }

      const actualName = new TextDecoder('utf-8', { fatal: true }).decode(encodedActualName);
      const mismatchedName = actualName === composedName ? decomposedName : composedName;

      await expectToRejectCode(
        createInventory(temporaryDirectory, [parseRepositoryPath(`/${mismatchedName}`)]),
        'ENTRY_NOT_FOUND',
        'The requested repository entry was not found.',
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test.skipIf(process.platform !== 'win32' && process.platform !== 'darwin')(
    'rejects selected case variants that collapse onto one host entry',
    async () => {
      const temporaryDirectory = await createTemporaryDirectory();
      const actualName = 'Case-Sensitive.txt';
      const aliasName = 'case-sensitive.txt';

      try {
        await writeFile(path.join(temporaryDirectory, actualName), 'content', 'utf8');

        const actualStatistics = await lstat(path.join(temporaryDirectory, actualName), {
          bigint: true,
        });
        let aliasStatistics: BigIntStats;

        try {
          aliasStatistics = await lstat(path.join(temporaryDirectory, aliasName), {
            bigint: true,
          });
        } catch (cause) {
          if (
            typeof cause === 'object' &&
            cause !== null &&
            'code' in cause &&
            cause.code === 'ENOENT'
          ) {
            return;
          }

          throw cause;
        }

        expect({ device: aliasStatistics.dev, inode: aliasStatistics.ino }).toStrictEqual({
          device: actualStatistics.dev,
          inode: actualStatistics.ino,
        });
        await expectToRejectCode(
          createInventory(temporaryDirectory, [
            parseRepositoryPath(`/${actualName}`),
            parseRepositoryPath(`/${aliasName}`),
          ]),
          'INVALID_SOURCE_DATA',
          'The repository source returned invalid data.',
        );
      } finally {
        await rm(temporaryDirectory, { force: true, recursive: true });
      }
    },
  );

  test.skipIf(process.platform !== 'darwin')(
    'rejects selected normalization variants that collapse onto one host entry',
    async () => {
      const temporaryDirectory = await createTemporaryDirectory();
      const composedName = 'é-collision.txt';
      const decomposedName = 'é-collision.txt';

      try {
        await writeFile(path.join(temporaryDirectory, composedName), 'content', 'utf8');

        const composedStatistics = await lstat(path.join(temporaryDirectory, composedName), {
          bigint: true,
        });
        let decomposedStatistics: BigIntStats;

        try {
          decomposedStatistics = await lstat(path.join(temporaryDirectory, decomposedName), {
            bigint: true,
          });
        } catch (cause) {
          if (
            typeof cause === 'object' &&
            cause !== null &&
            'code' in cause &&
            cause.code === 'ENOENT'
          ) {
            return;
          }

          throw cause;
        }

        expect({ device: decomposedStatistics.dev, inode: decomposedStatistics.ino }).toStrictEqual(
          {
            device: composedStatistics.dev,
            inode: composedStatistics.ino,
          },
        );
        await expectToRejectCode(
          createInventory(temporaryDirectory, [
            parseRepositoryPath(`/${composedName}`),
            parseRepositoryPath(`/${decomposedName}`),
          ]),
          'INVALID_SOURCE_DATA',
          'The repository source returned invalid data.',
        );
      } finally {
        await rm(temporaryDirectory, { force: true, recursive: true });
      }
    },
  );

  test('rejects descendants beneath files and redirects without following them', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const redirectTarget = path.join(temporaryDirectory, 'redirect-target');
    const redirectPath = path.join(temporaryDirectory, 'redirect');

    try {
      await writeFile(path.join(temporaryDirectory, 'regular-file'), 'content', 'utf8');
      await mkdir(redirectTarget);
      await writeFile(path.join(redirectTarget, 'secret.txt'), 'secret', 'utf8');
      await symlink(
        redirectTarget,
        redirectPath,
        process.platform === 'win32' ? 'junction' : 'dir',
      );

      await expectToRejectCode(
        createInventory(temporaryDirectory, [parseRepositoryPath('/regular-file/child')]),
        'ENTRY_NOT_DIRECTORY',
        'The requested repository entry is not a directory.',
      );
      await expectToRejectCode(
        createInventory(temporaryDirectory, [parseRepositoryPath('/redirect/secret.txt')]),
        'INVALID_SOURCE_DATA',
        'The repository source returned invalid data.',
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test.skipIf(process.platform === 'win32')(
    'allows a selected broken symlink without resolving its target',
    async () => {
      const temporaryDirectory = await createTemporaryDirectory();

      try {
        await symlink('missing-target', path.join(temporaryDirectory, 'broken-link'));

        const inventory = await createInventory(temporaryDirectory, [
          parseRepositoryPath('/broken-link'),
        ]);

        expect(inventory.entries.at(-1)).toMatchObject({
          path: parseRepositoryPath('/broken-link'),
          type: 'symlink',
        });
      } finally {
        await rm(temporaryDirectory, { force: true, recursive: true });
      }
    },
  );

  test.skipIf(process.platform !== 'linux')(
    'ignores an invalid raw sibling when the selected entry is unambiguous',
    async () => {
      const temporaryDirectory = await createTemporaryDirectory();
      const invalidSiblingPath = Buffer.concat([
        Buffer.from(temporaryDirectory),
        Buffer.from(path.sep),
        Buffer.from([0x80]),
      ]);

      try {
        await writeFile(path.join(temporaryDirectory, 'selected.txt'), 'selected', 'utf8');
        await writeFile(invalidSiblingPath, 'invalid-name');

        const inventory = await createInventory(temporaryDirectory, [
          parseRepositoryPath('/selected.txt'),
        ]);

        expect(inventory.entries.at(-1)).toMatchObject({
          path: parseRepositoryPath('/selected.txt'),
          type: 'file',
        });
      } finally {
        await rm(temporaryDirectory, { force: true, recursive: true });
      }
    },
  );

  test.skipIf(process.platform === 'win32')(
    'rejects a selected unsupported socket entry',
    async () => {
      const temporaryDirectory = await createTemporaryDirectory();
      const socketPath = path.join(temporaryDirectory, 'unsupported.sock');
      let server: Server | undefined;

      try {
        server = await listenOnSocketPath(socketPath);

        await expectToRejectCode(
          createInventory(temporaryDirectory, [parseRepositoryPath('/unsupported.sock')]),
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

  test('honors cancellation after root preparation and before inventory traversal', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const controller = new AbortController();

    try {
      await writeFile(path.join(temporaryDirectory, 'selected.txt'), 'selected', 'utf8');

      const preparedRoot = await prepareFilesystemRepositoryRoot({
        rootDirectory: temporaryDirectory,
        selection: { kind: 'paths', paths: [parseRepositoryPath('/selected.txt')] },
        signal: controller.signal,
      });

      if (preparedRoot.options.selection.kind !== 'paths') {
        throw new Error('Expected normalized exact-path selection.');
      }

      const selectionPlan = createFilesystemExactPathSelectionPlan(
        preparedRoot.options.selection,
        preparedRoot.options.limits.maxEntries,
      );

      controller.abort('stop-before-inventory');

      await expectToRejectCode(
        createFilesystemExactPathInventory(preparedRoot, selectionPlan),
        'ABORTED',
        'The repository operation was aborted.',
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('enforces the selected and synthesized entry limit before inventory traversal', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await mkdir(path.join(temporaryDirectory, 'parent'));
      await writeFile(path.join(temporaryDirectory, 'parent', 'child.txt'), 'child', 'utf8');

      await expectToRejectCode(
        createInventory(temporaryDirectory, [parseRepositoryPath('/parent/child.txt')], 1),
        'RESOURCE_LIMIT_EXCEEDED',
        'A repository reading resource limit was exceeded.',
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('does not serialize the private host root through exact-path failures', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      let rejection: unknown;

      try {
        await createInventory(temporaryDirectory, [parseRepositoryPath('/missing.txt')]);
      } catch (cause) {
        rejection = cause;
      }

      expect(rejection).toMatchObject({
        operation: 'create-reader',
        path: parseRepositoryPath('/missing.txt'),
        retryable: true,
      });
      expect(JSON.stringify(rejection)).not.toContain(temporaryDirectory);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
