// @vitest-environment node
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, test } from 'vitest';

import type { IMoldeaCliPackageEntryResolver } from './types.js';
import { loadMoldeaCliPackageMetadata } from './loader.js';

const temporaryDirectories: string[] = [];

const writeManifest = async (manifest: unknown): Promise<string> => {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'moldea-cli-metadata-'));
  const manifestPath = path.join(temporaryDirectory, 'package.json');
  temporaryDirectories.push(temporaryDirectory);
  await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');

  return manifestPath;
};

/** Creates isolated resolved package entries with caller-selected package versions. */
const createPackageEntryResolver = async (
  cliManifestPath: string,
  packageVersions: Readonly<Record<string, string>>,
): Promise<IMoldeaCliPackageEntryResolver> => {
  const packageEntries = new Map<string, string>();

  await Promise.all(
    Object.entries(packageVersions).map(async ([packageName, version]) => {
      const packageDirectory = path.join(path.dirname(cliManifestPath), 'packages', packageName);
      const distributionDirectory = path.join(packageDirectory, 'dist');
      const packageEntryPath = path.join(distributionDirectory, 'index.js');

      await mkdir(distributionDirectory, { recursive: true });
      await Promise.all([
        writeFile(packageEntryPath, 'export {};\n', 'utf8'),
        writeFile(
          path.join(packageDirectory, 'package.json'),
          JSON.stringify({ name: packageName, version }),
          'utf8',
        ),
      ]);
      packageEntries.set(packageName, pathToFileURL(packageEntryPath).href);
    }),
  );

  return (packageName): string => {
    const packageEntry = packageEntries.get(packageName);

    if (packageEntry === undefined) {
      throw new TypeError(`No test package entry exists for ${packageName}.`);
    }

    return packageEntry;
  };
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('loadMoldeaCliPackageMetadata', () => {
  test('loads and freezes exact installed package metadata', async () => {
    const manifestPath = await writeManifest({
      dependencies: {
        '@moldea.ai/core': '2.0.0',
        '@moldea.ai/repository': '1.0.1',
        '@moldea.ai/repository-fs': '1.0.1',
        semver: '7.8.5',
      },
      engines: { node: '^22.11.0 || ^24.11.0' },
      name: '@moldea.ai/cli',
      version: '1.0.1',
    });
    const metadata = await loadMoldeaCliPackageMetadata(manifestPath);

    expect(metadata).toStrictEqual({
      dependencies: {
        '@moldea.ai/core': '2.0.0',
        '@moldea.ai/repository': '1.0.1',
        '@moldea.ai/repository-fs': '1.0.1',
        semver: '7.8.5',
      },
      installedPackageVersions: {
        '@moldea.ai/core': '2.0.0',
        '@moldea.ai/repository': '1.0.1',
        '@moldea.ai/repository-fs': '1.0.1',
      },
      supportedNodeRange: '^22.11.0 || ^24.11.0',
      version: '1.0.1',
    });
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(Object.isFrozen(metadata.dependencies)).toBe(true);
    expect(Object.isFrozen(metadata.installedPackageVersions)).toBe(true);
  });

  test('accepts valid prerelease and build metadata', async () => {
    const manifestPath = await writeManifest({
      name: '@moldea.ai/cli',
      version: '1.2.3-rc.1+build.4',
    });

    await expect(loadMoldeaCliPackageMetadata(manifestPath)).resolves.toStrictEqual({
      dependencies: null,
      installedPackageVersions: null,
      supportedNodeRange: null,
      version: '1.2.3-rc.1+build.4',
    });
  });

  test.each([
    [{ dependencies: null, engines: { node: '^24.11.0' } }, null, '^24.11.0'],
    [{ dependencies: { package: 1 }, engines: { node: '^24.11.0' } }, null, '^24.11.0'],
    [{ dependencies: {}, engines: null }, {}, null],
    [{ dependencies: {}, engines: { node: 24 } }, {}, null],
  ])(
    'retains invalid composition fields for compatibility-state reporting %o',
    async (fields, dependencies, supportedNodeRange) => {
      const manifestPath = await writeManifest({
        ...fields,
        name: '@moldea.ai/cli',
        version: '1.0.0',
      });

      await expect(loadMoldeaCliPackageMetadata(manifestPath)).resolves.toStrictEqual({
        dependencies,
        installedPackageVersions: dependencies === null ? null : {},
        supportedNodeRange,
        version: '1.0.0',
      });
    },
  );

  test('retains the actual resolved package version for compatibility rejection', async () => {
    const manifestPath = await writeManifest({
      dependencies: {
        '@moldea.ai/core': '1.0.0',
        '@moldea.ai/repository': '1.0.0',
        '@moldea.ai/repository-fs': '1.0.0',
      },
      engines: { node: '^22.11.0 || ^24.11.0' },
      name: '@moldea.ai/cli',
      version: '1.0.0',
    });
    const packageEntryResolver = await createPackageEntryResolver(manifestPath, {
      '@moldea.ai/core': '0.0.2',
      '@moldea.ai/repository': '1.0.0',
      '@moldea.ai/repository-fs': '1.0.0',
    });

    await expect(
      loadMoldeaCliPackageMetadata(manifestPath, packageEntryResolver),
    ).resolves.toMatchObject({
      dependencies: { '@moldea.ai/core': '1.0.0' },
      installedPackageVersions: { '@moldea.ai/core': '0.0.2' },
    });
  });

  test('retains exact prerelease and build metadata from a resolved package', async () => {
    const packageVersion = '1.2.3-rc.1+build.4';
    const manifestPath = await writeManifest({
      dependencies: { '@moldea.ai/core': packageVersion },
      name: '@moldea.ai/cli',
      version: '1.0.0',
    });
    const packageEntryResolver = await createPackageEntryResolver(manifestPath, {
      '@moldea.ai/core': packageVersion,
    });

    await expect(
      loadMoldeaCliPackageMetadata(manifestPath, packageEntryResolver),
    ).resolves.toMatchObject({
      installedPackageVersions: { '@moldea.ai/core': packageVersion },
    });
  });

  test.each([
    [{ name: '@moldea.ai/not-cli', version: '1.0.0' }],
    [{ name: '@moldea.ai/cli', version: '01.0.0' }],
    [{ name: '@moldea.ai/cli', version: '1.0.0-01' }],
    [{ name: '@moldea.ai/cli', version: 'v1.0.0' }],
    [{ name: '@moldea.ai/cli', version: ' 1.0.0 ' }],
    [{ name: '@moldea.ai/cli', version: '' }],
    [{ name: '@moldea.ai/cli' }],
    [null],
  ])('rejects invalid package metadata %o', async (manifest) => {
    const manifestPath = await writeManifest(manifest);

    await expect(loadMoldeaCliPackageMetadata(manifestPath)).rejects.toThrow(
      'The installed CLI package metadata is invalid.',
    );
  });
});
