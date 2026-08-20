import { discoverPackage } from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryPath, IRepositoryReader } from '@moldea.ai/repository';

import { EVE_PACKAGE_NAME, EVE_SUPPORTED_PACKAGE_RANGE } from '../constants/index.js';
import type { IEvePackageDiscoveryResult } from '../contracts/index.js';

/** Discovers the nearest owning Eve package and its safe root identity. */
export const discoverEvePackage = async (
  reader: IRepositoryReader,
  sourcePath: IRepositoryPath,
  signal?: AbortSignal,
): Promise<IEvePackageDiscoveryResult> => {
  const result = await discoverPackage({
    includeManifestPackageName: true,
    packageName: EVE_PACKAGE_NAME,
    reader: {
      getEntry: (path) =>
        reader.getEntry(path as IRepositoryPath, signal === undefined ? undefined : { signal }),
      readFile: (path) =>
        reader.readFile(path as IRepositoryPath, signal === undefined ? undefined : { signal }),
    },
    ...(signal === undefined ? {} : { signal }),
    sourcePath,
    supportedRange: EVE_SUPPORTED_PACKAGE_RANGE,
  });

  if (result.kind !== 'observed') {
    return result as IEvePackageDiscoveryResult;
  }

  return Object.freeze({
    kind: 'observed',
    observation: Object.freeze({
      ...result.observation,
      manifestPackageName: result.observation.manifestPackageName ?? null,
      path: result.observation.path as IRepositoryPath,
    }),
  });
};
