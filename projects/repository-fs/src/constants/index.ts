import type { IFilesystemRepositoryResourceLimits } from '../contracts/index.js';

// default filesystem-reader limits for version 1 snapshots
export const DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS: IFilesystemRepositoryResourceLimits =
  Object.freeze({
    maxEntries: 100_000,
    maxFileBytes: 8_388_608,
    maxCachedBytes: 134_217_728,
  });
