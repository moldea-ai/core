// @vitest-environment node
import { expectToThrowCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath, type IRepositoryPath } from '@moldea.ai/repository';

import type {
  IFilesystemDirectoryInventoryEntry,
  IFilesystemInventoryEntry,
  IFilesystemRegularFileInventoryEntry,
} from '../inventory/index.js';
import type { IFilesystemRepositoryFileCacheState } from './types.js';
import {
  commitFilesystemFileCapture,
  copyCachedFilesystemFile,
  createFilesystemFileCaptureTarget,
  getMaximumFilesystemFileCaptureBytes,
} from './utilities.js';

const createDirectoryEntry = (
  logicalPath: string,
  inode: bigint,
): IFilesystemDirectoryInventoryEntry => {
  const path = parseRepositoryPath(logicalPath);

  return Object.freeze({
    hostPath: `/private/source${path}`,
    identity: Object.freeze({
      birthtimeNanoseconds: 1n,
      device: 2n,
      inode,
      mode: 16_877n,
    }),
    path,
    type: 'directory',
  });
};

const createFileEntry = (logicalPath: string): IFilesystemRegularFileInventoryEntry => {
  const path = parseRepositoryPath(logicalPath);

  return Object.freeze({
    fingerprint: Object.freeze({
      birthtimeNanoseconds: 1n,
      changeTimeNanoseconds: 2n,
      device: 3n,
      inode: 4n,
      mode: 33_188n,
      modificationTimeNanoseconds: 5n,
      size: 3n,
    }),
    hostPath: `/private/source${path}`,
    path,
    type: 'file',
  });
};

const createCache = (): IFilesystemRepositoryFileCacheState => ({
  cachedByteCount: 0,
  filesByPath: new Map<IRepositoryPath, Uint8Array>(),
});

describe('filesystem file-operation utilities', () => {
  test('builds the exact root-to-parent directory chain', () => {
    const root = createDirectoryEntry('/', 1n);
    const firstDirectory = createDirectoryEntry('/a', 2n);
    const secondDirectory = createDirectoryEntry('/a/b', 3n);
    const file = createFileEntry('/a/b/file.bin');
    const entries = new Map<IRepositoryPath, IFilesystemInventoryEntry>(
      [root, firstDirectory, secondDirectory, file].map((entry) => [entry.path, entry]),
    );

    expect(createFilesystemFileCaptureTarget(entries, file)).toStrictEqual({
      directories: [root, firstDirectory, secondDirectory],
      file,
    });
  });

  test('rejects an internally incomplete directory chain', () => {
    const root = createDirectoryEntry('/', 1n);
    const file = createFileEntry('/missing/file.bin');
    const entries = new Map<IRepositoryPath, IFilesystemInventoryEntry>([
      [root.path, root],
      [file.path, file],
    ]);

    expectToThrowCode(
      () => createFilesystemFileCaptureTarget(entries, file),
      'INVALID_SOURCE_DATA',
    );
  });

  test.each([
    [0, 8, 16, 8],
    [8, 16, 16, 8],
    [15, 16, 16, 1],
    [16, 16, 16, 0],
  ])(
    'getMaximumFilesystemFileCaptureBytes(%d, %d, %d) -> %d',
    (cachedByteCount, maxFileBytes, maxCachedBytes, expectedMaximum) => {
      const cache = createCache();

      cache.cachedByteCount = cachedByteCount;

      expect(getMaximumFilesystemFileCaptureBytes(cache, maxFileBytes, maxCachedBytes)).toBe(
        expectedMaximum,
      );
    },
  );

  test('copies committed bytes and counts one path exactly once', () => {
    const cache = createCache();
    const path = parseRepositoryPath('/file.bin');
    const capturedBytes = Uint8Array.from([1, 2, 3]);
    const firstResult = commitFilesystemFileCapture(cache, path, capturedBytes, 3);

    capturedBytes[0] = 9;
    firstResult[1] = 9;

    const secondResult = commitFilesystemFileCapture(cache, path, Uint8Array.from([8, 8, 8]), 3);
    const copiedResult = copyCachedFilesystemFile(cache, path);

    expect(secondResult).toStrictEqual(Uint8Array.from([1, 2, 3]));
    expect(copiedResult).toStrictEqual(Uint8Array.from([1, 2, 3]));
    expect(secondResult).not.toBe(copiedResult);
    expect(cache.cachedByteCount).toBe(3);
    expect(cache.filesByPath.size).toBe(1);
  });

  test('rejects a cache commit beyond the exact remaining budget', () => {
    const cache = createCache();
    const firstPath = parseRepositoryPath('/first.bin');
    const secondPath = parseRepositoryPath('/second.bin');

    commitFilesystemFileCapture(cache, firstPath, Uint8Array.from([1, 2]), 3);

    expectToThrowCode(
      () => commitFilesystemFileCapture(cache, secondPath, Uint8Array.from([3, 4]), 3),
      'RESOURCE_LIMIT_EXCEEDED',
    );
    expect(cache.cachedByteCount).toBe(2);
    expect(cache.filesByPath.has(secondPath)).toBe(false);
  });
});
