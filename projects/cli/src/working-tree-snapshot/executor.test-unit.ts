// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import {
  RepositorySourceException,
  parseRepositoryPath,
  type IRepositoryOperation,
  type IRepositorySourceErrorCode,
} from '@moldea.ai/repository';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

import type { IMoldeaCliResourceLimits } from '../command-line/index.js';
import type {
  IGitInventoryEntry,
  IGitInventoryProbe,
  IGitInventoryProbedResult,
} from '../git-inventory/index.js';
import type {
  IGitWorkingTreeIdentity,
  IGitWorkingTreeIdentityInspector,
} from '../git-working-tree/index.js';
import type { IWorkingTreeRepositoryReaderFactory } from '../repository-reader/index.js';

import { createWorkingTreeSnapshotExecutor } from './executor.js';

const REPOSITORY_ROOT = '/workspace';
const RESOURCE_LIMITS: IMoldeaCliResourceLimits = {
  maxDiagnostics: 16,
  maxEntries: 32,
  maxEvidence: 16,
  maxFileBytes: 1024,
  maxManifestBytes: 1024,
  maxTotalBytes: 4096,
};

/** Creates one complete deterministic working-tree identity. */
const createIdentity = (): IGitWorkingTreeIdentity => ({
  commonDirectory: { dev: 1n, ino: 3n, path: '/workspace/.git' },
  gitDirectory: { dev: 1n, ino: 2n, path: '/workspace/.git' },
  repositoryRoot: { dev: 1n, ino: 1n, path: REPOSITORY_ROOT },
});

/** Creates one ordinary normalized tracked inventory entry. */
const createEntry = (path = '/moldea/project.md'): IGitInventoryEntry => ({
  contentTransformation: {
    filter: 'unspecified',
    ident: 'unspecified',
    isGuarded: false,
    workingTreeEncoding: 'unspecified',
  },
  entryType: 'file',
  indexEntries: [{ mode: '100644', stage: 0 }],
  kind: 'tracked',
  path: parseRepositoryPath(path),
  requiresSymlinkOverlay: false,
});

/** Creates one successful immutable inventory-probe result. */
const createInventoryResult = (
  entries: readonly IGitInventoryEntry[] = [createEntry()],
): IGitInventoryProbedResult => Object.freeze({ entries: Object.freeze(entries), kind: 'probed' });

/** Creates an identity inspector that always observes the same identity. */
const createStableIdentityInspector = (): IGitWorkingTreeIdentityInspector =>
  vi
    .fn<IGitWorkingTreeIdentityInspector>()
    .mockResolvedValue(Object.freeze({ identity: createIdentity(), kind: 'inspected' }));

/** Creates one safe common repository-source exception. */
const createSourceException = (
  code: IRepositorySourceErrorCode,
  operation: IRepositoryOperation,
  retryable = true,
): RepositorySourceException =>
  new RepositorySourceException({ code, operation, path: null, retryable });

