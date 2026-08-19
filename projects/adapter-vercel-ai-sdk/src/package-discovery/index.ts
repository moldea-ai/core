import {
  createPackageManifestCandidatePaths as createCandidatePaths,
  discoverPackage,
} from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryPath, IRepositoryReader } from '@moldea.ai/repository';
import { parseRepositoryPath } from '@moldea.ai/repository';

import { VERCEL_AI_SDK_PACKAGE_NAME, VERCEL_AI_SDK_SUPPORTED_RANGE } from '../constants/index.js';
import type { IVercelAiSdkPackageDiscoveryResult } from '../contracts/index.js';

/**
 * Creates nearest-to-root package-manifest candidates for one source path.
 * @param sourcePath The bound repository source path.
 * @returns Deterministically ordered logical package-manifest paths.
 */
export const createPackageManifestCandidatePaths = (
  sourcePath: IRepositoryPath,
): readonly IRepositoryPath[] =>
  createCandidatePaths(sourcePath).map((path) => parseRepositoryPath(path));

/**
 * Discovers the nearest relevant Vercel AI SDK package declaration.
 * @param repository The Core-owned budget-aware repository reader.
 * @param sourcePath The bound source whose package scope is inspected.
 * @param signal The active inspection signal.
 * @returns The first observed declaration, invalid manifest, or absence result.
 * @throws
 * - INVALID_REPOSITORY_PATH: The repository path is invalid.
 * - ENTRY_NOT_FOUND: The requested repository entry was not found.
 * - ENTRY_NOT_FILE: The requested repository entry is not a file.
 * - ACCESS_DENIED: Access to the repository source was denied.
 * - SOURCE_UNAVAILABLE: The repository source is unavailable.
 * - SNAPSHOT_CHANGED: The repository snapshot changed during the operation.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 * - RESOURCE_LIMIT_EXCEEDED: A repository reading resource limit was exceeded.
 * - ABORTED: The repository operation was aborted.
 */
export const discoverVercelAiSdkPackage = async (
  repository: IRepositoryReader,
  sourcePath: IRepositoryPath,
  signal?: AbortSignal,
): Promise<IVercelAiSdkPackageDiscoveryResult> => {
  const repositoryOptions = signal === undefined ? undefined : { signal };
  const result = await discoverPackage({
    packageName: VERCEL_AI_SDK_PACKAGE_NAME,
    reader: {
      getEntry: (path) => repository.getEntry(parseRepositoryPath(path), repositoryOptions),
      readFile: (path) => repository.readFile(parseRepositoryPath(path), repositoryOptions),
    },
    ...(signal === undefined ? {} : { signal }),
    sourcePath,
    supportedRange: VERCEL_AI_SDK_SUPPORTED_RANGE,
  });

  if (result.kind === 'invalid') {
    return Object.freeze({ kind: 'invalid', path: parseRepositoryPath(result.path) });
  }

  if (result.kind === 'observed') {
    return Object.freeze({
      kind: 'observed',
      observation: Object.freeze({
        ...result.observation,
        path: parseRepositoryPath(result.observation.path),
      }),
    });
  }

  return result;
};
