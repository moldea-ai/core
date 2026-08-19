import { posix } from 'node:path';

import {
  createPackageManifestCandidatePaths,
  normalizeText,
} from '@moldea.ai/adapter-static-analysis';
import type { IRepositoryPath, IRepositoryReader } from '@moldea.ai/repository';
import { parseRepositoryPath } from '@moldea.ai/repository';

import {
  AI_SDK_PACKAGE_NAME,
  CLOUDFLARE_AGENTS_PACKAGE_NAME,
  CLOUDFLARE_AI_CHAT_PACKAGE_NAME,
  CLOUDFLARE_THINK_PACKAGE_NAME,
} from '../constants/index.js';
import type {
  ICloudflareAgentsPackageDeclaration,
  ICloudflareAgentsPackageDependencyKind,
  ICloudflareAgentsPackageDiscoveryResult,
} from '../contracts/index.js';

const PACKAGE_NAMES = Object.freeze([
  CLOUDFLARE_THINK_PACKAGE_NAME,
  CLOUDFLARE_AI_CHAT_PACKAGE_NAME,
  CLOUDFLARE_AGENTS_PACKAGE_NAME,
  AI_SDK_PACKAGE_NAME,
]);
const DEPENDENCY_FIELDS = Object.freeze([
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'devDependencies',
] as const satisfies readonly ICloudflareAgentsPackageDependencyKind[]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Creates nearest-to-root package-manifest candidates for one source path. */
export const createCloudflareAgentsPackageManifestCandidatePaths = (
  sourcePath: IRepositoryPath,
): readonly IRepositoryPath[] =>
  createPackageManifestCandidatePaths(sourcePath).map((path) => parseRepositoryPath(path));

const extractDeclarations = (
  manifest: Readonly<Record<string, unknown>>,
): ReadonlyMap<string, readonly ICloudflareAgentsPackageDeclaration[]> | null => {
  const declarations = new Map<string, ICloudflareAgentsPackageDeclaration[]>();

  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = manifest[field];

    if (dependencies === undefined) {
      continue;
    }

    if (!isRecord(dependencies)) {
      return null;
    }

    for (const packageName of PACKAGE_NAMES) {
      const declaredRange = dependencies[packageName];

      if (declaredRange === undefined) {
        continue;
      }

      if (typeof declaredRange !== 'string' || declaredRange.trim().length === 0) {
        return null;
      }

      const entries = declarations.get(packageName) ?? [];
      entries.push(Object.freeze({ declaredRange, dependencyKind: field }));
      declarations.set(packageName, entries);
    }
  }

  return new Map(
    [...declarations].map(([packageName, entries]) => [packageName, Object.freeze(entries)]),
  );
};

/** Discovers the nearest manifest containing a Cloudflare Agents target dependency. */
export const discoverCloudflareAgentsPackage = async (
  repository: IRepositoryReader,
  sourcePath: IRepositoryPath,
  signal?: AbortSignal,
): Promise<ICloudflareAgentsPackageDiscoveryResult> => {
  const options = signal === undefined ? undefined : { signal };

  for (const candidatePath of createCloudflareAgentsPackageManifestCandidatePaths(sourcePath)) {
    signal?.throwIfAborted();
    const entry = await repository.getEntry(candidatePath, options);

    if (entry === null) {
      continue;
    }

    if (entry.type !== 'file') {
      return Object.freeze({ kind: 'invalid', path: candidatePath });
    }

    const bytes = await repository.readFile(candidatePath, options);
    const text = normalizeText(bytes);

    if (!text.valid) {
      return Object.freeze({ kind: 'invalid', path: candidatePath });
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(text.value);
    } catch {
      return Object.freeze({ kind: 'invalid', path: candidatePath });
    }

    if (!isRecord(parsed)) {
      return Object.freeze({ kind: 'invalid', path: candidatePath });
    }

    const declarations = extractDeclarations(parsed);

    if (declarations === null) {
      return Object.freeze({ kind: 'invalid', path: candidatePath });
    }

    if (
      !declarations.has(CLOUDFLARE_THINK_PACKAGE_NAME) &&
      !declarations.has(CLOUDFLARE_AI_CHAT_PACKAGE_NAME)
    ) {
      return Object.freeze({ kind: 'absent' });
    }

    return Object.freeze({
      kind: 'observed',
      observation: Object.freeze({
        declarations,
        path: parseRepositoryPath(posix.normalize(candidatePath)),
      }),
    });
  }

  return Object.freeze({ kind: 'absent' });
};
