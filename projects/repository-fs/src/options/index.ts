import {
  REPOSITORY_ROOT,
  RepositoryPathException,
  RepositorySourceException,
  parseRepositoryPath,
  type IRepositoryPath,
} from '@moldea.ai/repository';

import { DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS } from '../constants/index.js';
import type {
  IFilesystemRepositoryDirectorySelection,
  IFilesystemRepositoryPathSelection,
  IFilesystemRepositoryResourceLimits,
  IFilesystemRepositorySelection,
} from '../contracts/index.js';
import { isAbsoluteHostRootDirectory } from '../host-path/index.js';

// detached immutable configuration used while creating one reader
export interface INormalizedFilesystemRepositoryReaderOptions {
  readonly rootDirectory: string;
  readonly selection: IFilesystemRepositorySelection;
  readonly limits: IFilesystemRepositoryResourceLimits;
  readonly signal: AbortSignal | undefined;
}

const OPTION_PROPERTY_NAMES = new Set(['limits', 'rootDirectory', 'selection', 'signal']);
const DIRECTORY_SELECTION_PROPERTY_NAMES = new Set(['kind']);
const PATH_SELECTION_PROPERTY_NAMES = new Set(['kind', 'paths']);
const LIMIT_PROPERTY_NAMES = ['maxCachedBytes', 'maxEntries', 'maxFileBytes'] as const;
const LIMIT_PROPERTY_NAME_SET = new Set<string>(LIMIT_PROPERTY_NAMES);

const throwInvalidSourceData = (path: IRepositoryPath | null = null): never => {
  throw new RepositorySourceException({
    code: 'INVALID_SOURCE_DATA',
    operation: 'create-reader',
    path,
    retryable: false,
  });
};

const isArray = (candidate: unknown): candidate is unknown[] => {
  try {
    return Array.isArray(candidate);
  } catch {
    return throwInvalidSourceData();
  }
};

const isUnknownRecord = (candidate: unknown): candidate is Record<PropertyKey, unknown> => {
  return typeof candidate === 'object' && candidate !== null && !isArray(candidate);
};

const hasExactOwnProperties = (
  candidate: Record<PropertyKey, unknown>,
  allowedPropertyNames: ReadonlySet<string>,
): boolean => {
  try {
    return Reflect.ownKeys(candidate).every(
      (propertyName) => typeof propertyName === 'string' && allowedPropertyNames.has(propertyName),
    );
  } catch {
    return throwInvalidSourceData();
  }
};

const hasOwnProperty = (
  candidate: Record<PropertyKey, unknown> | unknown[],
  propertyName: string,
): boolean => {
  try {
    return Object.hasOwn(candidate, propertyName);
  } catch {
    return throwInvalidSourceData();
  }
};

const readOwnProperty = (
  candidate: Record<PropertyKey, unknown> | unknown[],
  propertyName: string,
): unknown => {
  try {
    return Reflect.get(candidate, propertyName);
  } catch {
    return throwInvalidSourceData();
  }
};

const parseSelectedPath = (candidate: unknown): IRepositoryPath => {
  if (typeof candidate !== 'string') {
    throw new RepositoryPathException();
  }

  return parseRepositoryPath(candidate);
};

/**
 * Copies one exact-path selection into canonical deterministic order.
 * @param selection The closed path-selection object to validate.
 * @returns A frozen path selection detached from the caller's array.
 * @throws
 * - INVALID_REPOSITORY_PATH: The repository path is invalid.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 */
const normalizePathSelection = (
  selection: Record<PropertyKey, unknown>,
): IFilesystemRepositoryPathSelection => {
  if (
    !hasExactOwnProperties(selection, PATH_SELECTION_PROPERTY_NAMES) ||
    !hasOwnProperty(selection, 'paths')
  ) {
    return throwInvalidSourceData();
  }

  const pathCandidates = readOwnProperty(selection, 'paths');

  if (!isArray(pathCandidates)) {
    return throwInvalidSourceData();
  }

  const pathCount = readOwnProperty(pathCandidates, 'length');

  if (typeof pathCount !== 'number' || !Number.isSafeInteger(pathCount) || pathCount < 0) {
    return throwInvalidSourceData();
  }

  const paths: IRepositoryPath[] = [];

  for (let index = 0; index < pathCount; index += 1) {
    const propertyName = String(index);

    if (!hasOwnProperty(pathCandidates, propertyName)) {
      return throwInvalidSourceData();
    }

    paths.push(parseSelectedPath(readOwnProperty(pathCandidates, propertyName)));
  }

  const uniquePaths = new Set<IRepositoryPath>();

  for (const selectedPath of paths) {
    if (selectedPath === REPOSITORY_ROOT || uniquePaths.has(selectedPath)) {
      return throwInvalidSourceData();
    }

    uniquePaths.add(selectedPath);
  }

  paths.sort();

  return Object.freeze({
    kind: 'paths',
    paths: Object.freeze(paths),
  });
};

