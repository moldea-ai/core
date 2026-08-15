import { posix } from 'node:path';
import { intersects, subset, validRange } from 'semver';

import type { IRepositoryPath, IRepositoryReader } from '@moldea.ai/repository';
import { parseRepositoryPath } from '@moldea.ai/repository';

import {
  OPENAI_SDK_PACKAGE_NAME,
  OPENAI_SDK_SUPPORTED_RANGE,
  PACKAGE_DEPENDENCY_FIELDS,
} from '../constants/index.js';
import type {
  IOpenAiPackageCompatibility,
  IOpenAiPackageDeclaration,
  IOpenAiPackageDiscoveryResult,
} from '../contracts/index.js';
import { normalizeOpenAiText } from '../text/index.js';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Creates nearest-to-root package-manifest candidates for one source path.
 * @param sourcePath The bound repository source path.
 * @returns Deterministically ordered logical package-manifest paths.
 */
export const createPackageManifestCandidatePaths = (
  sourcePath: IRepositoryPath,
): readonly IRepositoryPath[] => {
  const candidates: IRepositoryPath[] = [];
  let directory = posix.dirname(sourcePath);

  while (true) {
    candidates.push(parseRepositoryPath(posix.join(directory, 'package.json')));

    if (directory === '/') {
      break;
    }

    directory = posix.dirname(directory);
  }

  return Object.freeze(candidates);
};

const extractOpenAiDeclarations = (
  manifest: Readonly<Record<string, unknown>>,
): IOpenAiPackageDeclaration[] | null => {
  const declarations: IOpenAiPackageDeclaration[] = [];

  for (const field of PACKAGE_DEPENDENCY_FIELDS) {
    const dependencies = manifest[field];

    if (dependencies === undefined) {
      continue;
    }

    if (!isRecord(dependencies)) {
      return null;
    }

    const declaration = dependencies[OPENAI_SDK_PACKAGE_NAME];

    if (declaration === undefined) {
      continue;
    }

    if (typeof declaration !== 'string' || declaration.trim().length === 0) {
      return null;
    }

    declarations.push(
      Object.freeze({
        declaredRange: declaration,
        dependencyKind: field,
      }),
    );
  }

  return declarations;
};

const classifyDeclarations = (
  declarations: readonly IOpenAiPackageDeclaration[],
): IOpenAiPackageCompatibility => {
  const classifications = declarations.map(({ declaredRange }) => {
    const normalizedRange = validRange(declaredRange, { loose: false, includePrerelease: false });

    if (normalizedRange === null) {
      return 'ambiguous' as const;
    }

    if (
      subset(normalizedRange, OPENAI_SDK_SUPPORTED_RANGE, {
        loose: false,
        includePrerelease: false,
      })
    ) {
      return 'supported' as const;
    }

    if (
      !intersects(normalizedRange, OPENAI_SDK_SUPPORTED_RANGE, {
        loose: false,
        includePrerelease: false,
      })
    ) {
      return 'unsupported' as const;
    }

    return 'ambiguous' as const;
  });

  if (classifications.every((classification) => classification === 'supported')) {
    return 'supported';
  }

  if (classifications.every((classification) => classification === 'unsupported')) {
    return 'unsupported';
  }

  return 'ambiguous';
};

/**
 * Discovers the nearest relevant OpenAI package declaration without repository enumeration.
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
export const discoverOpenAiPackage = async (
  repository: IRepositoryReader,
  sourcePath: IRepositoryPath,
  signal?: AbortSignal,
): Promise<IOpenAiPackageDiscoveryResult> => {
  const options = signal === undefined ? undefined : { signal };

  for (const manifestPath of createPackageManifestCandidatePaths(sourcePath)) {
    signal?.throwIfAborted();
    const entry = await repository.getEntry(manifestPath, options);
    signal?.throwIfAborted();

    if (entry === null) {
      continue;
    }

    if (entry.type !== 'file') {
      return Object.freeze({ kind: 'invalid', path: manifestPath });
    }

    const bytes = await repository.readFile(manifestPath, options);
    signal?.throwIfAborted();
    const text = normalizeOpenAiText(bytes);
    signal?.throwIfAborted();

    if (!text.valid) {
      return Object.freeze({ kind: 'invalid', path: manifestPath });
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(text.value);
    } catch {
      return Object.freeze({ kind: 'invalid', path: manifestPath });
    }

    signal?.throwIfAborted();

    if (!isRecord(parsed)) {
      return Object.freeze({ kind: 'invalid', path: manifestPath });
    }

    const declarations = extractOpenAiDeclarations(parsed);

    if (declarations === null) {
      return Object.freeze({ kind: 'invalid', path: manifestPath });
    }

    if (declarations.length === 0) {
      return Object.freeze({ kind: 'absent' });
    }

    const compatibility = classifyDeclarations(declarations);

    return Object.freeze({
      kind: 'observed',
      observation: Object.freeze({
        compatibility,
        declarations: Object.freeze(declarations),
        path: manifestPath,
      }),
    });
  }

  return Object.freeze({ kind: 'absent' });
};
