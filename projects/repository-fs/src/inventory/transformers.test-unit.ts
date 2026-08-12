// @vitest-environment node
import { expectToThrowCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import { createFilesystemInventoryEntry } from './index.js';

const logicalPath = parseRepositoryPath('/entry');
const baseStatistics = {
  birthtimeNs: 11n,
  ctimeNs: 12n,
  dev: 13n,
  ino: 14n,
  mode: 15n,
  mtimeNs: 16n,
  size: 17n,
};

const createStatistics = (type: 'file' | 'directory' | 'symlink' | 'unsupported') => ({
  ...baseStatistics,
  isDirectory: () => type === 'directory',
  isFile: () => type === 'file',
  isSymbolicLink: () => type === 'symlink',
});

describe('filesystem inventory entry transformation', () => {
  test('attaches a regular-file fingerprint', () => {
    const entry = createFilesystemInventoryEntry(
      '/private/entry',
      logicalPath,
      createStatistics('file'),
    );

    expect(entry).toStrictEqual({
      fingerprint: {
        birthtimeNanoseconds: 11n,
        changeTimeNanoseconds: 12n,
        device: 13n,
        inode: 14n,
        mode: 15n,
        modificationTimeNanoseconds: 16n,
        size: 17n,
      },
      hostPath: '/private/entry',
      path: logicalPath,
      type: 'file',
    });
    expect(Object.isFrozen(entry)).toBe(true);
  });

  test('attaches a stable directory identity', () => {
    const entry = createFilesystemInventoryEntry(
      '/private/entry',
      logicalPath,
      createStatistics('directory'),
    );

    expect(entry).toStrictEqual({
      hostPath: '/private/entry',
      identity: {
        birthtimeNanoseconds: 11n,
        device: 13n,
        inode: 14n,
        mode: 15n,
      },
      path: logicalPath,
      type: 'directory',
    });
    expect(Object.isFrozen(entry)).toBe(true);
  });

  test('retains a symlink without target metadata', () => {
    const entry = createFilesystemInventoryEntry(
      '/private/entry',
      logicalPath,
      createStatistics('symlink'),
    );

    expect(entry).toStrictEqual({
      hostPath: '/private/entry',
      path: logicalPath,
      type: 'symlink',
    });
    expect(Object.isFrozen(entry)).toBe(true);
  });

  test('rejects unsupported source entries', () => {
    expectToThrowCode(
      () =>
        createFilesystemInventoryEntry(
          '/private/entry',
          logicalPath,
          createStatistics('unsupported'),
        ),
      'INVALID_SOURCE_DATA',
      'The repository source returned invalid data.',
    );
  });
});
