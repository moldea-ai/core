import { discoverPackages } from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryPath, IRepositoryReader } from '@moldea.ai/repository';

import {
  LANGCHAIN_CORE_PACKAGE_NAME,
  LANGCHAIN_CORE_SUPPORTED_PACKAGE_RANGE,
  LANGCHAIN_PACKAGE_NAME,
  LANGCHAIN_SUPPORTED_PACKAGE_RANGE,
} from '../constants/index.js';
import type {
  ILangChainPackageDiscoveryResult,
  ILangChainTargetPackageClassification,
} from '../contracts/index.js';

const classifyTarget = (
  primary: 'absent' | 'ambiguous' | 'supported' | 'unsupported',
  companion: 'absent' | 'ambiguous' | 'supported' | 'unsupported',
): ILangChainTargetPackageClassification => {
  if (primary === 'absent') {
    return 'absent';
  }

  if (
    primary === 'unsupported' ||
    ((primary === 'supported' || primary === 'ambiguous') && companion === 'unsupported')
  ) {
    return 'unsupported';
  }

  if (primary === 'supported' && companion === 'supported') {
    return 'supported';
  }

  if (primary === 'supported' && companion === 'absent') {
    return 'incomplete';
  }

  return 'ambiguous';
};

/** Discovers the exact primary and companion declarations in one owning manifest read. */
export const discoverLangChainPackages = async (
  reader: IRepositoryReader,
  sourcePath: IRepositoryPath,
  signal?: AbortSignal,
): Promise<ILangChainPackageDiscoveryResult> => {
  const result = await discoverPackages({
    packages: [
      { packageName: LANGCHAIN_PACKAGE_NAME, supportedRange: LANGCHAIN_SUPPORTED_PACKAGE_RANGE },
      {
        packageName: LANGCHAIN_CORE_PACKAGE_NAME,
        supportedRange: LANGCHAIN_CORE_SUPPORTED_PACKAGE_RANGE,
      },
    ],
    reader: {
      getEntry: (path) =>
        reader.getEntry(path as IRepositoryPath, signal === undefined ? undefined : { signal }),
      readFile: (path) =>
        reader.readFile(path as IRepositoryPath, signal === undefined ? undefined : { signal }),
    },
    ...(signal === undefined ? {} : { signal }),
    sourcePath,
  });

  if (result.kind !== 'observed') {
    return result.kind === 'invalid'
      ? Object.freeze({ kind: 'invalid', path: result.path as IRepositoryPath })
      : result;
  }

  const [primary, companion] = result.observation.packages;

  if (primary === undefined || companion === undefined) {
    return Object.freeze({ kind: 'invalid', path: result.observation.path as IRepositoryPath });
  }

  return Object.freeze({
    kind: 'observed',
    observation: Object.freeze({
      packages: result.observation.packages,
      path: result.observation.path as IRepositoryPath,
      targetClassification: classifyTarget(primary.compatibility, companion.compatibility),
    }),
  });
};
