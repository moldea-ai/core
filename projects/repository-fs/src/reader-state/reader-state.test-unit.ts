// @vitest-environment node
import { expectToThrowCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { RepositorySourceException, parseRepositoryPath } from '@moldea.ai/repository';

import { DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS } from '../constants/index.js';
import type { IFilesystemInventory } from '../inventory/index.js';
import type { IPreparedFilesystemRepositoryRoot } from '../root/index.js';
import {
  createFilesystemRepositoryReaderState,
  invalidateFilesystemRepositoryReader,
  markFilesystemRepositoryReaderInvalidated,
  throwIfFilesystemRepositoryReaderInvalidated,
} from './index.js';

const createState = () => {
  const rootPath = parseRepositoryPath('/');
  const rootIdentity = Object.freeze({
    birthtimeNanoseconds: 1n,
    device: 2n,
    inode: 3n,
    mode: 16_877n,
  });
  const inventory: IFilesystemInventory = Object.freeze({
    entries: Object.freeze([
      Object.freeze({
        hostPath: '/private/source',
        identity: rootIdentity,
        path: rootPath,
        type: 'directory' as const,
      }),
    ]),
  });
  const preparedRoot: IPreparedFilesystemRepositoryRoot = Object.freeze({
    identity: rootIdentity,
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

describe('filesystem repository reader lifecycle', () => {
  test('creates active state with one empty private cache', () => {
    const state = createState();

    expect(state.lifecycle).toStrictEqual({
      invalidationCause: undefined,
      isInvalidated: false,
    });
    expect(state.cache.cachedByteCount).toBe(0);
    expect(state.cache.filesByPath.size).toBe(0);
    expect(state.captures.capturesByPath.size).toBe(0);
    expect(state.captures.reservedByteCount).toBe(0);
    expect(Object.isFrozen(state)).toBe(true);
  });

  test('permanently invalidates once and disposes every cached byte', () => {
    const state = createState();
    const firstPath = parseRepositoryPath('/first.bin');
    const secondPath = parseRepositoryPath('/second.bin');
    const firstCause = new Error('/private/source/first.bin');
    const secondCause = new Error('/private/source/second.bin');

    state.cache.filesByPath.set(firstPath, Uint8Array.from([1, 2, 3]));
    state.cache.cachedByteCount = 3;

    expectToThrowCode(
      () => invalidateFilesystemRepositoryReader(state, 'read-file', firstPath, firstCause),
      'SNAPSHOT_CHANGED',
    );
    expect(state.lifecycle).toStrictEqual({
      invalidationCause: firstCause,
      isInvalidated: true,
    });
    expect(state.cache.cachedByteCount).toBe(0);
    expect(state.cache.filesByPath.size).toBe(0);

    let subsequentFailure: unknown;

    try {
      invalidateFilesystemRepositoryReader(state, 'get-entry', secondPath, secondCause);
    } catch (cause) {
      subsequentFailure = cause;
    }

    expect(subsequentFailure).toBeInstanceOf(RepositorySourceException);
    expect(subsequentFailure).toMatchObject({
      operation: 'get-entry',
      path: secondPath,
      retryable: true,
    });
    expect(subsequentFailure).toHaveProperty('cause', firstCause);
    expect(JSON.stringify(subsequentFailure)).not.toContain('/private/source');
    expect(state.lifecycle.invalidationCause).toBe(firstCause);
  });

  test('marks invalidation and clears cached bytes without waiting for exception delivery', () => {
    const state = createState();
    const cachedPath = parseRepositoryPath('/cached.bin');
    const pendingPath = parseRepositoryPath('/pending.bin');
    const firstCause = new Error('/private/source/cached.bin');
    const laterCause = new Error('/private/source/later.bin');
    const captureController = new AbortController();
    const reservation = {
      byteCount: 3,
      isAccepted: true,
      isReleased: false,
      maximumByteLength: 3,
    };

    state.cache.filesByPath.set(cachedPath, Uint8Array.from([1, 2, 3]));
    state.cache.cachedByteCount = 3;
    state.captures.capturesByPath.set(pendingPath, {
      controller: captureController,
      isAcceptingWaiters: true,
      promise: Promise.resolve(),
      reservation,
      waiterCount: 1,
    });
    state.captures.reservedByteCount = 3;

    markFilesystemRepositoryReaderInvalidated(state, firstCause);
    markFilesystemRepositoryReaderInvalidated(state, laterCause);

    expect(state.lifecycle).toStrictEqual({
      invalidationCause: firstCause,
      isInvalidated: true,
    });
    expect(state.cache.cachedByteCount).toBe(0);
    expect(state.cache.filesByPath.size).toBe(0);
    expect(state.captures.capturesByPath.size).toBe(0);
    expect(state.captures.reservedByteCount).toBe(0);
    expect(captureController.signal.aborted).toBe(true);
    expect(captureController.signal.reason).toBe(firstCause);
    expect(reservation.isReleased).toBe(true);
  });

  test('reports invalidation with the current operation and logical path', () => {
    const state = createState();
    const firstPath = parseRepositoryPath('/first.bin');
    const requestedPath = parseRepositoryPath('/requested');

    expect(() =>
      throwIfFilesystemRepositoryReaderInvalidated(state, 'list-entries', requestedPath),
    ).not.toThrow();

    expectToThrowCode(
      () => invalidateFilesystemRepositoryReader(state, 'read-file', firstPath),
      'SNAPSHOT_CHANGED',
    );

    try {
      throwIfFilesystemRepositoryReaderInvalidated(state, 'list-entries', requestedPath);
    } catch (cause) {
      expect(cause).toMatchObject({
        operation: 'list-entries',
        path: requestedPath,
        retryable: true,
      });
    }
  });
});
