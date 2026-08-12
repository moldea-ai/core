// @vitest-environment node
import { expectToRejectCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import {
  REPOSITORY_ROOT,
  RepositoryPathException,
  RepositorySourceException,
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryPath,
} from '@moldea.ai/repository';

import type { IFilesystemInventory, IFilesystemInventoryEntry } from '../inventory/index.js';
import { getFilesystemRepositoryEntry, listFilesystemRepositoryEntries } from './index.js';

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
        mode: 4n,
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
        mode: 5n,
        modificationTimeNanoseconds: 6n,
        size: 7n,
      }),
      hostPath,
      path,
      type,
    });
  }

  return Object.freeze({ hostPath, path, type });
};

const createInventory = (): IFilesystemInventory => {
  const entries = [
    createInventoryEntry('/', 'directory'),
    createInventoryEntry('/Case.txt', 'file'),
    createInventoryEntry('/a', 'directory'),
    createInventoryEntry('/a/file.txt', 'file'),
    createInventoryEntry('/a/nested', 'directory'),
    createInventoryEntry('/a/nested/unicode-😀.txt', 'file'),
    createInventoryEntry('/a-link', 'symlink'),
    createInventoryEntry('/a2', 'directory'),
    createInventoryEntry('/a2/sibling.txt', 'file'),
    createInventoryEntry('/empty', 'directory'),
  ];

  entries.sort((firstEntry, secondEntry) => {
    if (firstEntry.path < secondEntry.path) {
      return -1;
    }

    return firstEntry.path > secondEntry.path ? 1 : 0;
  });

  return Object.freeze({ entries: Object.freeze(entries) });
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

describe('frozen filesystem inventory operations', () => {
  test.each([
    ['/', 'directory'],
    ['/Case.txt', 'file'],
    ['/a', 'directory'],
    ['/a-link', 'symlink'],
  ] as const)('getFilesystemRepositoryEntry(%s) -> %s', async (logicalPath, type) => {
    const path = parseRepositoryPath(logicalPath);

    await expect(getFilesystemRepositoryEntry(createInventory(), path)).resolves.toStrictEqual({
      path,
      type,
    });
  });

  test('returns null for an absent exact path', async () => {
    await expect(
      getFilesystemRepositoryEntry(createInventory(), parseRepositoryPath('/missing')),
    ).resolves.toBeNull();
  });

  test('preserves exact case and Unicode path identity', async () => {
    const inventory = createInventory();
    const unicodePath = parseRepositoryPath('/a/nested/unicode-😀.txt');

    await expect(getFilesystemRepositoryEntry(inventory, unicodePath)).resolves.toStrictEqual({
      path: unicodePath,
      type: 'file',
    });
    await expect(
      getFilesystemRepositoryEntry(inventory, parseRepositoryPath('/case.txt')),
    ).resolves.toBeNull();
  });

  test('isolates returned entries from the private inventory and later results', async () => {
    const inventory = createInventory();
    const path = parseRepositoryPath('/Case.txt');
    const firstEntry = await getFilesystemRepositoryEntry(inventory, path);

    expect(firstEntry).toStrictEqual({ path, type: 'file' });
    expect(firstEntry).not.toHaveProperty('hostPath');
    expect(firstEntry).not.toHaveProperty('fingerprint');

    if (firstEntry === null) {
      throw new Error('Expected the fixture file to exist.');
    }

    Reflect.set(firstEntry, 'type', 'directory');

    await expect(getFilesystemRepositoryEntry(inventory, path)).resolves.toStrictEqual({
      path,
      type: 'file',
    });
  });

  test('lists every root descendant exactly once without exposing private metadata', async () => {
    const entries = await collectEntries(listFilesystemRepositoryEntries(createInventory()));

    expect(entries.map((entry) => entry.path)).toStrictEqual([
      parseRepositoryPath('/Case.txt'),
      parseRepositoryPath('/a'),
      parseRepositoryPath('/a-link'),
      parseRepositoryPath('/a/file.txt'),
      parseRepositoryPath('/a/nested'),
      parseRepositoryPath('/a/nested/unicode-😀.txt'),
      parseRepositoryPath('/a2'),
      parseRepositoryPath('/a2/sibling.txt'),
      parseRepositoryPath('/empty'),
    ]);
    expect(new Set(entries.map((entry) => entry.path)).size).toBe(entries.length);
    expect(entries.some((entry) => entry.path === REPOSITORY_ROOT)).toBe(false);
    expect(entries.every((entry) => Object.keys(entry).length === 2)).toBe(true);
  });

  test('lists only exact nested descendants without matching similarly prefixed paths', async () => {
    const prefix = parseRepositoryPath('/a');
    const entries = await collectEntries(
      listFilesystemRepositoryEntries(createInventory(), { prefix }),
    );

    expect(entries.map((entry) => entry.path)).toStrictEqual([
      parseRepositoryPath('/a/file.txt'),
      parseRepositoryPath('/a/nested'),
      parseRepositoryPath('/a/nested/unicode-😀.txt'),
    ]);
  });

  test('isolates mutable listed entries from later listings', async () => {
    const inventory = createInventory();
    const firstListing = await collectEntries(listFilesystemRepositoryEntries(inventory));
    const firstEntry = firstListing[0];

    if (firstEntry === undefined) {
      throw new Error('Expected the fixture listing to contain an entry.');
    }

    Reflect.set(firstEntry, 'type', 'directory');

    const secondListing = await collectEntries(listFilesystemRepositoryEntries(inventory));

    expect(secondListing[0]).toStrictEqual({
      path: parseRepositoryPath('/Case.txt'),
      type: 'file',
    });
  });

  test('returns an empty listing for an empty directory', async () => {
    const entries = await collectEntries(
      listFilesystemRepositoryEntries(createInventory(), {
        prefix: parseRepositoryPath('/empty'),
      }),
    );

    expect(entries).toStrictEqual([]);
  });

  test.each([
    ['/missing', 'ENTRY_NOT_FOUND'],
    ['/Case.txt', 'ENTRY_NOT_DIRECTORY'],
    ['/a-link', 'ENTRY_NOT_DIRECTORY'],
  ] as const)('listFilesystemRepositoryEntries(%s) -> %s', async (logicalPath, code) => {
    const prefix = parseRepositoryPath(logicalPath);
    const listing = collectEntries(listFilesystemRepositoryEntries(createInventory(), { prefix }));

    await expectToRejectCode(listing, code);
    await expect(listing).rejects.toBeInstanceOf(RepositorySourceException);
    await expect(listing).rejects.toMatchObject({
      operation: 'list-entries',
      path: prefix,
      retryable: false,
    });
  });

  test('runtime-validates forged logical paths', async () => {
    const forgedPath = '../private-source' as IRepositoryPath;
    const getEntry = getFilesystemRepositoryEntry(createInventory(), forgedPath);
    const listing = collectEntries(
      listFilesystemRepositoryEntries(createInventory(), { prefix: forgedPath }),
    );
    const nullPrefixListing = collectEntries(
      listFilesystemRepositoryEntries(createInventory(), { prefix: null as never }),
    );

    await expectToRejectCode(getEntry, 'INVALID_REPOSITORY_PATH');
    await expect(getEntry).rejects.toBeInstanceOf(RepositoryPathException);
    await expectToRejectCode(listing, 'INVALID_REPOSITORY_PATH');
    await expect(listing).rejects.toBeInstanceOf(RepositoryPathException);
    await expectToRejectCode(nullPrefixListing, 'INVALID_REPOSITORY_PATH');
    await expect(nullPrefixListing).rejects.toBeInstanceOf(RepositoryPathException);
  });

  test('rejects already-aborted lookup and listing operations', async () => {
    const controller = new AbortController();
    const path = parseRepositoryPath('/Case.txt');

    controller.abort(new Error('cancelled by test'));

    const getEntry = getFilesystemRepositoryEntry(createInventory(), path, {
      signal: controller.signal,
    });
    const listing = collectEntries(
      listFilesystemRepositoryEntries(createInventory(), { signal: controller.signal }),
    );

    await expectToRejectCode(getEntry, 'ABORTED');
    await expect(getEntry).rejects.toMatchObject({
      operation: 'get-entry',
      path,
      retryable: false,
    });
    await expectToRejectCode(listing, 'ABORTED');
    await expect(listing).rejects.toMatchObject({
      operation: 'list-entries',
      path: REPOSITORY_ROOT,
      retryable: false,
    });
  });

  test('terminates a listing when its signal is aborted between yields', async () => {
    const controller = new AbortController();
    const iterator = listFilesystemRepositoryEntries(createInventory(), {
      signal: controller.signal,
    })[Symbol.asyncIterator]();
    const firstResult = await iterator.next();

    expect(firstResult.done).toBe(false);
    controller.abort('stop-listing');

    const nextResult = iterator.next();

    await expectToRejectCode(nextResult, 'ABORTED');
    await expect(nextResult).rejects.toMatchObject({
      operation: 'list-entries',
      path: REPOSITORY_ROOT,
      retryable: false,
    });
    await expect(iterator.next()).resolves.toStrictEqual({ done: true, value: undefined });
  });
});
