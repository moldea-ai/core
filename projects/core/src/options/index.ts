import type {
  IFrameworkAdapter,
  IFrameworkAdapterContext,
  IFrameworkAdapterResult,
} from '../adapter/index.js';
import {
  DEFAULT_CORE_RESOURCE_LIMITS,
  SUPPORTED_REPOSITORY_FORMAT_VERSIONS,
} from '../constants/index.js';
import type { ICoreOptions, ICoreResourceLimits } from '../contracts/index.js';
import { CoreConfigurationException } from '../exceptions/index.js';
import type { IRepositoryFormatVersion } from '../format/index.js';
import { freezeRecursively } from '../immutable/index.js';

// detached adapter and complete Core configuration snapshots
export interface IFrameworkAdapterSnapshot {
  readonly id: string;
  readonly supportedRepositoryFormatVersions: readonly IRepositoryFormatVersion[];
  readonly inspect: (context: IFrameworkAdapterContext) => Promise<IFrameworkAdapterResult>;
}

export interface ICoreOptionsSnapshot {
  readonly adapters: readonly IFrameworkAdapterSnapshot[];
  readonly limits: ICoreResourceLimits;
}

const RESOURCE_LIMIT_KEYS = [
  'maxEntries',
  'maxTotalBytesRead',
  'maxFileBytes',
  'maxManifestBytes',
  'maxDiagnostics',
] as const satisfies readonly (keyof ICoreResourceLimits)[];

const STABLE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const WINDOWS_RESERVED_ID_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u;

const compareStrings = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }

  if (left > right) {
    return 1;
  }

  return 0;
};

