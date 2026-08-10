import type { ICoreResourceLimits } from './contracts.js';
import type { IRepositoryFormatVersion } from './format.js';

export const SUPPORTED_REPOSITORY_FORMAT_VERSIONS: readonly IRepositoryFormatVersion[] =
  Object.freeze([1]);

export const DEFAULT_CORE_RESOURCE_LIMITS: ICoreResourceLimits = Object.freeze({
  maxDiagnostics: 10_000,
  maxEntries: 100_000,
  maxFileBytes: 8_388_608,
  maxManifestBytes: 2_097_152,
  maxTotalBytesRead: 134_217_728,
});
