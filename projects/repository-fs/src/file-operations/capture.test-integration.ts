// @vitest-environment node
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expectToRejectCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { RepositorySourceException, parseRepositoryPath } from '@moldea.ai/repository';

import { prepareFilesystemRepositoryRoot } from '../root/index.js';
import { createVerifiedFilesystemInventory } from '../verified-inventory/index.js';
import { FILESYSTEM_FILE_READ_CHUNK_BYTES } from './constants.js';
import { createFilesystemRepositoryFileReadState, readFilesystemRepositoryFile } from './index.js';

const createTemporaryDirectory = (): Promise<string> => {
  return mkdtemp(path.join(tmpdir(), 'moldea-repository-fs-file-capture-'));
};

const createDirectoryState = async (rootDirectory: string) => {
  const preparedRoot = await prepareFilesystemRepositoryRoot({
    rootDirectory,
    selection: { kind: 'directory' },
  });
  const inventory = await createVerifiedFilesystemInventory(preparedRoot);

  return createFilesystemRepositoryFileReadState(preparedRoot, inventory);
};

describe('verified filesystem file capture', () => {
  test.each([
    ['delete', 'delete'],
    ['same-size in-place mutation', 'mutate'],
    ['atomic replacement', 'replace'],
  ] as const)('rejects %s before first capture', async (_description, mutation) => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const filePath = path.join(temporaryDirectory, 'file.bin');
      const replacedPath = path.join(temporaryDirectory, 'file.old.bin');

      await writeFile(filePath, Uint8Array.from([1, 2, 3, 4]));

      const state = await createDirectoryState(temporaryDirectory);
      const logicalPath = parseRepositoryPath('/file.bin');

      if (mutation === 'delete') {
        await rm(filePath);
      } else if (mutation === 'mutate') {
        await writeFile(filePath, Uint8Array.from([4, 3, 2, 1]));
      } else {
        await rename(filePath, replacedPath);
        await writeFile(filePath, Uint8Array.from([1, 2, 3, 4]));
      }

      const read = readFilesystemRepositoryFile(state, logicalPath);

      await expectToRejectCode(read, 'SNAPSHOT_CHANGED');
      await expect(read).rejects.toBeInstanceOf(RepositorySourceException);
      await expect(read).rejects.toMatchObject({
        operation: 'read-file',
        path: logicalPath,
        retryable: true,
      });
      expect(state.cache.cachedByteCount).toBe(0);
      expect(state.cache.filesByPath.has(logicalPath)).toBe(false);
      expect(JSON.stringify(await read.catch((error: unknown) => error))).not.toContain(
        temporaryDirectory,
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('rejects replacement of a required parent directory', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const nestedDirectory = path.join(temporaryDirectory, 'nested');
      const movedDirectory = path.join(temporaryDirectory, 'nested-old');

      await mkdir(nestedDirectory);
      await writeFile(path.join(nestedDirectory, 'file.bin'), Uint8Array.from([1, 2, 3]));

      const state = await createDirectoryState(temporaryDirectory);
      const logicalPath = parseRepositoryPath('/nested/file.bin');

      await rename(nestedDirectory, movedDirectory);
      await mkdir(nestedDirectory);
      await writeFile(path.join(nestedDirectory, 'file.bin'), Uint8Array.from([1, 2, 3]));

      const read = readFilesystemRepositoryFile(state, logicalPath);

      await expectToRejectCode(read, 'SNAPSHOT_CHANGED');
      expect(state.cache.cachedByteCount).toBe(0);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test.skipIf(process.platform === 'win32')(
    'never follows a symlink substituted for the frozen file',
    async () => {
      const temporaryDirectory = await createTemporaryDirectory();

      try {
        const filePath = path.join(temporaryDirectory, 'file.bin');

        await writeFile(filePath, Uint8Array.from([1, 2, 3]));
        await writeFile(path.join(temporaryDirectory, 'outside.bin'), Uint8Array.from([9, 9, 9]));

        const state = await createDirectoryState(temporaryDirectory);
        const logicalPath = parseRepositoryPath('/file.bin');

        await rm(filePath);
        await symlink('outside.bin', filePath);

        const read = readFilesystemRepositoryFile(state, logicalPath);

        await expectToRejectCode(read, 'SNAPSHOT_CHANGED');
        expect(state.cache.cachedByteCount).toBe(0);
      } finally {
        await rm(temporaryDirectory, { force: true, recursive: true });
      }
    },
  );

  test('discards bytes when the file changes during capture', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const filePath = path.join(temporaryDirectory, 'large.bin');
      const originalBytes = new Uint8Array(FILESYSTEM_FILE_READ_CHUNK_BYTES * 2).fill(1);
      const replacementBytes = new Uint8Array(originalBytes.byteLength).fill(2);

      await writeFile(filePath, originalBytes);

      const state = await createDirectoryState(temporaryDirectory);
      const logicalPath = parseRepositoryPath('/large.bin');
      let hasMutated = false;
      const read = readFilesystemRepositoryFile(state, logicalPath, undefined, {
        afterReadChunk: async () => {
          if (hasMutated) {
            return;
          }

          hasMutated = true;
          await writeFile(filePath, replacementBytes);
        },
      });

      await expectToRejectCode(read, 'SNAPSHOT_CHANGED');
      expect(state.cache.cachedByteCount).toBe(0);
      expect(state.cache.filesByPath.has(logicalPath)).toBe(false);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('cancels a coherent capture without committing partial bytes', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const filePath = path.join(temporaryDirectory, 'large.bin');
      const originalBytes = new Uint8Array(FILESYSTEM_FILE_READ_CHUNK_BYTES * 2).fill(3);

      await writeFile(filePath, originalBytes);

      const state = await createDirectoryState(temporaryDirectory);
      const logicalPath = parseRepositoryPath('/large.bin');
      const controller = new AbortController();
      let hasAborted = false;
      const read = readFilesystemRepositoryFile(
        state,
        logicalPath,
        { signal: controller.signal },
        {
          afterReadChunk: () => {
            if (!hasAborted) {
              hasAborted = true;
              controller.abort('stop-capture');
            }
          },
        },
      );

      await expectToRejectCode(read, 'ABORTED');
      await expect(read).rejects.toMatchObject({
        operation: 'read-file',
        path: logicalPath,
        retryable: false,
      });
      expect(state.cache.cachedByteCount).toBe(0);
      expect(state.cache.filesByPath.has(logicalPath)).toBe(false);

      await expect(readFilesystemRepositoryFile(state, logicalPath)).resolves.toStrictEqual(
        originalBytes,
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('prefers snapshot loss when cancellation and mutation overlap', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const filePath = path.join(temporaryDirectory, 'large.bin');
      const originalBytes = new Uint8Array(FILESYSTEM_FILE_READ_CHUNK_BYTES * 2).fill(4);
      const replacementBytes = new Uint8Array(originalBytes.byteLength).fill(5);

      await writeFile(filePath, originalBytes);

      const state = await createDirectoryState(temporaryDirectory);
      const logicalPath = parseRepositoryPath('/large.bin');
      const controller = new AbortController();
      let hasMutated = false;
      const read = readFilesystemRepositoryFile(
        state,
        logicalPath,
        { signal: controller.signal },
        {
          afterReadChunk: async () => {
            if (hasMutated) {
              return;
            }

            hasMutated = true;
            await writeFile(filePath, replacementBytes);
            controller.abort('stop-changed-capture');
          },
        },
      );

      await expectToRejectCode(read, 'SNAPSHOT_CHANGED');
      expect(state.cache.cachedByteCount).toBe(0);
      expect(state.cache.filesByPath.has(logicalPath)).toBe(false);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
