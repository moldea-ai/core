// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expectToRejectCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import type { IFilesystemRepositoryResourceLimits } from '../contracts/index.js';
import { readFilesystemRepositoryFile } from '../file-operations/index.js';
import { createFilesystemRepositoryReaderState } from '../reader-state/index.js';
import { prepareFilesystemRepositoryRoot } from '../root/index.js';
import { createVerifiedFilesystemInventory } from '../verified-inventory/index.js';
import { materializeFilesystemRepositorySnapshotWhenRequired } from './index.js';

const createTemporaryDirectory = (): Promise<string> =>
  mkdtemp(path.join(tmpdir(), 'moldea-repository-fs-materialization-'));

const createDirectoryState = async (
  rootDirectory: string,
  limits?: Partial<IFilesystemRepositoryResourceLimits>,
) => {
  const preparedRoot = await prepareFilesystemRepositoryRoot({
    limits,
    rootDirectory,
    selection: { kind: 'directory' },
  });
  const inventory = await createVerifiedFilesystemInventory(preparedRoot);

  return createFilesystemRepositoryReaderState(preparedRoot, inventory);
};

describe('filesystem snapshot materialization', () => {
  test('preserves eagerly captured bytes after an indistinguishable later mutation', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const filePath = path.join(temporaryDirectory, 'file.bin');
      const logicalPath = parseRepositoryPath('/file.bin');
      const originalBytes = Uint8Array.from([1]);

      await writeFile(filePath, originalBytes);

      const state = await createDirectoryState(temporaryDirectory);

      await materializeFilesystemRepositorySnapshotWhenRequired(state, undefined, 'win32');
      expect(state.cache.cachedByteCount).toBe(originalBytes.byteLength);

      await writeFile(filePath, Uint8Array.from([2]));

      await expect(readFilesystemRepositoryFile(state, logicalPath)).resolves.toStrictEqual(
        originalBytes,
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('retains lazy capture on platforms with sufficient metadata', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await writeFile(path.join(temporaryDirectory, 'file.bin'), Uint8Array.from([1]));

      const state = await createDirectoryState(temporaryDirectory);

      await materializeFilesystemRepositorySnapshotWhenRequired(state, undefined, 'linux');

      expect(state.cache.cachedByteCount).toBe(0);
      expect(state.cache.filesByPath.size).toBe(0);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('maps eager cache exhaustion to the reader-creation boundary', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await writeFile(path.join(temporaryDirectory, 'a.bin'), Uint8Array.from([1]));
      await writeFile(path.join(temporaryDirectory, 'b.bin'), Uint8Array.from([2]));

      const state = await createDirectoryState(temporaryDirectory, {
        maxCachedBytes: 1,
        maxEntries: 2,
        maxFileBytes: 1,
      });
      const materialization = materializeFilesystemRepositorySnapshotWhenRequired(
        state,
        undefined,
        'win32',
      );

      await expectToRejectCode(materialization, 'RESOURCE_LIMIT_EXCEEDED');
      await expect(materialization).rejects.toMatchObject({
        operation: 'create-reader',
        path: parseRepositoryPath('/b.bin'),
        retryable: false,
      });
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('maps mutation during eager capture to the reader-creation boundary', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const filePath = path.join(temporaryDirectory, 'file.bin');
      const logicalPath = parseRepositoryPath('/file.bin');

      await writeFile(filePath, Uint8Array.from([1]));

      const state = await createDirectoryState(temporaryDirectory);

      await writeFile(filePath, Uint8Array.from([2, 3]));

      const materialization = materializeFilesystemRepositorySnapshotWhenRequired(
        state,
        undefined,
        'win32',
      );

      await expectToRejectCode(materialization, 'SNAPSHOT_CHANGED');
      await expect(materialization).rejects.toMatchObject({
        operation: 'create-reader',
        path: logicalPath,
        retryable: true,
      });
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('maps eager capture cancellation to the reader-creation boundary', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await writeFile(path.join(temporaryDirectory, 'file.bin'), Uint8Array.from([1]));

      const state = await createDirectoryState(temporaryDirectory);
      const controller = new AbortController();

      controller.abort('cancel-materialization');

      const materialization = materializeFilesystemRepositorySnapshotWhenRequired(
        state,
        controller.signal,
        'win32',
      );

      await expectToRejectCode(materialization, 'ABORTED');
      await expect(materialization).rejects.toMatchObject({
        operation: 'create-reader',
        path: null,
        retryable: true,
      });
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
