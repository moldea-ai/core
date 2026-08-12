// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import { loadMoldeaCliPackageMetadata } from './loader.js';

const temporaryDirectories: string[] = [];

const writeManifest = async (manifest: unknown): Promise<string> => {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'moldea-cli-metadata-'));
  const manifestPath = path.join(temporaryDirectory, 'package.json');
  temporaryDirectories.push(temporaryDirectory);
  await writeFile(manifestPath, JSON.stringify(manifest), 'utf8');

  return manifestPath;
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
    const manifestPath = await writeManifest({ name: '@moldea.ai/cli', version: '0.0.1' });
    const metadata = await loadMoldeaCliPackageMetadata(manifestPath);

    expect(metadata).toStrictEqual({ version: '0.0.1' });
    expect(Object.isFrozen(metadata)).toBe(true);
  });

  test('accepts valid prerelease and build metadata', async () => {
    const manifestPath = await writeManifest({
      name: '@moldea.ai/cli',
      version: '1.2.3-rc.1+build.4',
    });

    await expect(loadMoldeaCliPackageMetadata(manifestPath)).resolves.toStrictEqual({
      version: '1.2.3-rc.1+build.4',
    });
  });

  test.each([
    [{ name: '@moldea.ai/not-cli', version: '0.0.1' }],
    [{ name: '@moldea.ai/cli', version: '01.0.0' }],
    [{ name: '@moldea.ai/cli', version: '1.0.0-01' }],
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
