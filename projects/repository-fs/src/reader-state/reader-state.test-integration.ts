// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expectToRejectCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import {
  REPOSITORY_ROOT,
  RepositoryPathException,
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryPath,
} from '@moldea.ai/repository';

import { readFilesystemRepositoryFile } from '../file-operations/index.js';
import {
  getFilesystemRepositoryEntry,
  listFilesystemRepositoryEntries,
} from '../inventory-operations/index.js';
import { prepareFilesystemRepositoryRoot } from '../root/index.js';
import { createVerifiedFilesystemInventory } from '../verified-inventory/index.js';
import { createFilesystemRepositoryReaderState } from './index.js';

const createTemporaryDirectory = (): Promise<string> => {
  return mkdtemp(path.join(tmpdir(), 'moldea-repository-fs-reader-state-'));
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

describe('permanent filesystem reader invalidation', () => {
  test('disposes cached bytes and rejects every later operation after snapshot loss', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const cachedHostPath = path.join(temporaryDirectory, 'cached.bin');
      const changedHostPath = path.join(temporaryDirectory, 'changed.bin');
      const cachedPath = parseRepositoryPath('/cached.bin');
      const changedPath = parseRepositoryPath('/changed.bin');
      const originalCachedBytes = Uint8Array.from([1, 2, 3]);
      const changedBytes = Uint8Array.from([8, 8, 8]);

      await writeFile(cachedHostPath, originalCachedBytes);
      await writeFile(changedHostPath, Uint8Array.from([4, 5, 6]));

      const state = await createDirectoryState(temporaryDirectory);

      await expect(readFilesystemRepositoryFile(state, cachedPath)).resolves.toStrictEqual(
        originalCachedBytes,
      );
      expect(state.cache.cachedByteCount).toBe(originalCachedBytes.byteLength);

      await writeFile(changedHostPath, changedBytes);

      const changedRead = readFilesystemRepositoryFile(state, changedPath);

      await expectToRejectCode(changedRead, 'SNAPSHOT_CHANGED');
      expect(state.lifecycle.isInvalidated).toBe(true);
      expect(state.cache.cachedByteCount).toBe(0);
      expect(state.cache.filesByPath.size).toBe(0);

      const getEntry = getFilesystemRepositoryEntry(state, cachedPath);
      const cachedRead = readFilesystemRepositoryFile(state, cachedPath);
      const listing = collectEntries(listFilesystemRepositoryEntries(state));

      await expectToRejectCode(getEntry, 'SNAPSHOT_CHANGED');
      await expect(getEntry).rejects.toMatchObject({
        operation: 'get-entry',
        path: cachedPath,
        retryable: true,
      });
      await expectToRejectCode(cachedRead, 'SNAPSHOT_CHANGED');
      await expect(cachedRead).rejects.toMatchObject({
        operation: 'read-file',
        path: cachedPath,
        retryable: true,
      });
      await expectToRejectCode(listing, 'SNAPSHOT_CHANGED');
      await expect(listing).rejects.toMatchObject({
        operation: 'list-entries',
        path: REPOSITORY_ROOT,
        retryable: true,
      });

      const freshState = await createDirectoryState(temporaryDirectory);

      await expect(readFilesystemRepositoryFile(freshState, changedPath)).resolves.toStrictEqual(
        changedBytes,
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('checks invalid paths before invalidation and invalidation before other valid-path failures', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await writeFile(path.join(temporaryDirectory, 'file.bin'), Uint8Array.from([1]));

      const state = await createDirectoryState(temporaryDirectory);
      const filePath = parseRepositoryPath('/file.bin');

      await writeFile(path.join(temporaryDirectory, 'file.bin'), Uint8Array.from([2]));
      await expectToRejectCode(readFilesystemRepositoryFile(state, filePath), 'SNAPSHOT_CHANGED');

      const forgedPath = '../private-source' as IRepositoryPath;
      const forgedRead = readFilesystemRepositoryFile(state, forgedPath);

      await expectToRejectCode(forgedRead, 'INVALID_REPOSITORY_PATH');
      await expect(forgedRead).rejects.toBeInstanceOf(RepositoryPathException);

      const controller = new AbortController();

      controller.abort('cancel-invalidated-reader');

      await expectToRejectCode(
        getFilesystemRepositoryEntry(state, parseRepositoryPath('/missing'), {
          signal: controller.signal,
        }),
        'SNAPSHOT_CHANGED',
      );
      await expectToRejectCode(
        readFilesystemRepositoryFile(state, REPOSITORY_ROOT, {
          signal: controller.signal,
        }),
        'SNAPSHOT_CHANGED',
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('terminates an active listing before yielding another entry', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await writeFile(path.join(temporaryDirectory, 'a.bin'), Uint8Array.from([1]));
      await writeFile(path.join(temporaryDirectory, 'b.bin'), Uint8Array.from([2]));
      await writeFile(path.join(temporaryDirectory, 'changed.bin'), Uint8Array.from([3]));

      const state = await createDirectoryState(temporaryDirectory);
      const iterator = listFilesystemRepositoryEntries(state)[Symbol.asyncIterator]();
      const firstEntry = await iterator.next();

      expect(firstEntry.done).toBe(false);

      await writeFile(path.join(temporaryDirectory, 'changed.bin'), Uint8Array.from([4]));
      await expectToRejectCode(
        readFilesystemRepositoryFile(state, parseRepositoryPath('/changed.bin')),
        'SNAPSHOT_CHANGED',
      );

      const nextEntry = iterator.next();

      await expectToRejectCode(nextEntry, 'SNAPSHOT_CHANGED');
      await expect(nextEntry).rejects.toMatchObject({
        operation: 'list-entries',
        path: REPOSITORY_ROOT,
      });
      await expect(iterator.next()).resolves.toStrictEqual({ done: true, value: undefined });
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('prevents an active capture from committing after another read invalidates the state', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const slowBytes = new Uint8Array(131_072).fill(1);

      await writeFile(path.join(temporaryDirectory, 'slow.bin'), slowBytes);
      await writeFile(path.join(temporaryDirectory, 'changed.bin'), Uint8Array.from([2, 2, 2]));

      const state = await createDirectoryState(temporaryDirectory);
      const slowPath = parseRepositoryPath('/slow.bin');
      const changedPath = parseRepositoryPath('/changed.bin');
      let releaseCapture: (() => void) | undefined;
      let reportCapturePaused: (() => void) | undefined;
      const captureRelease = new Promise<void>((resolve) => {
        releaseCapture = resolve;
      });
      const capturePaused = new Promise<void>((resolve) => {
        reportCapturePaused = resolve;
      });
      let hasPaused = false;
      const slowRead = readFilesystemRepositoryFile(state, slowPath, undefined, {
        afterReadChunk: async () => {
          if (hasPaused) {
            return;
          }

          hasPaused = true;
          reportCapturePaused?.();
          await captureRelease;
        },
      });

      await capturePaused;
      await writeFile(path.join(temporaryDirectory, 'changed.bin'), Uint8Array.from([3, 3, 3]));
      await expectToRejectCode(
        readFilesystemRepositoryFile(state, changedPath),
        'SNAPSHOT_CHANGED',
      );
      releaseCapture?.();

      await expectToRejectCode(slowRead, 'SNAPSHOT_CHANGED');
      expect(state.cache.cachedByteCount).toBe(0);
      expect(state.cache.filesByPath.size).toBe(0);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
