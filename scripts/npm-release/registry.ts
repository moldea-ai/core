import { valid } from 'semver';

import { NPM_RELEASE_REGISTRY_URL } from './constants.ts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Parses the exact published version inventory from npm package metadata.
 * @param metadata The untrusted registry document.
 * @param packageName The expected npm package identity.
 * @returns The published semantic versions in registry order.
 * @throws
 * - If the registry metadata identity or version inventory is invalid
 */
export const parseNpmRegistryVersions = (metadata: unknown, packageName: string): string[] => {
  if (!isRecord(metadata) || metadata['name'] !== packageName || !isRecord(metadata['versions'])) {
    throw new TypeError(`The npm registry metadata for ${packageName} is invalid.`);
  }

  const versions = Object.keys(metadata['versions']);

  if (versions.some((version) => valid(version) === null)) {
    throw new TypeError(`The npm registry versions for ${packageName} are invalid.`);
  }

  return versions;
};

/**
 * Loads all published versions of one public package without registry credentials.
 * @param packageName The public npm package identity.
 * @param request The HTTP boundary used to request public registry metadata.
 * @returns A promise resolving to published versions, or an empty list when unpublished.
 * @throws
 * - If the registry request fails or returns invalid package metadata
 */
export const loadNpmRegistryVersions = async (
  packageName: string,
  request: typeof fetch = fetch,
): Promise<string[]> => {
  const response = await request(
    new URL(encodeURIComponent(packageName), NPM_RELEASE_REGISTRY_URL),
    { headers: { accept: 'application/json' } },
  );

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    throw new Error(`The npm registry request for ${packageName} failed with ${response.status}.`);
  }

  return parseNpmRegistryVersions(await response.json(), packageName);
};
