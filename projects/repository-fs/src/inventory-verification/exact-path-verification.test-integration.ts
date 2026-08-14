// @vitest-environment node
import { mkdir, mkdtemp, rename, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expectToRejectCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath, type IRepositoryPath } from '@moldea.ai/repository';

import { createFilesystemExactPathInventory } from '../exact-path-inventory/index.js';
import { createFilesystemExactPathSelectionPlan } from '../exact-path-selection/index.js';
import { prepareFilesystemRepositoryRoot } from '../root/index.js';
import { verifyFilesystemExactPathInventory } from './index.js';

const createTemporaryDirectory = (): Promise<string> => {
  return mkdtemp(path.join(tmpdir(), 'moldea-repository-fs-exact-verification-'));
};

const createExactInventoryState = async (
  rootDirectory: string,
  selectedPaths: readonly IRepositoryPath[],
  signal?: AbortSignal,
) => {
  const preparedRoot = await prepareFilesystemRepositoryRoot({
    rootDirectory,
    selection: { kind: 'paths', paths: selectedPaths },
    signal,
  });

  if (preparedRoot.options.selection.kind !== 'paths') {
    throw new Error('Expected normalized exact-path selection.');
  }

  const selectionPlan = createFilesystemExactPathSelectionPlan(
    preparedRoot.options.selection,
    preparedRoot.options.limits.maxEntries,
  );
  const inventory = await createFilesystemExactPathInventory(preparedRoot, selectionPlan);

  return { inventory, preparedRoot, selectionPlan };
};