const invalidAdapter = (adapterId?: string): never => {
  throw new CoreConfigurationException({
    ...(adapterId === undefined ? {} : { adapterId }),
    code: 'INVALID_ADAPTER_DEFINITION',
    operation: 'create-core',
  });
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isStableId = (value: string): boolean => {
  return value.length >= 1 && value.length <= 64 && STABLE_ID_PATTERN.test(value);
};

/**
 * Validates, copies, fills, and freezes all configured resource limits.
 * @param candidate The untrusted optional limit overrides.
 * @returns The complete frozen resource limits.
 * @throws
 * - INVALID_RESOURCE_LIMIT: A Core resource limit is invalid.
 */
const normalizeLimits = (candidate: unknown): ICoreResourceLimits => {
  if (candidate === undefined) {
    return DEFAULT_CORE_RESOURCE_LIMITS;
  }

  if (!isRecord(candidate)) {
    throw new CoreConfigurationException({
      code: 'INVALID_RESOURCE_LIMIT',
      operation: 'create-core',
    });
  }

  const knownKeys = new Set<string>(RESOURCE_LIMIT_KEYS);

  if (Object.keys(candidate).some((key) => !knownKeys.has(key))) {
    throw new CoreConfigurationException({
      code: 'INVALID_RESOURCE_LIMIT',
      operation: 'create-core',
    });
  }

  const normalized: ICoreResourceLimits = {
    ...DEFAULT_CORE_RESOURCE_LIMITS,
  };

  for (const key of RESOURCE_LIMIT_KEYS) {
    const value = candidate[key];

    if (value === undefined) {
      continue;
    }

    if (!Number.isSafeInteger(value) || (value as number) <= 0) {
      throw new CoreConfigurationException({
        code: 'INVALID_RESOURCE_LIMIT',
        operation: 'create-core',
      });
    }

    (normalized as Record<keyof ICoreResourceLimits, number>)[key] = value as number;
  }

  return freezeRecursively(normalized);
};

/**
 * Snapshots one adapter definition without freezing caller-owned state.
 * @param candidate The untrusted adapter definition.
 * @returns A frozen detached adapter snapshot.
 * @throws
 * - RESERVED_ADAPTER_ID: A reserved framework adapter ID was supplied.
 * - INVALID_ADAPTER_DEFINITION: A framework adapter definition is invalid.
 */
const normalizeAdapter = (candidate: unknown): IFrameworkAdapterSnapshot => {
  if (!isRecord(candidate)) {
    return invalidAdapter();
  }

  const id = candidate['id'];

  if (typeof id !== 'string' || !isStableId(id) || WINDOWS_RESERVED_ID_PATTERN.test(id)) {
    return invalidAdapter();
  }

  if (id === 'custom') {
    throw new CoreConfigurationException({
      adapterId: id,
      code: 'RESERVED_ADAPTER_ID',
      operation: 'create-core',
    });
  }

  const versions = candidate['supportedRepositoryFormatVersions'];
  const inspect = candidate['inspect'];

  if (!Array.isArray(versions) || versions.length === 0 || typeof inspect !== 'function') {
    return invalidAdapter(id);
  }

  const supportedVersions = new Set<IRepositoryFormatVersion>();

  for (const version of versions as readonly unknown[]) {
    if (
      !SUPPORTED_REPOSITORY_FORMAT_VERSIONS.includes(version as IRepositoryFormatVersion) ||
      supportedVersions.has(version as IRepositoryFormatVersion)
    ) {
      return invalidAdapter(id);
    }

    supportedVersions.add(version as IRepositoryFormatVersion);
  }

  const inspectReference = inspect as IFrameworkAdapter['inspect'];

  return freezeRecursively({
    id,
    inspect: async (context: IFrameworkAdapterContext): Promise<IFrameworkAdapterResult> =>
      inspectReference(context),
    supportedRepositoryFormatVersions: [...supportedVersions].sort((left, right) => left - right),
  });
};

/**
 * Validates, snapshots, and deterministically sorts the configured adapter registry.
 * @param candidate The untrusted optional adapter definitions.
 * @returns The frozen adapter snapshots in canonical ID order.
 * @throws
 * - DUPLICATE_ADAPTER_ID: A framework adapter ID is registered more than once.
 * - RESERVED_ADAPTER_ID: A reserved framework adapter ID was supplied.
 * - INVALID_ADAPTER_DEFINITION: A framework adapter definition is invalid.
 */
const normalizeAdapters = (candidate: unknown): readonly IFrameworkAdapterSnapshot[] => {
  if (candidate === undefined) {
    return Object.freeze([]);
  }

  if (!Array.isArray(candidate)) {
    return invalidAdapter();
  }

  const adapters = Array.from(candidate as readonly unknown[], (adapter) =>
    normalizeAdapter(adapter),
  );
  const ids = new Set<string>();

  for (const adapter of adapters) {
    if (ids.has(adapter.id)) {
      throw new CoreConfigurationException({
        adapterId: adapter.id,
        code: 'DUPLICATE_ADAPTER_ID',
        operation: 'create-core',
      });
    }

    ids.add(adapter.id);
  }

  return freezeRecursively(adapters.sort((left, right) => compareStrings(left.id, right.id)));
};

/**
 * Validates and snapshots caller-owned Core construction options.
 * @param options The optional adapters and resource-limit overrides.
 * @returns A deeply frozen, deterministically ordered configuration snapshot.
 * @throws
 * - DUPLICATE_ADAPTER_ID: A framework adapter ID is registered more than once.
 * - RESERVED_ADAPTER_ID: A reserved framework adapter ID was supplied.
 * - INVALID_ADAPTER_DEFINITION: A framework adapter definition is invalid.
 * - INVALID_RESOURCE_LIMIT: A Core resource limit is invalid.
 */
export const normalizeCoreOptions = (options: ICoreOptions | undefined): ICoreOptionsSnapshot => {
  if (options !== undefined && !isRecord(options)) {
    return invalidAdapter();
  }

  return freezeRecursively({
    adapters: normalizeAdapters(options?.['adapters']),
    limits: normalizeLimits(options?.['limits']),
  });
};
