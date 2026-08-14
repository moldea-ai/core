import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { valid as isValidVersion } from 'semver';

import type { IMoldeaCliPackageEntryResolver, IMoldeaCliPackageMetadata } from './types.js';

const MOLDEA_CLI_PACKAGE_NAME = '@moldea.ai/cli';

/** Checks exact SemVer syntax without accepting normalized prefixes or surrounding whitespace. */
const isExactSemanticVersion = (version: string): boolean =>
  version === version.trim() && /^[0-9]/u.test(version) && isValidVersion(version) !== null;

const isPlainRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;

  return prototype === Object.prototype || prototype === null;
};

/** Returns a frozen string record, or null when a package composition field is malformed. */
const readStringRecord = (value: unknown): Readonly<Record<string, string>> | null => {
  if (!isPlainRecord(value)) {
    return null;
  }

  const entries = Object.entries(value);

  if (entries.some(([, entryValue]) => typeof entryValue !== 'string')) {
    return null;
  }

  return Object.freeze(Object.fromEntries(entries) as Record<string, string>);
};

/** Resolves one package entry through the executable's own module-resolution context. */
const resolvePackageEntry: IMoldeaCliPackageEntryResolver = (packageName) =>
  import.meta.resolve(packageName);

/** Narrows a resolved package entry after the complete resolution pass succeeds. */
const isInstalledPackageEntry = (
  entry: readonly [string, string] | null,
): entry is readonly [string, string] => entry !== null;

/** Reads one resolved package's exact identity without executing package code. */
const readInstalledPackageVersion = async (
  packageName: string,
  packageEntry: string,
): Promise<string | null> => {
  let packageDirectory: string;

  try {
    const packageEntryUrl = new URL(packageEntry);

    if (packageEntryUrl.protocol !== 'file:') {
      return null;
    }

    packageDirectory = path.dirname(fileURLToPath(packageEntryUrl));
  } catch {
    return null;
  }

  while (true) {
    try {
      const parsedManifest = JSON.parse(
        await readFile(path.join(packageDirectory, 'package.json'), 'utf8'),
      ) as unknown;

      if (isPlainRecord(parsedManifest) && parsedManifest['name'] === packageName) {
        const version = parsedManifest['version'];

        return typeof version === 'string' && isExactSemanticVersion(version) ? version : null;
      }
    } catch {
      // continue toward the package root when this directory has no readable manifest
    }

    const parentDirectory = path.dirname(packageDirectory);

    if (parentDirectory === packageDirectory) {
      return null;
    }

    packageDirectory = parentDirectory;
  }
};

/** Resolves the actual versions of every declared first-class package dependency. */
const readInstalledPackageVersions = async (
  dependencies: Readonly<Record<string, string>> | null,
  packageEntryResolver: IMoldeaCliPackageEntryResolver,
): Promise<Readonly<Record<string, string>> | null> => {
  if (dependencies === null) {
    return null;
  }

  const packageNames = Object.keys(dependencies).filter((packageName) =>
    packageName.startsWith('@moldea.ai/'),
  );
  const installedPackageEntries = await Promise.all(
    packageNames.map(async (packageName) => {
      try {
        const version = await readInstalledPackageVersion(
          packageName,
          packageEntryResolver(packageName),
        );

        return version === null ? null : ([packageName, version] as const);
      } catch {
        return null;
      }
    }),
  );

  if (!installedPackageEntries.every(isInstalledPackageEntry)) {
    return null;
  }

  return Object.freeze(Object.fromEntries(installedPackageEntries));
};

/**
 * Loads the installed CLI identity and composition used by executable output and integrity checks.
 * @param packageManifestPath The package manifest adjacent to the distribution directory.
 * @param packageEntryResolver The module-resolution boundary for declared first-class packages.
 * @returns A promise resolving to validated package metadata.
 * @throws
 * - If the manifest cannot be read, parsed, or identified as the installed CLI package
 */
export const loadMoldeaCliPackageMetadata = async (
  packageManifestPath: string,
  packageEntryResolver: IMoldeaCliPackageEntryResolver = resolvePackageEntry,
): Promise<IMoldeaCliPackageMetadata> => {
  const parsedManifest = JSON.parse(await readFile(packageManifestPath, 'utf8')) as unknown;

  if (
    !isPlainRecord(parsedManifest) ||
    parsedManifest['name'] !== MOLDEA_CLI_PACKAGE_NAME ||
    typeof parsedManifest['version'] !== 'string' ||
    !isExactSemanticVersion(parsedManifest['version'])
  ) {
    throw new TypeError('The installed CLI package metadata is invalid.');
  }

  const engines = readStringRecord(parsedManifest['engines']);
  const dependencies = readStringRecord(parsedManifest['dependencies']);

  return Object.freeze({
    dependencies,
    installedPackageVersions: await readInstalledPackageVersions(
      dependencies,
      packageEntryResolver,
    ),
    supportedNodeRange: engines?.['node'] ?? null,
    version: parsedManifest['version'],
  });
};
