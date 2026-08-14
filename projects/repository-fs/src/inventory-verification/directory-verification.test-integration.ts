// @vitest-environment node
import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, rename, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expectToRejectCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import { createFilesystemDirectoryInventory } from '../directory-inventory/index.js';
import { prepareFilesystemRepositoryRoot } from '../root/index.js';
import { verifyFilesystemDirectoryInventory } from './index.js';

const createTemporaryDirectory = (): Promise<string> => {
  return mkdtemp(path.join(tmpdir(), 'moldea-repository-fs-directory-verification-'));
};

const createDirectoryInventoryState = async (rootDirectory: string, signal?: AbortSignal) => {
  const preparedRoot = await prepareFilesystemRepositoryRoot({
    rootDirectory,
    selection: { kind: 'directory' },
    signal,
  });
  const inventory = await createFilesystemDirectoryInventory(preparedRoot);

  return { inventory, preparedRoot };
};

const expectSnapshotChanged = async (
  state: Awaited<ReturnType<typeof createDirectoryInventoryState>>,
): Promise<void> => {
  await expectToRejectCode(
    verifyFilesystemDirectoryInventory(state.preparedRoot, state.inventory),
    'SNAPSHOT_CHANGED',
    'The repository snapshot changed during the operation.',
  );
};

describe('filesystem recursive directory inventory verification', () => {
  test('accepts a stable inventory and ignores excluded .git changes', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await mkdir(path.join(temporaryDirectory, 'nested'));
      await writeFile(path.join(temporaryDirectory, 'nested', 'file.txt'), 'selected', 'utf8');
      await mkdir(path.join(temporaryDirectory, '.git'));
      await writeFile(path.join(temporaryDirectory, '.git', 'config'), 'initial', 'utf8');

      const state = await createDirectoryInventoryState(temporaryDirectory);

      await writeFile(path.join(temporaryDirectory, '.git', 'config'), 'changed', 'utf8');
      await writeFile(path.join(temporaryDirectory, 'nested', '.git'), 'control', 'utf8');

      await expect(
        verifyFilesystemDirectoryInventory(state.preparedRoot, state.inventory),
      ).resolves.toBeUndefined();

      await rm(path.join(temporaryDirectory, '.git'), { recursive: true });
      await rm(path.join(temporaryDirectory, 'nested', '.git'));

      await expect(
        verifyFilesystemDirectoryInventory(state.preparedRoot, state.inventory),
      ).resolves.toBeUndefined();
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('rejects a same-size recursively selected file modification', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const fileHostPath = path.join(temporaryDirectory, 'file.txt');

    try {
      await writeFile(fileHostPath, 'before', 'utf8');

      const state = await createDirectoryInventoryState(temporaryDirectory);

      await writeFile(fileHostPath, 'after!', 'utf8');
      await utimes(fileHostPath, new Date(946_684_800_000), new Date(946_684_800_000));

      await expectSnapshotChanged(state);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('rejects an added recursive entry', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await writeFile(path.join(temporaryDirectory, 'existing.txt'), 'existing', 'utf8');

      const state = await createDirectoryInventoryState(temporaryDirectory);

      await writeFile(path.join(temporaryDirectory, 'added.txt'), 'added', 'utf8');

      await expectSnapshotChanged(state);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('rejects a removed recursive entry', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const removedHostPath = path.join(temporaryDirectory, 'removed.txt');

    try {
      await writeFile(removedHostPath, 'removed', 'utf8');

      const state = await createDirectoryInventoryState(temporaryDirectory);

      await rm(removedHostPath);

      await expectSnapshotChanged(state);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('rejects a renamed recursive entry', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const originalHostPath = path.join(temporaryDirectory, 'original.txt');

    try {
      await writeFile(originalHostPath, 'original', 'utf8');

      const state = await createDirectoryInventoryState(temporaryDirectory);

      await rename(originalHostPath, path.join(temporaryDirectory, 'renamed.txt'));

      await expectSnapshotChanged(state);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('rejects replacement of a traversed directory', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const nestedHostPath = path.join(temporaryDirectory, 'nested');
    const previousNestedHostPath = path.join(temporaryDirectory, 'previous-nested');

    try {
      await mkdir(nestedHostPath);

      const state = await createDirectoryInventoryState(temporaryDirectory);

      await rename(nestedHostPath, previousNestedHostPath);
      await mkdir(nestedHostPath);

      await expectSnapshotChanged(state);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('rejects a recursive entry type change', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const fileHostPath = path.join(temporaryDirectory, 'file.txt');

    try {
      await writeFile(fileHostPath, 'selected', 'utf8');

      const state = await createDirectoryInventoryState(temporaryDirectory);

      await rm(fileHostPath);
      await mkdir(fileHostPath);

      await expectSnapshotChanged(state);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test.skipIf(process.platform !== 'linux')(
    'maps a newly introduced invalid raw name to snapshot mutation',
    async () => {
      const temporaryDirectory = await createTemporaryDirectory();
      const invalidEntryPath = Buffer.concat([
        Buffer.from(temporaryDirectory),
        Buffer.from(path.sep),
        Buffer.from([0x80]),
      ]);

      try {
        const state = await createDirectoryInventoryState(temporaryDirectory);

        await writeFile(invalidEntryPath, 'invalid-name');

        await expectSnapshotChanged(state);
        await expect(
          verifyFilesystemDirectoryInventory(state.preparedRoot, state.inventory),
        ).rejects.toMatchObject({
          path: parseRepositoryPath('/'),
          retryable: true,
        });
      } finally {
        await rm(temporaryDirectory, { force: true, recursive: true });
      }
    },
  );

  test('honors cancellation before recursive verification', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const controller = new AbortController();

    try {
      await writeFile(path.join(temporaryDirectory, 'file.txt'), 'selected', 'utf8');

      const state = await createDirectoryInventoryState(temporaryDirectory, controller.signal);

      controller.abort('stop-before-directory-verification');

      await expectToRejectCode(
        verifyFilesystemDirectoryInventory(state.preparedRoot, state.inventory),
        'ABORTED',
        'The repository operation was aborted.',
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
