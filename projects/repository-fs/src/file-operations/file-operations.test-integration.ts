// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expectToRejectCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import { prepareFilesystemRepositoryRoot } from '../root/index.js';
import { createVerifiedFilesystemInventory } from '../verified-inventory/index.js';
import { createFilesystemRepositoryFileReadState, readFilesystemRepositoryFile } from './index.js';

const createTemporaryDirectory = (): Promise<string> => {
  return mkdtemp(path.join(tmpdir(), 'moldea-repository-fs-file-operations-'));
};

describe('verified filesystem read-file operations', () => {
  test('caches exact bytes privately and returns a fresh caller-owned copy', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await mkdir(path.join(temporaryDirectory, 'nested'));
      const binaryPath = path.join(temporaryDirectory, 'nested', 'bytes-😀.bin');
      const emptyPath = path.join(temporaryDirectory, 'empty.bin');
      const originalBytes = Uint8Array.from([0, 255, 1, 128, 10]);

      await writeFile(binaryPath, originalBytes);
      await writeFile(emptyPath, new Uint8Array());

      const preparedRoot = await prepareFilesystemRepositoryRoot({
        rootDirectory: temporaryDirectory,
        selection: { kind: 'directory' },
      });
      const inventory = await createVerifiedFilesystemInventory(preparedRoot);
      const state = createFilesystemRepositoryFileReadState(preparedRoot, inventory);
      const binaryLogicalPath = parseRepositoryPath('/nested/bytes-😀.bin');
      const emptyLogicalPath = parseRepositoryPath('/empty.bin');
      const firstRead = await readFilesystemRepositoryFile(state, binaryLogicalPath);

      expect(firstRead).toStrictEqual(originalBytes);
      expect(state.cache.cachedByteCount).toBe(originalBytes.byteLength);

      firstRead[0] = 99;
      await writeFile(binaryPath, Uint8Array.from([9, 9, 9, 9, 9]));

      const secondRead = await readFilesystemRepositoryFile(state, binaryLogicalPath);
      const emptyRead = await readFilesystemRepositoryFile(state, emptyLogicalPath);

      expect(secondRead).toStrictEqual(originalBytes);
      expect(secondRead).not.toBe(firstRead);
      expect(emptyRead).toStrictEqual(new Uint8Array());
      expect(state.cache.cachedByteCount).toBe(originalBytes.byteLength);

      await rm(binaryPath);

      await expect(readFilesystemRepositoryFile(state, binaryLogicalPath)).resolves.toStrictEqual(
        originalBytes,
      );
      expect(state.cache.cachedByteCount).toBe(originalBytes.byteLength);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('enforces exact single-file and total-cache boundaries without partial commits', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await writeFile(path.join(temporaryDirectory, 'first.bin'), Uint8Array.from([1, 2, 3, 4]));
      await writeFile(path.join(temporaryDirectory, 'second.bin'), Uint8Array.from([5, 6]));
      await writeFile(path.join(temporaryDirectory, 'third.bin'), Uint8Array.from([7]));
      await writeFile(
        path.join(temporaryDirectory, 'oversized.bin'),
        Uint8Array.from([8, 9, 10, 11, 12]),
      );

      const preparedRoot = await prepareFilesystemRepositoryRoot({
        limits: {
          maxCachedBytes: 6,
          maxEntries: 8,
          maxFileBytes: 4,
        },
        rootDirectory: temporaryDirectory,
        selection: { kind: 'directory' },
      });
      const inventory = await createVerifiedFilesystemInventory(preparedRoot);
      const state = createFilesystemRepositoryFileReadState(preparedRoot, inventory);
      const firstPath = parseRepositoryPath('/first.bin');
      const secondPath = parseRepositoryPath('/second.bin');
      const thirdPath = parseRepositoryPath('/third.bin');
      const oversizedPath = parseRepositoryPath('/oversized.bin');

      await expect(readFilesystemRepositoryFile(state, firstPath)).resolves.toStrictEqual(
        Uint8Array.from([1, 2, 3, 4]),
      );
      await expect(readFilesystemRepositoryFile(state, firstPath)).resolves.toStrictEqual(
        Uint8Array.from([1, 2, 3, 4]),
      );
      await expect(readFilesystemRepositoryFile(state, secondPath)).resolves.toStrictEqual(
        Uint8Array.from([5, 6]),
      );
      expect(state.cache.cachedByteCount).toBe(6);
      expect(state.cache.filesByPath.size).toBe(2);

      const cacheLimitRead = readFilesystemRepositoryFile(state, thirdPath);

      await expectToRejectCode(cacheLimitRead, 'RESOURCE_LIMIT_EXCEEDED');
      await expect(cacheLimitRead).rejects.toMatchObject({
        operation: 'read-file',
        path: thirdPath,
        retryable: false,
      });
      expect(state.cache.cachedByteCount).toBe(6);
      expect(state.cache.filesByPath.has(thirdPath)).toBe(false);

      let hasReadOversizedFile = false;
      const fileLimitRead = readFilesystemRepositoryFile(state, oversizedPath, undefined, {
        afterReadChunk: () => {
          hasReadOversizedFile = true;
        },
      });

      await expectToRejectCode(fileLimitRead, 'RESOURCE_LIMIT_EXCEEDED');
      expect(hasReadOversizedFile).toBe(false);
      expect(state.cache.cachedByteCount).toBe(6);
      expect(state.cache.filesByPath.has(oversizedPath)).toBe(false);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
