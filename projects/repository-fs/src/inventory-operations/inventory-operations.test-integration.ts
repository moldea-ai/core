// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath, type IRepositoryEntry } from '@moldea.ai/repository';

import { prepareFilesystemRepositoryRoot } from '../root/index.js';
import { createVerifiedFilesystemInventory } from '../verified-inventory/index.js';
import { getFilesystemRepositoryEntry, listFilesystemRepositoryEntries } from './index.js';

const createTemporaryDirectory = (): Promise<string> => {
  return mkdtemp(path.join(tmpdir(), 'moldea-repository-fs-operations-'));
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

describe('verified filesystem inventory operations', () => {
  test('looks up and lists one exact-path inventory after its source is removed', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await mkdir(path.join(temporaryDirectory, 'empty'));
      await mkdir(path.join(temporaryDirectory, 'nested'));
      await writeFile(path.join(temporaryDirectory, 'nested', 'selected.txt'), 'selected', 'utf8');
      await writeFile(path.join(temporaryDirectory, 'unselected.txt'), 'unselected', 'utf8');

      const preparedRoot = await prepareFilesystemRepositoryRoot({
        rootDirectory: temporaryDirectory,
        selection: {
          kind: 'paths',
          paths: [parseRepositoryPath('/empty'), parseRepositoryPath('/nested/selected.txt')],
        },
      });
      const inventory = await createVerifiedFilesystemInventory(preparedRoot);

      await rm(temporaryDirectory, { force: true, recursive: true });

      await expect(
        getFilesystemRepositoryEntry(inventory, parseRepositoryPath('/nested/selected.txt')),
      ).resolves.toStrictEqual({
        path: parseRepositoryPath('/nested/selected.txt'),
        type: 'file',
      });
      await expect(
        getFilesystemRepositoryEntry(inventory, parseRepositoryPath('/unselected.txt')),
      ).resolves.toBeNull();
      await expect(
        collectEntries(listFilesystemRepositoryEntries(inventory)),
      ).resolves.toStrictEqual([
        { path: parseRepositoryPath('/empty'), type: 'directory' },
        { path: parseRepositoryPath('/nested'), type: 'directory' },
        { path: parseRepositoryPath('/nested/selected.txt'), type: 'file' },
      ]);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('keeps recursive lookup and listing frozen after later filesystem changes', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await mkdir(path.join(temporaryDirectory, 'nested'));
      await writeFile(path.join(temporaryDirectory, 'nested', 'original.txt'), 'original', 'utf8');

      const preparedRoot = await prepareFilesystemRepositoryRoot({
        rootDirectory: temporaryDirectory,
        selection: { kind: 'directory' },
      });
      const inventory = await createVerifiedFilesystemInventory(preparedRoot);

      await rm(path.join(temporaryDirectory, 'nested', 'original.txt'));
      await writeFile(path.join(temporaryDirectory, 'nested', 'created.txt'), 'created', 'utf8');

      await expect(
        getFilesystemRepositoryEntry(inventory, parseRepositoryPath('/nested/original.txt')),
      ).resolves.toStrictEqual({
        path: parseRepositoryPath('/nested/original.txt'),
        type: 'file',
      });
      await expect(
        getFilesystemRepositoryEntry(inventory, parseRepositoryPath('/nested/created.txt')),
      ).resolves.toBeNull();
      await expect(
        collectEntries(
          listFilesystemRepositoryEntries(inventory, {
            prefix: parseRepositoryPath('/nested'),
          }),
        ),
      ).resolves.toStrictEqual([
        { path: parseRepositoryPath('/nested/original.txt'), type: 'file' },
      ]);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