describe('filesystem exact-path inventory verification', () => {
  test('accepts a stable inventory while ignoring unrelated sibling changes', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const selectedPath = parseRepositoryPath('/selected/file.txt');

    try {
      await mkdir(path.join(temporaryDirectory, 'selected'));
      await writeFile(path.join(temporaryDirectory, 'selected', 'file.txt'), 'selected', 'utf8');
      await writeFile(path.join(temporaryDirectory, 'unrelated.txt'), 'before', 'utf8');

      const state = await createExactInventoryState(temporaryDirectory, [selectedPath]);

      await writeFile(path.join(temporaryDirectory, 'unrelated.txt'), 'after', 'utf8');
      await writeFile(path.join(temporaryDirectory, 'new-sibling.txt'), 'new', 'utf8');

      await expect(
        verifyFilesystemExactPathInventory(
          state.preparedRoot,
          state.selectionPlan,
          state.inventory,
        ),
      ).resolves.toBeUndefined();
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('rejects a same-size in-place selected-file modification', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const selectedHostPath = path.join(temporaryDirectory, 'selected.txt');

    try {
      await writeFile(selectedHostPath, 'before', 'utf8');

      const state = await createExactInventoryState(temporaryDirectory, [
        parseRepositoryPath('/selected.txt'),
      ]);

      await writeFile(selectedHostPath, 'after!', 'utf8');
      await utimes(selectedHostPath, new Date(946_684_800_000), new Date(946_684_800_000));

      await expectToRejectCode(
        verifyFilesystemExactPathInventory(
          state.preparedRoot,
          state.selectionPlan,
          state.inventory,
        ),
        'SNAPSHOT_CHANGED',
        'The repository snapshot changed during the operation.',
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('rejects a size-changing selected-file modification', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const selectedHostPath = path.join(temporaryDirectory, 'selected.txt');

    try {
      await writeFile(selectedHostPath, 'before', 'utf8');

      const state = await createExactInventoryState(temporaryDirectory, [
        parseRepositoryPath('/selected.txt'),
      ]);

      await writeFile(selectedHostPath, 'a longer replacement', 'utf8');

      await expectToRejectCode(
        verifyFilesystemExactPathInventory(
          state.preparedRoot,
          state.selectionPlan,
          state.inventory,
        ),
        'SNAPSHOT_CHANGED',
        'The repository snapshot changed during the operation.',
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('rejects an atomic selected-file replacement', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const selectedHostPath = path.join(temporaryDirectory, 'selected.txt');
    const replacementHostPath = path.join(temporaryDirectory, 'replacement.txt');

    try {
      await writeFile(selectedHostPath, 'selected', 'utf8');

      const state = await createExactInventoryState(temporaryDirectory, [
        parseRepositoryPath('/selected.txt'),
      ]);

      await writeFile(replacementHostPath, 'selected', 'utf8');
      await rename(replacementHostPath, selectedHostPath);

      await expectToRejectCode(
        verifyFilesystemExactPathInventory(
          state.preparedRoot,
          state.selectionPlan,
          state.inventory,
        ),
        'SNAPSHOT_CHANGED',
        'The repository snapshot changed during the operation.',
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('rejects a selected entry type change', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const selectedHostPath = path.join(temporaryDirectory, 'selected.txt');

    try {
      await writeFile(selectedHostPath, 'selected', 'utf8');

      const state = await createExactInventoryState(temporaryDirectory, [
        parseRepositoryPath('/selected.txt'),
      ]);

      await rm(selectedHostPath);
      await mkdir(selectedHostPath);

      await expectToRejectCode(
        verifyFilesystemExactPathInventory(
          state.preparedRoot,
          state.selectionPlan,
          state.inventory,
        ),
        'SNAPSHOT_CHANGED',
        'The repository snapshot changed during the operation.',
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('rejects replacement of a required parent directory', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const parentHostPath = path.join(temporaryDirectory, 'parent');
    const previousParentHostPath = path.join(temporaryDirectory, 'previous-parent');

    try {
      await mkdir(path.join(parentHostPath, 'leaf'), { recursive: true });

      const state = await createExactInventoryState(temporaryDirectory, [
        parseRepositoryPath('/parent/leaf'),
      ]);

      await rename(parentHostPath, previousParentHostPath);
      await mkdir(parentHostPath);
      await rename(path.join(previousParentHostPath, 'leaf'), path.join(parentHostPath, 'leaf'));

      await expectToRejectCode(
        verifyFilesystemExactPathInventory(
          state.preparedRoot,
          state.selectionPlan,
          state.inventory,
        ),
        'SNAPSHOT_CHANGED',
        'The repository snapshot changed during the operation.',
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('rejects replacement of the resolved root identity', async () => {
    const temporaryContainer = await createTemporaryDirectory();
    const rootDirectory = path.join(temporaryContainer, 'root');
    const previousRootDirectory = path.join(temporaryContainer, 'previous-root');

    try {
      await mkdir(rootDirectory);

      const state = await createExactInventoryState(rootDirectory, []);

      await rename(rootDirectory, previousRootDirectory);
      await mkdir(rootDirectory);

      await expectToRejectCode(
        verifyFilesystemExactPathInventory(
          state.preparedRoot,
          state.selectionPlan,
          state.inventory,
        ),
        'SNAPSHOT_CHANGED',
        'The repository snapshot changed during the operation.',
      );
    } finally {
      await rm(temporaryContainer, { force: true, recursive: true });
    }
  });

  test('rejects loss of an exact selected source name with safe metadata', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const selectedHostPath = path.join(temporaryDirectory, 'selected.txt');

    try {
      await writeFile(selectedHostPath, 'selected', 'utf8');

      const state = await createExactInventoryState(temporaryDirectory, [
        parseRepositoryPath('/selected.txt'),
      ]);

      await rename(selectedHostPath, path.join(temporaryDirectory, 'renamed.txt'));
      let rejection: unknown;

      try {
        await verifyFilesystemExactPathInventory(
          state.preparedRoot,
          state.selectionPlan,
          state.inventory,
        );
      } catch (cause) {
        rejection = cause;
      }

      expect(rejection).toMatchObject({
        code: 'SNAPSHOT_CHANGED',
        path: parseRepositoryPath('/selected.txt'),
        retryable: true,
      });
      expect(JSON.stringify(rejection)).not.toContain(temporaryDirectory);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('honors cancellation before verification', async () => {
    const temporaryDirectory = await createTemporaryDirectory();
    const controller = new AbortController();

    try {
      await writeFile(path.join(temporaryDirectory, 'selected.txt'), 'selected', 'utf8');

      const state = await createExactInventoryState(
        temporaryDirectory,
        [parseRepositoryPath('/selected.txt')],
        controller.signal,
      );

      controller.abort('stop-before-exact-verification');

      await expectToRejectCode(
        verifyFilesystemExactPathInventory(
          state.preparedRoot,
          state.selectionPlan,
          state.inventory,
        ),
        'ABORTED',
        'The repository operation was aborted.',
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
