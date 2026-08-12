import { readFile } from 'node:fs/promises';

import type { IMoldeaCliPackageMetadata } from './types.js';

const MOLDEA_CLI_PACKAGE_NAME = '@moldea.ai/cli';
const SEMANTIC_VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/u;

const isPlainRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;

  return prototype === Object.prototype || prototype === null;
};

/**
 * Loads the installed CLI identity and version used by executable output.
 * @param packageManifestPath The package manifest adjacent to the distribution directory.
 * @returns A promise resolving to validated package metadata.
 * @throws
 * - If the manifest cannot be read, parsed, or validated as the installed CLI package
 */
export const loadMoldeaCliPackageMetadata = async (
  packageManifestPath: string,
): Promise<IMoldeaCliPackageMetadata> => {
  const parsedManifest = JSON.parse(await readFile(packageManifestPath, 'utf8')) as unknown;

  if (
    !isPlainRecord(parsedManifest) ||
    parsedManifest['name'] !== MOLDEA_CLI_PACKAGE_NAME ||
    typeof parsedManifest['version'] !== 'string' ||
    !SEMANTIC_VERSION_PATTERN.test(parsedManifest['version'])
  ) {
    throw new TypeError('The installed CLI package metadata is invalid.');
  }

  return Object.freeze({ version: parsedManifest['version'] });
};
