import {
  RepositorySourceException,
  type IRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';

import type { ICoreResourceLimits, IIndexedTextAsset } from './contracts.js';
import type { ICoreDiagnostic } from './diagnostics.js';
import { freezeRecursively } from './immutable.js';
import { calculateNormalizedTextDigest, normalizeTextDocument } from './text.js';

// internal result for one canonical text read during repository inspection
export interface IRepositoryTextResult {
  readonly valid: boolean;
  readonly asset: IIndexedTextAsset | null;
  readonly diagnostics: readonly ICoreDiagnostic[];
}

const invalidSourceData = (path: IRepositoryPath): never => {
  throw new RepositorySourceException({
    code: 'INVALID_SOURCE_DATA',
    operation: 'read-file',
    path,
    retryable: false,
  });
};

/**
 * Reads and normalizes one canonical Markdown asset through a repository reader.
 * @param repository The coherent source-neutral repository reader.
 * @param path The discovered regular-file path to read exactly once.
 * @param limits The Core limits applied to the source bytes and diagnostics.
 * @param signal Optional cancellation forwarded to the repository read.
 * @returns A deeply immutable indexed asset or its deterministic text diagnostics.
 * @throws
 * - ENTRY_NOT_FOUND: The discovered file disappeared from the reader snapshot.
 * - ENTRY_NOT_FILE: The discovered entry is no longer a regular file.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the read.
 * - INVALID_SOURCE_DATA: The repository reader returned invalid contract data.
 * - RESOURCE_LIMIT_EXCEEDED: A Core or repository resource limit was exceeded.
 * - ABORTED: Repository inspection or the repository read was aborted.
 */
export const readRepositoryTextAsset = async (
  repository: IRepositoryReader,
  path: IRepositoryPath,
  limits: ICoreResourceLimits,
  signal?: AbortSignal,
): Promise<IRepositoryTextResult> => {
  const content = await repository.readFile(path, signal === undefined ? undefined : { signal });

  if (!(content instanceof Uint8Array)) {
    return invalidSourceData(path);
  }

  const normalized = normalizeTextDocument({ content, path }, limits, 'inspect-project');

  if (!normalized.valid || normalized.text === null) {
    return freezeRecursively({
      asset: null,
      diagnostics: normalized.diagnostics,
      valid: false,
    });
  }

  const asset: IIndexedTextAsset = {
    content: normalized.text.value,
    digest: await calculateNormalizedTextDigest(normalized.text),
    path,
    scalarLength: normalized.text.scalarLength,
    utf8ByteLength: normalized.text.utf8ByteLength,
  };

  return freezeRecursively({
    asset,
    diagnostics: [],
    valid: true,
  });
};
