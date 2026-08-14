// @vitest-environment node
import { expectToThrowCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath, type IRepositoryPath } from '@moldea.ai/repository';

import type {
  IFilesystemDirectoryInventoryEntry,
  IFilesystemInventoryEntry,
  IFilesystemRegularFileInventoryEntry,
} from '../inventory/index.js';
import type { IFilesystemRepositoryFileCacheState } from '../reader-state/index.js';
import { copyCachedFilesystemFile, createFilesystemFileCaptureTarget } from './utilities.js';

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

  test('copies cached bytes into caller-owned storage', () => {
    const cache = createCache();
    const path = parseRepositoryPath('/file.bin');
    const cachedBytes = Uint8Array.from([1, 2, 3]);

    cache.filesByPath.set(path, cachedBytes);
    cache.cachedByteCount = cachedBytes.byteLength;
    const firstCopy = copyCachedFilesystemFile(cache, path);

    firstCopy?.fill(9);

    expect(firstCopy).toStrictEqual(Uint8Array.from([9, 9, 9]));
    expect(copyCachedFilesystemFile(cache, path)).toStrictEqual(Uint8Array.from([1, 2, 3]));
    expect(copyCachedFilesystemFile(cache, parseRepositoryPath('/missing.bin'))).toBeUndefined();
  });
});