/**
 * Validates and snapshots one supported version 1 selection strategy.
 * @param candidate The untrusted selection value.
 * @returns A frozen directory or exact-path selection.
 * @throws
 * - INVALID_REPOSITORY_PATH: The repository path is invalid.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 */
const normalizeSelection = (candidate: unknown): IFilesystemRepositorySelection => {
  if (!isUnknownRecord(candidate) || !hasOwnProperty(candidate, 'kind')) {
    return throwInvalidSourceData();
  }

  const kind = readOwnProperty(candidate, 'kind');

  if (kind === 'directory') {
    if (!hasExactOwnProperties(candidate, DIRECTORY_SELECTION_PROPERTY_NAMES)) {
      return throwInvalidSourceData();
    }

    return Object.freeze({ kind: 'directory' }) satisfies IFilesystemRepositoryDirectorySelection;
  }

  if (kind === 'paths') {
    return normalizePathSelection(candidate);
  }

  return throwInvalidSourceData();
};

const isPositiveSafeInteger = (candidate: unknown): candidate is number => {
  return typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate > 0;
};

/**
 * Fills and freezes the independent filesystem resource limits.
 * @param candidate The optional partial limit object.
 * @returns A complete immutable limit snapshot.
 * @throws
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 */
const normalizeLimits = (candidate: unknown): IFilesystemRepositoryResourceLimits => {
  if (candidate === undefined) {
    return DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS;
  }

  if (!isUnknownRecord(candidate) || !hasExactOwnProperties(candidate, LIMIT_PROPERTY_NAME_SET)) {
    return throwInvalidSourceData();
  }

  const limits = {
    maxCachedBytes: DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS.maxCachedBytes,
    maxEntries: DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS.maxEntries,
    maxFileBytes: DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS.maxFileBytes,
  };

  for (const propertyName of LIMIT_PROPERTY_NAMES) {
    if (!hasOwnProperty(candidate, propertyName)) {
      continue;
    }

    const configuredLimit = readOwnProperty(candidate, propertyName);

    if (!isPositiveSafeInteger(configuredLimit)) {
      return throwInvalidSourceData();
    }

    limits[propertyName] = configuredLimit;
  }

  return Object.freeze(limits);
};

const normalizeSignal = (candidate: unknown): AbortSignal | undefined => {
  try {
    if (candidate === undefined || candidate instanceof AbortSignal) {
      return candidate;
    }
  } catch {
    return throwInvalidSourceData();
  }

  return throwInvalidSourceData();
};

/**
 * Validates, detaches, sorts, and freezes caller-owned reader configuration.
 * @param candidate The untrusted factory options supplied by a caller.
 * @returns An immutable configuration snapshot with a live signal reference.
 * @throws
 * - INVALID_REPOSITORY_PATH: The repository path is invalid.
 * - INVALID_SOURCE_DATA: The repository source returned invalid data.
 */
export const normalizeFilesystemRepositoryOptions = (
  candidate: unknown,
): INormalizedFilesystemRepositoryReaderOptions => {
  let normalizedOptions: INormalizedFilesystemRepositoryReaderOptions;

  try {
    if (
      !isUnknownRecord(candidate) ||
      !hasExactOwnProperties(candidate, OPTION_PROPERTY_NAMES) ||
      !hasOwnProperty(candidate, 'rootDirectory') ||
      !hasOwnProperty(candidate, 'selection')
    ) {
      return throwInvalidSourceData();
    }

    const rootDirectory = readOwnProperty(candidate, 'rootDirectory');
    const selection = readOwnProperty(candidate, 'selection');
    const limits = hasOwnProperty(candidate, 'limits')
      ? readOwnProperty(candidate, 'limits')
      : undefined;
    const signal = hasOwnProperty(candidate, 'signal')
      ? readOwnProperty(candidate, 'signal')
      : undefined;

    if (!isAbsoluteHostRootDirectory(rootDirectory)) {
      return throwInvalidSourceData();
    }

    normalizedOptions = {
      limits: normalizeLimits(limits),
      rootDirectory,
      selection: normalizeSelection(selection),
      signal: normalizeSignal(signal),
    };
  } catch (cause) {
    if (cause instanceof RepositoryPathException) {
      throw cause;
    }

    return throwInvalidSourceData();
  }

  if (normalizedOptions.selection.kind === 'paths') {
    for (const selectedPath of normalizedOptions.selection.paths) {
      if (selectedPath.slice(1).split('/').includes('.git')) {
        return throwInvalidSourceData(selectedPath);
      }
    }
  }

  return Object.freeze(normalizedOptions);
};
