// @vitest-environment node
import { mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expectToRejectCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import {
  RepositorySourceException,
  parseRepositoryPath,
  type IRepositoryEntry,
} from '@moldea.ai/repository';

import {
  getFilesystemRepositoryEntry,
  listFilesystemRepositoryEntries,
} from '../inventory-operations/index.js';
import { createFilesystemRepositoryReaderState } from '../reader-state/index.js';
import { prepareFilesystemRepositoryRoot } from '../root/index.js';
import { createVerifiedFilesystemInventory } from '../verified-inventory/index.js';
import { FILESYSTEM_FILE_READ_CHUNK_BYTES } from './constants.js';
import { readFilesystemRepositoryFile } from './index.js';

const createTemporaryDirectory = (): Promise<string> => {
  return mkdtemp(path.join(tmpdir(), 'moldea-repository-fs-file-capture-'));
};

const createDirectoryState = async (rootDirectory: string) => {
  const preparedRoot = await prepareFilesystemRepositoryRoot({
    rootDirectory,
    selection: { kind: 'directory' },
  });
  const inventory = await createVerifiedFilesystemInventory(preparedRoot);

  return createFilesystemRepositoryReaderState(preparedRoot, inventory);
};

const collectEntries = async (
  entries: AsyncIterable<IRepositoryEntry>,
): Promise<IRepositoryEntry[]> => {
  const collectedEntries: IRepositoryEntry[] = [];

  for await (const entry of entries) {
    collectedEntries.push(entry);
  }

  return collectedEntries;
};

describe('verified filesystem file capture', () => {
  test.each([
    ['EACCES', 'ACCESS_DENIED'],
    ['EIO', 'SOURCE_UNAVAILABLE'],
  ] as const)(
    'preserves a coherent reader after stable %s capture failure',
    async (code, expectedCode) => {
      const temporaryDirectory = await createTemporaryDirectory();

      try {
        const originalBytes = Uint8Array.from([1, 2, 3]);

        await writeFile(path.join(temporaryDirectory, 'file.bin'), originalBytes);

        const state = await createDirectoryState(temporaryDirectory);
        const logicalPath = parseRepositoryPath('/file.bin');
        const read = readFilesystemRepositoryFile(state, logicalPath, undefined, {
          afterOpen: () => {
            throw Object.assign(new Error(`${temporaryDirectory}/file.bin`), { code });
          },
        });

        await expectToRejectCode(read, expectedCode);
        await expect(read).rejects.toMatchObject({
          operation: 'read-file',
          path: logicalPath,
          retryable: true,
        });
        expect(JSON.stringify(await read.catch((error: unknown) => error))).not.toContain(
          temporaryDirectory,
        );
        expect(state.lifecycle.isInvalidated).toBe(false);
        expect(state.cache.cachedByteCount).toBe(0);

        await expect(readFilesystemRepositoryFile(state, logicalPath)).resolves.toStrictEqual(
          originalBytes,
        );
      } finally {
        await rm(temporaryDirectory, { force: true, recursive: true });
      }
    },
  );

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
      expect(state.lifecycle.isInvalidated).toBe(true);
      expect(state.cache.cachedByteCount).toBe(0);
      expect(state.cache.filesByPath.has(logicalPath)).toBe(false);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('invalidates when an I/O failure coincides with lost coherence', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const filePath = path.join(temporaryDirectory, 'large.bin');
      const originalBytes = new Uint8Array(FILESYSTEM_FILE_READ_CHUNK_BYTES * 2).fill(6);
      const replacementBytes = new Uint8Array(originalBytes.byteLength).fill(7);

      await writeFile(filePath, originalBytes);

      const state = await createDirectoryState(temporaryDirectory);
      const logicalPath = parseRepositoryPath('/large.bin');
      let hasFailed = false;
      const read = readFilesystemRepositoryFile(state, logicalPath, undefined, {
        afterReadChunk: async () => {
          if (hasFailed) {
            return;
          }

          hasFailed = true;
          await writeFile(filePath, replacementBytes);
          throw Object.assign(new Error(filePath), { code: 'EIO' });
        },
      });

      await expectToRejectCode(read, 'SNAPSHOT_CHANGED');
      expect(state.lifecycle.isInvalidated).toBe(true);
      expect(state.cache.cachedByteCount).toBe(0);
      expect(state.cache.filesByPath.has(logicalPath)).toBe(false);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('discards verified bytes after close failure without invalidating the reader', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const originalBytes = Uint8Array.from([8, 9, 10]);
      const filePath = path.join(temporaryDirectory, 'file.bin');

      await writeFile(filePath, originalBytes);

      const state = await createDirectoryState(temporaryDirectory);
      const logicalPath = parseRepositoryPath('/file.bin');
      const read = readFilesystemRepositoryFile(state, logicalPath, undefined, {
        closeFileHandle: async (fileHandle) => {
          await fileHandle.close();
          throw Object.assign(new Error(filePath), { code: 'EIO' });
        },
      });

      await expectToRejectCode(read, 'SOURCE_UNAVAILABLE');
      expect(state.lifecycle.isInvalidated).toBe(false);
      expect(state.cache.cachedByteCount).toBe(0);
      expect(state.cache.filesByPath.has(logicalPath)).toBe(false);

      await expect(readFilesystemRepositoryFile(state, logicalPath)).resolves.toStrictEqual(
        originalBytes,
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('invalidates every operation before closing a changed capture', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const cachedBytes = Uint8Array.from([1, 2, 3]);
      const changedBytes = new Uint8Array(FILESYSTEM_FILE_READ_CHUNK_BYTES * 2).fill(4);
      const cachedFilePath = path.join(temporaryDirectory, 'cached.bin');
      const changedFilePath = path.join(temporaryDirectory, 'changed.bin');

      await writeFile(cachedFilePath, cachedBytes);
      await writeFile(changedFilePath, changedBytes);

      const state = await createDirectoryState(temporaryDirectory);
      const cachedLogicalPath = parseRepositoryPath('/cached.bin');
      const changedLogicalPath = parseRepositoryPath('/changed.bin');

      await expect(readFilesystemRepositoryFile(state, cachedLogicalPath)).resolves.toStrictEqual(
        cachedBytes,
      );

      let cleanupCachedByteCount: number | undefined;
      let cleanupIsInvalidated: boolean | undefined;
      let cleanupOperationResults: PromiseSettledResult<unknown>[] | undefined;
      let hasMutated = false;
      const changedRead = readFilesystemRepositoryFile(state, changedLogicalPath, undefined, {
        afterReadChunk: async () => {
          if (hasMutated) {
            return;
          }

          hasMutated = true;
          await writeFile(changedFilePath, new Uint8Array(changedBytes.byteLength).fill(5));

          throw Object.assign(new Error(changedFilePath), { code: 'EIO' });
        },
        closeFileHandle: async (fileHandle) => {
          cleanupCachedByteCount = state.cache.cachedByteCount;
          cleanupIsInvalidated = state.lifecycle.isInvalidated;
          cleanupOperationResults = await Promise.allSettled([
            getFilesystemRepositoryEntry(state, cachedLogicalPath),
            readFilesystemRepositoryFile(state, cachedLogicalPath),
            collectEntries(listFilesystemRepositoryEntries(state)),
          ]);

          await fileHandle.close();
        },
      });

      await expectToRejectCode(changedRead, 'SNAPSHOT_CHANGED');
      expect(cleanupIsInvalidated).toBe(true);
      expect(cleanupCachedByteCount).toBe(0);
      expect(cleanupOperationResults).toHaveLength(3);

      for (const operationResult of cleanupOperationResults ?? []) {
        expect(operationResult.status).toBe('rejected');

        if (operationResult.status === 'rejected') {
          expect(operationResult.reason).toMatchObject({
            code: 'SNAPSHOT_CHANGED',
            retryable: true,
          });
        }
      }

      expect(state.cache.filesByPath.size).toBe(0);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('prefers coherent cancellation over a close-only failure', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const originalBytes = Uint8Array.from([6, 7, 8]);
      const filePath = path.join(temporaryDirectory, 'file.bin');

      await writeFile(filePath, originalBytes);

      const state = await createDirectoryState(temporaryDirectory);
      const logicalPath = parseRepositoryPath('/file.bin');
      const controller = new AbortController();
      const read = readFilesystemRepositoryFile(
        state,
        logicalPath,
        { signal: controller.signal },
        {
          closeFileHandle: async (fileHandle) => {
            controller.abort('cancel-during-close');
            await fileHandle.close();

            throw Object.assign(new Error(filePath), { code: 'EIO' });
          },
        },
      );

      await expectToRejectCode(read, 'ABORTED');
      await expect(read).rejects.toMatchObject({
        operation: 'read-file',
        path: logicalPath,
        retryable: false,
      });
      expect(state.lifecycle.isInvalidated).toBe(false);
      expect(state.cache.cachedByteCount).toBe(0);
      expect(state.cache.filesByPath.has(logicalPath)).toBe(false);

      await expect(readFilesystemRepositoryFile(state, logicalPath)).resolves.toStrictEqual(
        originalBytes,
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('prefers concurrent invalidation over a close failure', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const filePath = path.join(temporaryDirectory, 'file.bin');
      const changedFilePath = path.join(temporaryDirectory, 'changed.bin');

      await writeFile(filePath, Uint8Array.from([1, 2, 3]));
      await writeFile(changedFilePath, Uint8Array.from([4, 5, 6]));

      const state = await createDirectoryState(temporaryDirectory);
      const logicalPath = parseRepositoryPath('/file.bin');
      const changedLogicalPath = parseRepositoryPath('/changed.bin');
      const read = readFilesystemRepositoryFile(state, logicalPath, undefined, {
        closeFileHandle: async (fileHandle) => {
          await writeFile(changedFilePath, Uint8Array.from([7, 8, 9, 10]));
          await expectToRejectCode(
            readFilesystemRepositoryFile(state, changedLogicalPath),
            'SNAPSHOT_CHANGED',
          );
          await fileHandle.close();

          throw Object.assign(new Error(filePath), { code: 'EIO' });
        },
      });

      await expectToRejectCode(read, 'SNAPSHOT_CHANGED');
      await expect(read).rejects.toMatchObject({
        operation: 'read-file',
        path: logicalPath,
        retryable: true,
      });
      expect(state.lifecycle.isInvalidated).toBe(true);
      expect(state.cache.cachedByteCount).toBe(0);
      expect(state.cache.filesByPath.size).toBe(0);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
