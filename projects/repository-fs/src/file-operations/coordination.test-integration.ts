// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expectToRejectCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import type { IFilesystemRepositoryResourceLimits } from '../contracts/index.js';
import { createFilesystemRepositoryReaderState } from '../reader-state/index.js';
import { prepareFilesystemRepositoryRoot } from '../root/index.js';
import { createVerifiedFilesystemInventory } from '../verified-inventory/index.js';
import { readFilesystemRepositoryFile } from './index.js';

interface IDeferredCompletion {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

const createTemporaryDirectory = (): Promise<string> => {
  return mkdtemp(path.join(tmpdir(), 'moldea-repository-fs-coordination-'));
};

const createDeferredCompletion = (): IDeferredCompletion => {
  let resolveCompletion!: () => void;
  const promise = new Promise<void>((resolve) => {
    resolveCompletion = resolve;
  });

  return { promise, resolve: resolveCompletion };
};

const createDirectoryState = async (
  rootDirectory: string,
  limits?: Partial<IFilesystemRepositoryResourceLimits>,
) => {
  const preparedRoot = await prepareFilesystemRepositoryRoot({
    limits,
    rootDirectory,
    selection: { kind: 'directory' },
  });
  const inventory = await createVerifiedFilesystemInventory(preparedRoot);

  return createFilesystemRepositoryReaderState(preparedRoot, inventory);
};

describe('filesystem file-capture coordination', () => {
  test('shares one same-path capture and returns independent caller buffers', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const originalBytes = Uint8Array.from([1, 2, 3, 4]);

      await writeFile(path.join(temporaryDirectory, 'file.bin'), originalBytes);

      const state = await createDirectoryState(temporaryDirectory);
      const logicalPath = parseRepositoryPath('/file.bin');
      const capturePaused = createDeferredCompletion();
      const captureRelease = createDeferredCompletion();
      let captureCount = 0;
      const firstRead = readFilesystemRepositoryFile(state, logicalPath, undefined, {
        afterOpen: async () => {
          captureCount += 1;
          capturePaused.resolve();
          await captureRelease.promise;
        },
      });

      await capturePaused.promise;

      const secondRead = readFilesystemRepositoryFile(state, logicalPath);

      await Promise.resolve();
      expect(state.captures.capturesByPath.get(logicalPath)?.waiterCount).toBe(2);
      expect(state.captures.reservedByteCount).toBe(originalBytes.byteLength);

      captureRelease.resolve();

      const [firstResult, secondResult] = await Promise.all([firstRead, secondRead]);

      expect(firstResult).toStrictEqual(originalBytes);
      expect(secondResult).toStrictEqual(originalBytes);
      expect(firstResult).not.toBe(secondResult);
      expect(captureCount).toBe(1);
      expect(state.cache.cachedByteCount).toBe(originalBytes.byteLength);
      expect(state.captures.capturesByPath.size).toBe(0);
      expect(state.captures.reservedByteCount).toBe(0);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('detaches a cancelled waiting caller while the shared capture succeeds', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const originalBytes = Uint8Array.from([5, 6, 7]);

      await writeFile(path.join(temporaryDirectory, 'file.bin'), originalBytes);

      const state = await createDirectoryState(temporaryDirectory);
      const logicalPath = parseRepositoryPath('/file.bin');
      const capturePaused = createDeferredCompletion();
      const captureRelease = createDeferredCompletion();
      const waitingController = new AbortController();
      const firstRead = readFilesystemRepositoryFile(state, logicalPath, undefined, {
        afterOpen: async () => {
          capturePaused.resolve();
          await captureRelease.promise;
        },
      });

      await capturePaused.promise;

      const waitingRead = readFilesystemRepositoryFile(state, logicalPath, {
        signal: waitingController.signal,
      });

      await Promise.resolve();
      expect(state.captures.capturesByPath.get(logicalPath)?.waiterCount).toBe(2);

      waitingController.abort('detach-waiter');

      await expectToRejectCode(waitingRead, 'ABORTED');
      expect(state.captures.capturesByPath.get(logicalPath)?.waiterCount).toBe(1);

      captureRelease.resolve();

      await expect(firstRead).resolves.toStrictEqual(originalBytes);
      expect(state.lifecycle.isInvalidated).toBe(false);
      expect(state.cache.cachedByteCount).toBe(originalBytes.byteLength);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('detaches a cancelled initiating caller while a later waiter succeeds', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const originalBytes = Uint8Array.from([8, 9, 10]);

      await writeFile(path.join(temporaryDirectory, 'file.bin'), originalBytes);

      const state = await createDirectoryState(temporaryDirectory);
      const logicalPath = parseRepositoryPath('/file.bin');
      const capturePaused = createDeferredCompletion();
      const captureRelease = createDeferredCompletion();
      const initiatingController = new AbortController();
      const initiatingRead = readFilesystemRepositoryFile(
        state,
        logicalPath,
        { signal: initiatingController.signal },
        {
          afterOpen: async () => {
            capturePaused.resolve();
            await captureRelease.promise;
          },
        },
      );

      await capturePaused.promise;

      const waitingRead = readFilesystemRepositoryFile(state, logicalPath);

      await Promise.resolve();
      expect(state.captures.capturesByPath.get(logicalPath)?.waiterCount).toBe(2);

      initiatingController.abort('detach-initiator');

      await expectToRejectCode(initiatingRead, 'ABORTED');
      expect(state.captures.capturesByPath.get(logicalPath)?.waiterCount).toBe(1);

      captureRelease.resolve();

      await expect(waitingRead).resolves.toStrictEqual(originalBytes);
      expect(state.lifecycle.isInvalidated).toBe(false);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('abandons an all-cancelled capture, cleans it up, and starts a fresh retry', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const originalBytes = Uint8Array.from([11, 12, 13]);

      await writeFile(path.join(temporaryDirectory, 'file.bin'), originalBytes);

      const state = await createDirectoryState(temporaryDirectory);
      const logicalPath = parseRepositoryPath('/file.bin');
      const capturePaused = createDeferredCompletion();
      const captureRelease = createDeferredCompletion();
      const firstController = new AbortController();
      const secondController = new AbortController();
      const firstRead = readFilesystemRepositoryFile(
        state,
        logicalPath,
        { signal: firstController.signal },
        {
          afterOpen: async () => {
            capturePaused.resolve();
            await captureRelease.promise;
          },
        },
      );

      await capturePaused.promise;

      const secondRead = readFilesystemRepositoryFile(state, logicalPath, {
        signal: secondController.signal,
      });

      await Promise.resolve();
      firstController.abort('cancel-first');
      await expectToRejectCode(firstRead, 'ABORTED');

      secondController.abort('cancel-final');
      await Promise.resolve();

      expect(state.captures.capturesByPath.get(logicalPath)).toMatchObject({
        isAcceptingWaiters: false,
        waiterCount: 1,
      });

      const retryRead = readFilesystemRepositoryFile(state, logicalPath);

      await Promise.resolve();
      expect(state.captures.capturesByPath.get(logicalPath)?.waiterCount).toBe(1);

      captureRelease.resolve();

      await expectToRejectCode(secondRead, 'ABORTED');
      await expect(retryRead).resolves.toStrictEqual(originalBytes);
      expect(state.lifecycle.isInvalidated).toBe(false);
      expect(state.cache.cachedByteCount).toBe(originalBytes.byteLength);
      expect(state.captures.capturesByPath.size).toBe(0);
      expect(state.captures.reservedByteCount).toBe(0);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('shares a stable capture failure without caching it and permits retry', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const originalBytes = Uint8Array.from([14, 15, 16]);

      await writeFile(path.join(temporaryDirectory, 'file.bin'), originalBytes);

      const state = await createDirectoryState(temporaryDirectory);
      const logicalPath = parseRepositoryPath('/file.bin');
      const capturePaused = createDeferredCompletion();
      const captureRelease = createDeferredCompletion();
      let captureCount = 0;
      const firstRead = readFilesystemRepositoryFile(state, logicalPath, undefined, {
        afterOpen: async () => {
          captureCount += 1;
          capturePaused.resolve();
          await captureRelease.promise;
          throw Object.assign(new Error('stable capture failure'), { code: 'EIO' });
        },
      });

      await capturePaused.promise;

      const secondRead = readFilesystemRepositoryFile(state, logicalPath);

      await Promise.resolve();
      captureRelease.resolve();

      await Promise.all([
        expectToRejectCode(firstRead, 'SOURCE_UNAVAILABLE'),
        expectToRejectCode(secondRead, 'SOURCE_UNAVAILABLE'),
      ]);
      expect(captureCount).toBe(1);
      expect(state.lifecycle.isInvalidated).toBe(false);
      expect(state.cache.cachedByteCount).toBe(0);
      expect(state.captures.reservedByteCount).toBe(0);

      await expect(readFilesystemRepositoryFile(state, logicalPath)).resolves.toStrictEqual(
        originalBytes,
      );
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('invalidates every same-path waiter when the shared capture changes', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const hostPath = path.join(temporaryDirectory, 'file.bin');

      await writeFile(hostPath, Uint8Array.from([17, 18, 19]));

      const state = await createDirectoryState(temporaryDirectory);
      const logicalPath = parseRepositoryPath('/file.bin');
      const capturePaused = createDeferredCompletion();
      const captureRelease = createDeferredCompletion();
      const firstRead = readFilesystemRepositoryFile(state, logicalPath, undefined, {
        afterOpen: async () => {
          capturePaused.resolve();
          await captureRelease.promise;
        },
      });

      await capturePaused.promise;

      const secondRead = readFilesystemRepositoryFile(state, logicalPath);

      await Promise.resolve();
      await writeFile(hostPath, Uint8Array.from([19, 18, 17]));
      captureRelease.resolve();

      await Promise.all([
        expectToRejectCode(firstRead, 'SNAPSHOT_CHANGED'),
        expectToRejectCode(secondRead, 'SNAPSHOT_CHANGED'),
      ]);
      expect(state.lifecycle.isInvalidated).toBe(true);
      expect(state.cache.cachedByteCount).toBe(0);
      expect(state.captures.capturesByPath.size).toBe(0);
      expect(state.captures.reservedByteCount).toBe(0);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('captures different paths concurrently', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await writeFile(path.join(temporaryDirectory, 'first.bin'), Uint8Array.from([1, 2]));
      await writeFile(path.join(temporaryDirectory, 'second.bin'), Uint8Array.from([3, 4]));

      const state = await createDirectoryState(temporaryDirectory);
      const firstPath = parseRepositoryPath('/first.bin');
      const secondPath = parseRepositoryPath('/second.bin');
      const firstPaused = createDeferredCompletion();
      const secondPaused = createDeferredCompletion();
      const captureRelease = createDeferredCompletion();
      const firstRead = readFilesystemRepositoryFile(state, firstPath, undefined, {
        afterOpen: async () => {
          firstPaused.resolve();
          await captureRelease.promise;
        },
      });
      const secondRead = readFilesystemRepositoryFile(state, secondPath, undefined, {
        afterOpen: async () => {
          secondPaused.resolve();
          await captureRelease.promise;
        },
      });

      await Promise.all([firstPaused.promise, secondPaused.promise]);

      expect(state.captures.capturesByPath.size).toBe(2);
      expect(state.captures.reservedByteCount).toBe(4);

      captureRelease.resolve();

      await expect(firstRead).resolves.toStrictEqual(Uint8Array.from([1, 2]));
      await expect(secondRead).resolves.toStrictEqual(Uint8Array.from([3, 4]));
      expect(state.cache.cachedByteCount).toBe(4);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('keeps reservation-order capacity deterministic across reversed completion', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      const acceptedBytes = Uint8Array.from([1, 2, 3, 4]);

      await writeFile(path.join(temporaryDirectory, 'accepted.bin'), acceptedBytes);
      await writeFile(path.join(temporaryDirectory, 'denied.bin'), Uint8Array.from([5, 6, 7]));

      const state = await createDirectoryState(temporaryDirectory, {
        maxCachedBytes: 4,
        maxEntries: 4,
        maxFileBytes: 4,
      });
      const acceptedPath = parseRepositoryPath('/accepted.bin');
      const deniedPath = parseRepositoryPath('/denied.bin');
      const acceptedPaused = createDeferredCompletion();
      const deniedPaused = createDeferredCompletion();
      const acceptedRelease = createDeferredCompletion();
      const deniedRelease = createDeferredCompletion();
      const acceptedRead = readFilesystemRepositoryFile(state, acceptedPath, undefined, {
        afterOpen: async () => {
          acceptedPaused.resolve();
          await acceptedRelease.promise;
        },
      });

      await acceptedPaused.promise;

      const deniedRead = readFilesystemRepositoryFile(state, deniedPath, undefined, {
        afterOpen: async () => {
          deniedPaused.resolve();
          await deniedRelease.promise;
        },
      });

      await deniedPaused.promise;
      expect(state.captures.reservedByteCount).toBe(acceptedBytes.byteLength);

      deniedRelease.resolve();

      await expectToRejectCode(deniedRead, 'RESOURCE_LIMIT_EXCEEDED');
      expect(state.captures.reservedByteCount).toBe(acceptedBytes.byteLength);
      expect(state.cache.cachedByteCount).toBe(0);

      acceptedRelease.resolve();

      await expect(acceptedRead).resolves.toStrictEqual(acceptedBytes);
      expect(state.cache.cachedByteCount).toBe(acceptedBytes.byteLength);
      expect(state.cache.filesByPath.has(acceptedPath)).toBe(true);
      expect(state.cache.filesByPath.has(deniedPath)).toBe(false);
      expect(state.captures.reservedByteCount).toBe(0);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });

  test('clears every pending reservation before invalidated captures finish cleanup', async () => {
    const temporaryDirectory = await createTemporaryDirectory();

    try {
      await writeFile(path.join(temporaryDirectory, 'first.bin'), Uint8Array.from([1, 1, 1]));
      await writeFile(path.join(temporaryDirectory, 'second.bin'), Uint8Array.from([2, 2, 2]));
      const changedHostPath = path.join(temporaryDirectory, 'changed.bin');

      await writeFile(changedHostPath, Uint8Array.from([3, 3, 3]));

      const state = await createDirectoryState(temporaryDirectory, {
        maxCachedBytes: 6,
        maxEntries: 4,
        maxFileBytes: 3,
      });
      const firstPath = parseRepositoryPath('/first.bin');
      const secondPath = parseRepositoryPath('/second.bin');
      const changedPath = parseRepositoryPath('/changed.bin');
      const firstPaused = createDeferredCompletion();
      const secondPaused = createDeferredCompletion();
      const captureRelease = createDeferredCompletion();
      const firstRead = readFilesystemRepositoryFile(state, firstPath, undefined, {
        afterOpen: async () => {
          firstPaused.resolve();
          await captureRelease.promise;
        },
      });
      const secondRead = readFilesystemRepositoryFile(state, secondPath, undefined, {
        afterOpen: async () => {
          secondPaused.resolve();
          await captureRelease.promise;
        },
      });

      await Promise.all([firstPaused.promise, secondPaused.promise]);
      expect(state.captures.reservedByteCount).toBe(6);

      await writeFile(changedHostPath, Uint8Array.from([4, 4, 4]));
      await expectToRejectCode(
        readFilesystemRepositoryFile(state, changedPath),
        'SNAPSHOT_CHANGED',
      );

      expect(state.lifecycle.isInvalidated).toBe(true);
      expect(state.captures.capturesByPath.size).toBe(0);
      expect(state.captures.reservedByteCount).toBe(0);
      expect(state.cache.cachedByteCount).toBe(0);

      captureRelease.resolve();

      await Promise.all([
        expectToRejectCode(firstRead, 'SNAPSHOT_CHANGED'),
        expectToRejectCode(secondRead, 'SNAPSHOT_CHANGED'),
      ]);
      expect(state.captures.reservedByteCount).toBe(0);
    } finally {
      await rm(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
