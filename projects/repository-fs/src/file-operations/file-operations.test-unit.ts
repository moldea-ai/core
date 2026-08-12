// @vitest-environment node
import { expectToRejectCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import {
  RepositoryPathException,
  RepositorySourceException,
  parseRepositoryPath,
  type IRepositoryPath,
} from '@moldea.ai/repository';

import { DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS } from '../constants/index.js';
import type { IFilesystemInventory, IFilesystemInventoryEntry } from '../inventory/index.js';
import { createFilesystemRepositoryReaderState } from '../reader-state/index.js';
import type { IPreparedFilesystemRepositoryRoot } from '../root/index.js';
import { readFilesystemRepositoryFile } from './index.js';

const createInventoryEntry = (
  logicalPath: string,
  type: 'directory' | 'file' | 'symlink',
): IFilesystemInventoryEntry => {
  const path = parseRepositoryPath(logicalPath);
  const hostPath = `/private/source${path}`;

  if (type === 'directory') {
    return Object.freeze({
      hostPath,
      identity: Object.freeze({
        birthtimeNanoseconds: 1n,
        device: 2n,
        inode: 3n,
        mode: 16_877n,
      }),
      path,
      type,
    });
  }

  if (type === 'file') {
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
      hostPath,
      path,
      type,
    });
  }

  return Object.freeze({ hostPath, path, type });
};

const createState = () => {
  const entries = [
    createInventoryEntry('/', 'directory'),
    createInventoryEntry('/directory', 'directory'),
    createInventoryEntry('/file.bin', 'file'),
    createInventoryEntry('/link', 'symlink'),
  ];
  const inventory: IFilesystemInventory = Object.freeze({ entries: Object.freeze(entries) });
  const preparedRoot: IPreparedFilesystemRepositoryRoot = Object.freeze({
    identity: {
      birthtimeNanoseconds: 1n,
      device: 2n,
      inode: 3n,
      mode: 16_877n,
    },
    options: Object.freeze({
      limits: DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS,
      rootDirectory: '/private/source',
      selection: Object.freeze({ kind: 'directory' }),
      signal: undefined,
    }),
    resolvedRootDirectory: '/private/source',
  });

  return createFilesystemRepositoryReaderState(preparedRoot, inventory);
};

describe('filesystem read-file operation', () => {
  test.each([
    ['/', 'ENTRY_NOT_FILE'],
    ['/directory', 'ENTRY_NOT_FILE'],
    ['/link', 'ENTRY_NOT_FILE'],
    ['/missing', 'ENTRY_NOT_FOUND'],
  ] as const)('readFilesystemRepositoryFile(%s) -> %s', async (logicalPath, code) => {
    const path = parseRepositoryPath(logicalPath);
    const read = readFilesystemRepositoryFile(createState(), path);

    await expectToRejectCode(read, code);
    await expect(read).rejects.toBeInstanceOf(RepositorySourceException);
    await expect(read).rejects.toMatchObject({
      operation: 'read-file',
      path,
      retryable: false,
    });
  });

  test('runtime-validates a forged logical path before inspecting inventory state', async () => {
    const path = '../private-source' as IRepositoryPath;
    const read = readFilesystemRepositoryFile(createState(), path);

    await expectToRejectCode(read, 'INVALID_REPOSITORY_PATH');
    await expect(read).rejects.toBeInstanceOf(RepositoryPathException);
  });

  test('rejects an already-aborted read before filesystem work', async () => {
    const controller = new AbortController();
    const path = parseRepositoryPath('/file.bin');

    controller.abort(new Error('/private/source/file.bin'));

    const read = readFilesystemRepositoryFile(createState(), path, {
      signal: controller.signal,
    });

    await expectToRejectCode(read, 'ABORTED');
    await expect(read).rejects.toMatchObject({
      operation: 'read-file',
      path,
      retryable: false,
    });
    await expect(read).rejects.not.toHaveProperty('hostPath');
  });
});