describe('createWorkingTreeSnapshotExecutor', () => {
  test('pins identity and completes one stable immutable snapshot attempt', async () => {
    const identityInspector = createStableIdentityInspector();
    const inventoryResult = createInventoryResult();
    const inventoryProbe = vi.fn<IGitInventoryProbe>().mockResolvedValue(inventoryResult);
    const reader = createMemoryRepositoryReader([]);
    const repositoryReaderFactory = vi
      .fn<IWorkingTreeRepositoryReaderFactory>()
      .mockResolvedValue(reader);
    const compareInventories = vi.fn().mockReturnValue(true);
    const operation = vi.fn().mockResolvedValue('complete');
    const executeSnapshot = createWorkingTreeSnapshotExecutor(
      identityInspector,
      inventoryProbe,
      repositoryReaderFactory,
      compareInventories,
    );

    await expect(
      executeSnapshot({
        operation,
        repositoryRoot: REPOSITORY_ROOT,
        resourceLimits: RESOURCE_LIMITS,
      }),
    ).resolves.toStrictEqual({ kind: 'completed', result: 'complete' });
    expect(identityInspector).toHaveBeenCalledTimes(2);
    expect(inventoryProbe).toHaveBeenCalledTimes(2);
    expect(inventoryProbe).toHaveBeenNthCalledWith(1, {
      maxEntries: RESOURCE_LIMITS.maxEntries,
      maxMetadataBytes: RESOURCE_LIMITS.maxTotalBytes,
      repositoryRoot: REPOSITORY_ROOT,
    });
    expect(repositoryReaderFactory).toHaveBeenCalledOnce();
    expect(repositoryReaderFactory).toHaveBeenCalledWith({
      entries: inventoryResult.entries,
      repositoryRoot: REPOSITORY_ROOT,
      resourceLimits: RESOURCE_LIMITS,
    });
    expect(repositoryReaderFactory.mock.calls[0]?.[0].resourceLimits).not.toBe(RESOURCE_LIMITS);
    expect(Object.isFrozen(repositoryReaderFactory.mock.calls[0]?.[0].resourceLimits)).toBe(true);
    expect(compareInventories).toHaveBeenCalledWith(
      inventoryResult.entries,
      inventoryResult.entries,
    );
    expect(operation).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledWith(reader);
  });

  test('discards a changed inventory attempt and recreates every provisional boundary', async () => {
    const identityInspector = createStableIdentityInspector();
    const firstInventory = createInventoryResult([createEntry('/moldea/first.md')]);
    const changedInventory = createInventoryResult([createEntry('/moldea/changed.md')]);
    const stableInventory = createInventoryResult([createEntry('/moldea/stable.md')]);
    const inventoryProbe = vi
      .fn<IGitInventoryProbe>()
      .mockResolvedValueOnce(firstInventory)
      .mockResolvedValueOnce(changedInventory)
      .mockResolvedValueOnce(stableInventory)
      .mockResolvedValueOnce(stableInventory);
    const repositoryReaderFactory = vi
      .fn<IWorkingTreeRepositoryReaderFactory>()
      .mockResolvedValue(createMemoryRepositoryReader([]));
    const operation = vi.fn().mockResolvedValue('accepted');
    const executeSnapshot = createWorkingTreeSnapshotExecutor(
      identityInspector,
      inventoryProbe,
      repositoryReaderFactory,
    );

    await expect(
      executeSnapshot({
        operation,
        repositoryRoot: REPOSITORY_ROOT,
        resourceLimits: RESOURCE_LIMITS,
      }),
    ).resolves.toStrictEqual({ kind: 'completed', result: 'accepted' });
    expect(identityInspector).toHaveBeenCalledTimes(3);
    expect(inventoryProbe).toHaveBeenCalledTimes(4);
    expect(repositoryReaderFactory).toHaveBeenCalledTimes(2);
    expect(operation).toHaveBeenCalledOnce();
  });

  test.each(['create-reader', 'read-file'] as const)(
    'retries a SNAPSHOT_CHANGED failure from %s',
    async (operationName) => {
      const identityInspector = createStableIdentityInspector();
      const inventoryProbe = vi.fn<IGitInventoryProbe>().mockResolvedValue(createInventoryResult());
      const reader = createMemoryRepositoryReader([]);
      const repositoryReaderFactory = vi.fn<IWorkingTreeRepositoryReaderFactory>();
      const operation = vi.fn().mockResolvedValue('accepted');

      if (operationName === 'create-reader') {
        repositoryReaderFactory
          .mockRejectedValueOnce(createSourceException('SNAPSHOT_CHANGED', 'create-reader'))
          .mockResolvedValue(reader);
      } else {
        repositoryReaderFactory.mockResolvedValue(reader);
        operation
          .mockRejectedValueOnce(createSourceException('SNAPSHOT_CHANGED', 'read-file'))
          .mockResolvedValue('accepted');
      }

      const executeSnapshot = createWorkingTreeSnapshotExecutor(
        identityInspector,
        inventoryProbe,
        repositoryReaderFactory,
      );

      await expect(
        executeSnapshot({
          operation,
          repositoryRoot: REPOSITORY_ROOT,
          resourceLimits: RESOURCE_LIMITS,
        }),
      ).resolves.toStrictEqual({ kind: 'completed', result: 'accepted' });
      expect(identityInspector).toHaveBeenCalledTimes(3);
      expect(repositoryReaderFactory).toHaveBeenCalledTimes(2);
      expect(operation).toHaveBeenCalledTimes(operationName === 'create-reader' ? 1 : 2);
    },
  );

  test('returns WORKING_TREE_UNSTABLE after all three inventories change', async () => {
    const identityInspector = createStableIdentityInspector();
    const inventories = Array.from({ length: 6 }, (_, index) =>
      createInventoryResult([createEntry(`/moldea/file-${String(index)}.md`)]),
    );
    const inventoryProbe = vi.fn<IGitInventoryProbe>();

    for (const inventory of inventories) {
      inventoryProbe.mockResolvedValueOnce(inventory);
    }

    const repositoryReaderFactory = vi
      .fn<IWorkingTreeRepositoryReaderFactory>()
      .mockResolvedValue(createMemoryRepositoryReader([]));
    const operation = vi.fn().mockResolvedValue('not-reached');
    const executeSnapshot = createWorkingTreeSnapshotExecutor(
      identityInspector,
      inventoryProbe,
      repositoryReaderFactory,
    );

    await expect(
      executeSnapshot({
        operation,
        repositoryRoot: REPOSITORY_ROOT,
        resourceLimits: RESOURCE_LIMITS,
      }),
    ).resolves.toStrictEqual({ errorCode: 'WORKING_TREE_UNSTABLE', kind: 'failed' });
    expect(identityInspector).toHaveBeenCalledTimes(4);
    expect(inventoryProbe).toHaveBeenCalledTimes(6);
    expect(repositoryReaderFactory).toHaveBeenCalledTimes(3);
    expect(operation).not.toHaveBeenCalled();
  });

  test('maps an initially contradictory root to invalid Git output', async () => {
    const identityInspector = vi
      .fn<IGitWorkingTreeIdentityInspector>()
      .mockResolvedValue(Object.freeze({ kind: 'mismatched' }));
    const inventoryProbe = vi.fn<IGitInventoryProbe>();
    const executeSnapshot = createWorkingTreeSnapshotExecutor(identityInspector, inventoryProbe);

    await expect(
      executeSnapshot({
        operation: () => Promise.resolve(),
        repositoryRoot: REPOSITORY_ROOT,
        resourceLimits: RESOURCE_LIMITS,
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
    expect(identityInspector).toHaveBeenCalledOnce();
    expect(inventoryProbe).not.toHaveBeenCalled();
  });

  test.each([
    [Object.freeze({ kind: 'mismatched' })],
    [Object.freeze({ errorCode: 'GIT_REPOSITORY_NOT_FOUND', kind: 'failed' })],
    [Object.freeze({ errorCode: 'GIT_WORK_TREE_REQUIRED', kind: 'failed' })],
  ] as const)(
    'fails when the pinned identity becomes unavailable or different',
    async (failure) => {
      const identityInspector = vi
        .fn<IGitWorkingTreeIdentityInspector>()
        .mockResolvedValueOnce(Object.freeze({ identity: createIdentity(), kind: 'inspected' }))
        .mockResolvedValueOnce(failure);
      const inventoryProbe = vi.fn<IGitInventoryProbe>();
      const executeSnapshot = createWorkingTreeSnapshotExecutor(identityInspector, inventoryProbe);

      await expect(
        executeSnapshot({
          operation: () => Promise.resolve(),
          repositoryRoot: REPOSITORY_ROOT,
          resourceLimits: RESOURCE_LIMITS,
        }),
      ).resolves.toStrictEqual({ errorCode: 'WORKING_TREE_UNSTABLE', kind: 'failed' });
      expect(inventoryProbe).not.toHaveBeenCalled();
    },
  );

  test('preserves a non-mutation identity or inventory failure', async () => {
    const identityInspector = vi
      .fn<IGitWorkingTreeIdentityInspector>()
      .mockResolvedValueOnce(Object.freeze({ identity: createIdentity(), kind: 'inspected' }))
      .mockResolvedValueOnce(Object.freeze({ errorCode: 'GIT_ACCESS_DENIED', kind: 'failed' }));
    const inventoryProbe = vi.fn<IGitInventoryProbe>();
    const executeSnapshot = createWorkingTreeSnapshotExecutor(identityInspector, inventoryProbe);

    await expect(
      executeSnapshot({
        operation: () => Promise.resolve(),
        repositoryRoot: REPOSITORY_ROOT,
        resourceLimits: RESOURCE_LIMITS,
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_ACCESS_DENIED', kind: 'failed' });
    expect(inventoryProbe).not.toHaveBeenCalled();
  });

  test('preserves an inventory-probe failure without creating a provisional reader', async () => {
    const identityInspector = createStableIdentityInspector();
    const inventoryProbe = vi
      .fn<IGitInventoryProbe>()
      .mockResolvedValue(Object.freeze({ errorCode: 'RESOURCE_LIMIT_EXCEEDED', kind: 'failed' }));
    const repositoryReaderFactory = vi.fn<IWorkingTreeRepositoryReaderFactory>();
    const executeSnapshot = createWorkingTreeSnapshotExecutor(
      identityInspector,
      inventoryProbe,
      repositoryReaderFactory,
    );

    await expect(
      executeSnapshot({
        operation: () => Promise.resolve(),
        repositoryRoot: REPOSITORY_ROOT,
        resourceLimits: RESOURCE_LIMITS,
      }),
    ).resolves.toStrictEqual({ errorCode: 'RESOURCE_LIMIT_EXCEEDED', kind: 'failed' });
    expect(inventoryProbe).toHaveBeenCalledOnce();
    expect(repositoryReaderFactory).not.toHaveBeenCalled();
  });

  test.each([
    [createSourceException('ENTRY_NOT_FOUND', 'create-reader')],
    [createSourceException('ENTRY_NOT_DIRECTORY', 'create-reader', false)],
  ])(
    'retries a reader-creation race only when a fresh inventory proves change',
    async (failure) => {
      const identityInspector = createStableIdentityInspector();
      const initialInventory = createInventoryResult([createEntry('/moldea/initial.md')]);
      const changedInventory = createInventoryResult([createEntry('/moldea/changed.md')]);
      const inventoryProbe = vi
        .fn<IGitInventoryProbe>()
        .mockResolvedValueOnce(initialInventory)
        .mockResolvedValueOnce(changedInventory)
        .mockResolvedValueOnce(changedInventory)
        .mockResolvedValueOnce(changedInventory);
      const repositoryReaderFactory = vi
        .fn<IWorkingTreeRepositoryReaderFactory>()
        .mockRejectedValueOnce(failure)
        .mockResolvedValue(createMemoryRepositoryReader([]));
      const executeSnapshot = createWorkingTreeSnapshotExecutor(
        identityInspector,
        inventoryProbe,
        repositoryReaderFactory,
      );

      await expect(
        executeSnapshot({
          operation: () => Promise.resolve('accepted'),
          repositoryRoot: REPOSITORY_ROOT,
          resourceLimits: RESOURCE_LIMITS,
        }),
      ).resolves.toStrictEqual({ kind: 'completed', result: 'accepted' });
      expect(inventoryProbe).toHaveBeenCalledTimes(4);
      expect(repositoryReaderFactory).toHaveBeenCalledTimes(2);
    },
  );

  test.each([
    [createSourceException('ENTRY_NOT_FOUND', 'read-file')],
    [createSourceException('ACCESS_DENIED', 'create-reader')],
  ])('does not retry an ineligible reader-creation failure', async (exception) => {
    const identityInspector = createStableIdentityInspector();
    const inventoryProbe = vi.fn<IGitInventoryProbe>().mockResolvedValue(createInventoryResult());
    const repositoryReaderFactory = vi
      .fn<IWorkingTreeRepositoryReaderFactory>()
      .mockRejectedValue(exception);
    const executeSnapshot = createWorkingTreeSnapshotExecutor(
      identityInspector,
      inventoryProbe,
      repositoryReaderFactory,
    );

    await expect(
      executeSnapshot({
        operation: () => Promise.resolve(),
        repositoryRoot: REPOSITORY_ROOT,
        resourceLimits: RESOURCE_LIMITS,
      }),
    ).rejects.toBe(exception);
    expect(inventoryProbe).toHaveBeenCalledOnce();
  });

  test('preserves a creation race failure when the inventory remains equal', async () => {
    const identityInspector = createStableIdentityInspector();
    const inventoryProbe = vi.fn<IGitInventoryProbe>().mockResolvedValue(createInventoryResult());
    const exception = createSourceException('ENTRY_NOT_DIRECTORY', 'create-reader');
    const repositoryReaderFactory = vi
      .fn<IWorkingTreeRepositoryReaderFactory>()
      .mockRejectedValue(exception);
    const executeSnapshot = createWorkingTreeSnapshotExecutor(
      identityInspector,
      inventoryProbe,
      repositoryReaderFactory,
    );

    await expect(
      executeSnapshot({
        operation: () => Promise.resolve(),
        repositoryRoot: REPOSITORY_ROOT,
        resourceLimits: RESOURCE_LIMITS,
      }),
    ).rejects.toBe(exception);
    expect(inventoryProbe).toHaveBeenCalledTimes(2);
  });

  test('preserves a non-mutation operation failure without another attempt', async () => {
    const identityInspector = createStableIdentityInspector();
    const inventoryProbe = vi.fn<IGitInventoryProbe>().mockResolvedValue(createInventoryResult());
    const repositoryReaderFactory = vi
      .fn<IWorkingTreeRepositoryReaderFactory>()
      .mockResolvedValue(createMemoryRepositoryReader([]));
    const exception = createSourceException('RESOURCE_LIMIT_EXCEEDED', 'read-file', false);
    const executeSnapshot = createWorkingTreeSnapshotExecutor(
      identityInspector,
      inventoryProbe,
      repositoryReaderFactory,
    );

    await expect(
      executeSnapshot({
        operation: () => Promise.reject(exception),
        repositoryRoot: REPOSITORY_ROOT,
        resourceLimits: RESOURCE_LIMITS,
      }),
    ).rejects.toBe(exception);
    expect(inventoryProbe).toHaveBeenCalledTimes(2);
    expect(repositoryReaderFactory).toHaveBeenCalledOnce();
  });

  test('forwards cancellation and does not retry a partial operation result', async () => {
    const controller = new AbortController();
    const identityInspector = createStableIdentityInspector();
    const inventoryProbe = vi.fn<IGitInventoryProbe>().mockResolvedValue(createInventoryResult());
    const repositoryReaderFactory = vi
      .fn<IWorkingTreeRepositoryReaderFactory>()
      .mockResolvedValue(createMemoryRepositoryReader([]));
    const operation = vi.fn((_reader, signal: AbortSignal | undefined) => {
      expect(signal).toBe(controller.signal);
      controller.abort(new Error('private cancellation reason'));

      return Promise.resolve('partial');
    });
    const executeSnapshot = createWorkingTreeSnapshotExecutor(
      identityInspector,
      inventoryProbe,
      repositoryReaderFactory,
    );

    await expect(
      executeSnapshot({
        operation,
        repositoryRoot: REPOSITORY_ROOT,
        resourceLimits: RESOURCE_LIMITS,
        signal: controller.signal,
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OPERATION_ABORTED', kind: 'failed' });
    expect(identityInspector).toHaveBeenCalledTimes(2);
    expect(inventoryProbe).toHaveBeenCalledTimes(2);
    expect(repositoryReaderFactory).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledOnce();
    expect(identityInspector).toHaveBeenNthCalledWith(1, {
      repositoryRoot: REPOSITORY_ROOT,
      signal: controller.signal,
    });
    expect(inventoryProbe).toHaveBeenNthCalledWith(1, {
      maxEntries: RESOURCE_LIMITS.maxEntries,
      maxMetadataBytes: RESOURCE_LIMITS.maxTotalBytes,
      repositoryRoot: REPOSITORY_ROOT,
      signal: controller.signal,
    });
    expect(repositoryReaderFactory).toHaveBeenCalledWith({
      entries: createInventoryResult().entries,
      repositoryRoot: REPOSITORY_ROOT,
      resourceLimits: RESOURCE_LIMITS,
      signal: controller.signal,
    });
  });
});
