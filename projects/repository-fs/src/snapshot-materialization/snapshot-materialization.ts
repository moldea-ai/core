import { RepositorySourceException, type IRepositoryPath } from '@moldea.ai/repository';

import { readFilesystemRepositoryFile } from '../file-operations/index.js';
import type { IFilesystemRepositoryReaderState } from '../reader-state/index.js';
import {
  throwFilesystemRepositoryCreationException,
  throwIfFilesystemRepositoryCreationAborted,
} from '../source-exception/index.js';

/** Translates an eager file-capture failure back to the reader-creation boundary. */
const throwFilesystemSnapshotMaterializationFailure = (
  cause: unknown,
  path: IRepositoryPath,
): never => {
  if (cause instanceof RepositorySourceException) {
    return throwFilesystemRepositoryCreationException(
      cause.code,
      cause.code === 'ABORTED' ? true : cause.retryable,
      cause.path ?? path,
      cause,
    );
  }

  return throwFilesystemRepositoryCreationException('SOURCE_UNAVAILABLE', true, path, cause);
};

/**
 * Eagerly captures every selected file when platform metadata cannot prove lazy coherence.
 * @param state The verified inventory and private cache being prepared for publication.
 * @param signal The live reader-creation cancellation signal.
 * @param platform The runtime platform whose fingerprint guarantees select the strategy.
 * @returns A promise resolving after every required file is privately cached.
 * @throws
 * - ABORTED: The repository operation was aborted.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - RESOURCE_LIMIT_EXCEEDED: A repository reading resource limit was exceeded.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 */
export const materializeFilesystemRepositorySnapshotWhenRequired = async (
  state: IFilesystemRepositoryReaderState,
  signal: AbortSignal | undefined,
  platform: NodeJS.Platform = process.platform,
): Promise<void> => {
  if (platform !== 'win32') {
    return;
  }

  throwIfFilesystemRepositoryCreationAborted(signal);

  for (const entry of state.inventory.entries) {
    if (entry.type !== 'file') {
      continue;
    }

    throwIfFilesystemRepositoryCreationAborted(signal, entry.path);

    try {
      await readFilesystemRepositoryFile(
        state,
        entry.path,
        signal === undefined ? undefined : { signal },
      );
    } catch (cause) {
      throwFilesystemSnapshotMaterializationFailure(cause, entry.path);
    }
  }

  throwIfFilesystemRepositoryCreationAborted(signal);
};
