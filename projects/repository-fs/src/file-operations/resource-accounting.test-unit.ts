// @vitest-environment node
import { expectToThrowCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import type { IFilesystemRepositoryReaderState } from '../reader-state/index.js';
import {
  commitReservedFilesystemFileCapture,
  releaseFilesystemFileCaptureCapacity,
  reserveFilesystemFileCaptureCapacity,
} from './resource-accounting.js';

const createState = (maxFileBytes = 4, maxCachedBytes = 6): IFilesystemRepositoryReaderState => ({
  cache: {
    cachedByteCount: 0,
    filesByPath: new Map(),
  },
  captures: {
    capturesByPath: new Map(),
    reservedByteCount: 0,
  },
  entriesByPath: new Map(),
  inventory: Object.freeze({ entries: Object.freeze([]) }),
  lifecycle: {
    invalidationCause: undefined,
    isInvalidated: false,
  },
  limits: Object.freeze({ maxCachedBytes, maxEntries: 8, maxFileBytes }),
});

describe('filesystem file-capture resource accounting', () => {
  test('assigns the exact shared budget in synchronous reservation order', () => {
    const state = createState();
    const firstReservation = reserveFilesystemFileCaptureCapacity(state, 4n);
    const deniedReservation = reserveFilesystemFileCaptureCapacity(state, 3n);

    expect(firstReservation).toMatchObject({
      byteCount: 4,
      isAccepted: true,
      maximumByteLength: 4,
    });
    expect(deniedReservation).toMatchObject({
      byteCount: 0,
      isAccepted: false,
      maximumByteLength: 2,
    });
    expect(state.captures.reservedByteCount).toBe(4);

    releaseFilesystemFileCaptureCapacity(state, firstReservation);
    expect(reserveFilesystemFileCaptureCapacity(state, 3n)).toMatchObject({
      byteCount: 3,
      isAccepted: true,
      maximumByteLength: 4,
    });
  });

  test('accounts for committed and reserved bytes without unsafe addition', () => {
    const state = createState(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);

    state.cache.cachedByteCount = Number.MAX_SAFE_INTEGER - 1;
    state.captures.reservedByteCount = 1;

    expect(reserveFilesystemFileCaptureCapacity(state, 1n)).toMatchObject({
      isAccepted: false,
      maximumByteLength: 0,
    });
    expect(state.captures.reservedByteCount).toBe(1);
  });

  test('accepts and commits an exact zero-byte reservation', () => {
    const state = createState();
    const path = parseRepositoryPath('/empty.bin');
    const reservation = reserveFilesystemFileCaptureCapacity(state, 0n);

    commitReservedFilesystemFileCapture(state, path, new Uint8Array(), reservation);

    expect(reservation).toMatchObject({ isAccepted: true, isReleased: true });
    expect(state.cache.cachedByteCount).toBe(0);
    expect(state.cache.filesByPath.get(path)).toStrictEqual(new Uint8Array());
    expect(state.captures.reservedByteCount).toBe(0);
  });

  test('atomically converts one accepted reservation into private cached bytes', () => {
    const state = createState();
    const path = parseRepositoryPath('/file.bin');
    const capturedBytes = Uint8Array.from([1, 2, 3]);
    const reservation = reserveFilesystemFileCaptureCapacity(state, 3n);

    commitReservedFilesystemFileCapture(state, path, capturedBytes, reservation);
    capturedBytes.fill(9);

    expect(state.cache.filesByPath.get(path)).toStrictEqual(Uint8Array.from([1, 2, 3]));
    expect(state.cache.cachedByteCount).toBe(3);
    expect(state.captures.reservedByteCount).toBe(0);
    expect(reservation.isReleased).toBe(true);
  });

  test('releases accepted capacity once and ignores denied capacity', () => {
    const state = createState();
    const acceptedReservation = reserveFilesystemFileCaptureCapacity(state, 4n);
    const deniedReservation = reserveFilesystemFileCaptureCapacity(state, 3n);

    releaseFilesystemFileCaptureCapacity(state, acceptedReservation);
    releaseFilesystemFileCaptureCapacity(state, acceptedReservation);
    releaseFilesystemFileCaptureCapacity(state, deniedReservation);

    expect(state.captures.reservedByteCount).toBe(0);
    expect(acceptedReservation.isReleased).toBe(true);
    expect(deniedReservation.isReleased).toBe(true);
  });

  test.each([
    [
      {
        byteCount: 0,
        isAccepted: false,
        isReleased: false,
        maximumByteLength: 2,
      },
      Uint8Array.from([1, 2, 3]),
      'RESOURCE_LIMIT_EXCEEDED',
    ],
    [
      {
        byteCount: 2,
        isAccepted: true,
        isReleased: false,
        maximumByteLength: 4,
      },
      Uint8Array.from([1]),
      'INVALID_SOURCE_DATA',
    ],
  ] as const)('rejects an invalid commit with %s', (reservation, capturedBytes, expectedCode) => {
    const state = createState();

    expectToThrowCode(
      () =>
        commitReservedFilesystemFileCapture(
          state,
          parseRepositoryPath('/file.bin'),
          capturedBytes,
          reservation,
        ),
      expectedCode,
    );
    expect(state.cache.filesByPath.size).toBe(0);
  });
});
