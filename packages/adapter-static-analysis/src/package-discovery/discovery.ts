import { posix } from 'node:path';
import { intersects, subset, validRange } from 'semver';

import type {
  IStaticAnalysisPackageCompatibility,
  IStaticAnalysisPackageDeclaration,
  IStaticAnalysisPackageDependencyKind,
  IStaticAnalysisPackageDiscoveryOptions,
  IStaticAnalysisPackageDiscoveryResult,
} from '../types.js';
import { normalizeText } from '../text/index.js';

const PACKAGE_DEPENDENCY_FIELDS = Object.freeze([
  'dependencies',
  'optionalDependencies',
  'peerDependencies',
  'devDependencies',
] as const satisfies readonly IStaticAnalysisPackageDependencyKind[]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Creates nearest-to-root package-manifest candidates for one source path.
 * @param sourcePath The normalized source path.
 * @returns Deterministically ordered manifest paths.
 */
export const createPackageManifestCandidatePaths = (sourcePath: string): readonly string[] => {
  const candidates: string[] = [];
  let directory = posix.dirname(sourcePath);

  while (true) {
    candidates.push(posix.join(directory, 'package.json'));

    if (directory === '/') {
      break;
    }

    directory = posix.dirname(directory);
  }

  return Object.freeze(candidates);
};

const extractPackageDeclarations = (
  manifest: Readonly<Record<string, unknown>>,
  packageName: string,
): IStaticAnalysisPackageDeclaration[] | null => {
  const declarations: IStaticAnalysisPackageDeclaration[] = [];

  for (const field of PACKAGE_DEPENDENCY_FIELDS) {
    const dependencies = manifest[field];

    if (dependencies === undefined) {
      continue;
    }

    if (!isRecord(dependencies)) {
      return null;
    }

    const declaration = dependencies[packageName];

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

const classifyPackageDeclarations = (
  declarations: readonly IStaticAnalysisPackageDeclaration[],
  supportedRange: string,
): IStaticAnalysisPackageCompatibility => {
  const classifications = declarations.map(({ declaredRange }) => {
    const normalizedRange = validRange(declaredRange, { loose: false, includePrerelease: false });

    if (normalizedRange === null) {
      return 'ambiguous' as const;
    }

    if (
      subset(normalizedRange, supportedRange, {
        loose: false,
        includePrerelease: false,
      })
    ) {
      return 'supported' as const;
    }

    if (
      !intersects(normalizedRange, supportedRange, {
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
 * Discovers the nearest package declaration without repository enumeration.
 * @param options The package target, repository callbacks, path, range, and signal.
 * @returns The first observed declaration, invalid manifest, or absence result.
 * @throws If repository reading or the active inspection is aborted.
 */
export const discoverPackage = async (
  options: IStaticAnalysisPackageDiscoveryOptions,
): Promise<IStaticAnalysisPackageDiscoveryResult> => {
  const { includeManifestPackageName, packageName, reader, signal, sourcePath, supportedRange } =
    options;

  for (const manifestPath of createPackageManifestCandidatePaths(sourcePath)) {
    signal?.throwIfAborted();
    const entry = await reader.getEntry(manifestPath);
    signal?.throwIfAborted();

    if (entry === null) {
      continue;
    }

    if (entry.type !== 'file') {
      return Object.freeze({ kind: 'invalid', path: manifestPath });
    }

    const bytes = await reader.readFile(manifestPath);
    signal?.throwIfAborted();
    const text = normalizeText(bytes);
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

    const declarations = extractPackageDeclarations(parsed, packageName);

    if (declarations === null) {
      return Object.freeze({ kind: 'invalid', path: manifestPath });
    }

    if (declarations.length === 0) {
      return Object.freeze({ kind: 'absent' });
    }

    return Object.freeze({
      kind: 'observed',
      observation: Object.freeze({
        compatibility: classifyPackageDeclarations(declarations, supportedRange),
        declarations: Object.freeze(declarations),
        ...(includeManifestPackageName === true
          ? { manifestPackageName: typeof parsed['name'] === 'string' ? parsed['name'] : null }
          : {}),
        path: manifestPath,
      }),
    });
  }

  return Object.freeze({ kind: 'absent' });
};
