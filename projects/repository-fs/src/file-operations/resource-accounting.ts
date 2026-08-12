import type { IRepositoryPath } from '@moldea.ai/repository';

import type {
  IFilesystemRepositoryFileCaptureReservation,
  IFilesystemRepositoryReaderState,
} from '../reader-state/index.js';
import { throwFilesystemRepositoryOperationException } from '../source-exception/index.js';

/**
 * Reserves exact frozen file capacity before any asynchronous capture work begins.
 * @param state The shared cache and active reservation accounting.
 * @param frozenByteLength The file length recorded in the frozen inventory.
 * @returns The accepted claim or the maximum allowed length for a coherence-first rejection.
 */
export const reserveFilesystemFileCaptureCapacity = (
  state: IFilesystemRepositoryReaderState,
  frozenByteLength: bigint,
): IFilesystemRepositoryFileCaptureReservation => {
  const availableCachedByteCount = Math.max(
    0,
    state.limits.maxCachedBytes - state.cache.cachedByteCount - state.captures.reservedByteCount,
  );
  const maximumByteLength = Math.min(state.limits.maxFileBytes, availableCachedByteCount);
  const isAccepted = frozenByteLength <= BigInt(maximumByteLength);
  const byteCount = isAccepted ? Number(frozenByteLength) : 0;

  if (isAccepted) {
    state.captures.reservedByteCount += byteCount;
  }

  return {
    byteCount,
    isAccepted,
    isReleased: false,
    maximumByteLength,
  };
};

/**
 * Releases one accepted capture reservation at most once.
 * @param state The shared reservation accounting to update.
 * @param reservation The capture claim to release.
 */
export const releaseFilesystemFileCaptureCapacity = (
  state: IFilesystemRepositoryReaderState,
  reservation: IFilesystemRepositoryFileCaptureReservation,
): void => {
  if (reservation.isReleased) {
    return;
  }

  reservation.isReleased = true;

  if (reservation.isAccepted) {
    state.captures.reservedByteCount -= reservation.byteCount;
  }
};

/**
 * Converts one accepted reservation into an authoritative private cache entry.
 * @param state The shared cache and reservation accounting to update atomically.
 * @param path The frozen logical path owning the capture.
 * @param capturedBytes The complete coherence-verified file bytes.
 * @param reservation The accepted capacity claim for this capture.
 * @throws
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - RESOURCE_LIMIT_EXCEEDED: A repository reading resource limit was exceeded.
 */
export const commitReservedFilesystemFileCapture = (
  state: IFilesystemRepositoryReaderState,
  path: IRepositoryPath,
  capturedBytes: Uint8Array,
  reservation: IFilesystemRepositoryFileCaptureReservation,
): void => {
  if (!reservation.isAccepted) {
    return throwFilesystemRepositoryOperationException(
      'RESOURCE_LIMIT_EXCEEDED',
      'read-file',
      false,
      path,
    );
  }

  if (reservation.isReleased || capturedBytes.byteLength !== reservation.byteCount) {
    return throwFilesystemRepositoryOperationException(
      'INVALID_SOURCE_DATA',
      'read-file',
      false,
      path,
    );
  }

  const cachedBytes = new Uint8Array(capturedBytes);
  const nextCachedByteCount = state.cache.cachedByteCount + reservation.byteCount;

  if (
    !Number.isSafeInteger(nextCachedByteCount) ||
    nextCachedByteCount > state.limits.maxCachedBytes
  ) {
    return throwFilesystemRepositoryOperationException(
      'RESOURCE_LIMIT_EXCEEDED',
      'read-file',
      false,
      path,
    );
  }

  releaseFilesystemFileCaptureCapacity(state, reservation);
  state.cache.filesByPath.set(path, cachedBytes);
  state.cache.cachedByteCount = nextCachedByteCount;
};
