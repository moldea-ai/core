// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import { prepareFilesystemRepositoryRoot } from '../root/index.js';
import { createVerifiedFilesystemInventory } from './index.js';

const createTemporaryDirectory = (): Promise<string> => {
  return mkdtemp(path.join(tmpdir(), 'moldea-repository-fs-verified-'));
};

describe('verified filesystem inventory construction', () => {
  test('constructs and verifies an exact-path inventory', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await mkdir(path.join(temporaryDirectory, 'nested'));
      await writeFile(path.join(temporaryDirectory, 'nested', 'selected.txt'), 'selected', 'utf8');
      await writeFile(path.join(temporaryDirectory, 'unselected.txt'), 'unselected', 'utf8');

      const preparedRoot = await prepareFilesystemRepositoryRoot({
        rootDirectory: temporaryDirectory,
        selection: {
          kind: 'paths',
          paths: [parseRepositoryPath('/nested/selected.txt')],
        },
      });
      const inventory = await createVerifiedFilesystemInventory(preparedRoot);

      expect(inventory.entries.map((entry) => entry.path)).toStrictEqual([
        parseRepositoryPath('/'),
        parseRepositoryPath('/nested'),
        parseRepositoryPath('/nested/selected.txt'),
      ]);
      expect(inventory.entries.at(-1)).toMatchObject({ type: 'file' });
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('constructs and verifies a complete recursive inventory', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await mkdir(path.join(temporaryDirectory, 'nested'));
      await writeFile(path.join(temporaryDirectory, 'nested', 'file.txt'), 'selected', 'utf8');
      await mkdir(path.join(temporaryDirectory, '.git'));
      await writeFile(path.join(temporaryDirectory, '.git', 'config'), 'control', 'utf8');

      const preparedRoot = await prepareFilesystemRepositoryRoot({
        rootDirectory: temporaryDirectory,
        selection: { kind: 'directory' },
      });
      const inventory = await createVerifiedFilesystemInventory(preparedRoot);

      expect(inventory.entries.map((entry) => entry.path)).toStrictEqual([
        parseRepositoryPath('/'),
        parseRepositoryPath('/nested'),
        parseRepositoryPath('/nested/file.txt'),
      ]);
      expect(inventory.entries.at(-1)).toMatchObject({ type: 'file' });
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
