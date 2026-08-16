// @vitest-environment node
import { describe, expect, test } from 'vitest';

import type { IStaticAnalysisEntry, IStaticAnalysisPackageReader } from '../types.js';
import { createPackageManifestCandidatePaths, discoverPackage } from './discovery.js';

const createReader = (entries: Readonly<Record<string, string | IStaticAnalysisEntry>>) => {
  const reader: IStaticAnalysisPackageReader = {
    getEntry: (path) =>
      Promise.resolve(
        entries[path] === undefined
          ? null
          : { type: typeof entries[path] === 'string' ? 'file' : entries[path].type },
      ),
    readFile: (path) => {
      const entry = entries[path];

      if (typeof entry !== 'string') {
        throw new TypeError(`No file content exists for ${path}.`);
      }

      return Promise.resolve(new TextEncoder().encode(entry));
    },
  };

  return reader;
};

const discover = (entries: Readonly<Record<string, string | IStaticAnalysisEntry>>) =>
  discoverPackage({
    packageName: 'provider-sdk',
    reader: createReader(entries),
    sourcePath: '/src/agent.ts',
    supportedRange: '>=2.0.0 <3.0.0',
  });

describe('createPackageManifestCandidatePaths', () => {
  test('creates nearest-first candidates without enumeration', () => {
    expect(createPackageManifestCandidatePaths('/apps/api/src/agent.ts')).toStrictEqual([
      '/apps/api/src/package.json',
      '/apps/api/package.json',
      '/apps/package.json',
      '/package.json',
    ]);
  });
});

describe('discoverPackage', () => {
  test.each([
    ['^2.0.0', 'supported'],
    ['1.9.0', 'unsupported'],
    ['>=1.0.0 <3.0.0', 'ambiguous'],
    ['latest', 'ambiguous'],
    ['workspace:^2.0.0', 'ambiguous'],
    ['2.0.0-beta.1', 'unsupported'],
  ] as const)('classifies provider-sdk@%s as %s', async (declaredRange, compatibility) => {
    await expect(
      discover({
        '/package.json': JSON.stringify({ dependencies: { 'provider-sdk': declaredRange } }),
      }),
    ).resolves.toStrictEqual({
      kind: 'observed',
      observation: {
        compatibility,
        declarations: [{ declaredRange, dependencyKind: 'dependencies' }],
        path: '/package.json',
      },
    });
  });

  test('classifies declarations collectively and preserves field provenance', async () => {
    await expect(
      discover({
        '/package.json': JSON.stringify({
          dependencies: { 'provider-sdk': '^2.0.0' },
          devDependencies: { 'provider-sdk': '2.1.0' },
          optionalDependencies: { 'provider-sdk': '~2.2.0' },
          peerDependencies: { 'provider-sdk': '>=2.0.0 <3.0.0' },
        }),
      }),
    ).resolves.toStrictEqual({
      kind: 'observed',
      observation: {
        compatibility: 'supported',
        declarations: [
          { declaredRange: '^2.0.0', dependencyKind: 'dependencies' },
          { declaredRange: '~2.2.0', dependencyKind: 'optionalDependencies' },
          { declaredRange: '>=2.0.0 <3.0.0', dependencyKind: 'peerDependencies' },
          { declaredRange: '2.1.0', dependencyKind: 'devDependencies' },
        ],
        path: '/package.json',
      },
    });
  });

  test('stops at the nearest existing manifest without a declaration', async () => {
    await expect(
      discoverPackage({
        packageName: 'provider-sdk',
        reader: createReader({
          '/package.json': JSON.stringify({ dependencies: { 'provider-sdk': '^2.0.0' } }),
          '/apps/api/package.json': JSON.stringify({ dependencies: { typescript: '6.0.3' } }),
        }),
        sourcePath: '/apps/api/src/agent.ts',
        supportedRange: '>=2.0.0 <3.0.0',
      }),
    ).resolves.toStrictEqual({ kind: 'absent' });
  });

  test.each([
    ['invalid JSON', '{'],
    ['non-object dependency field', JSON.stringify({ dependencies: [] })],
    ['empty declaration', JSON.stringify({ dependencies: { 'provider-sdk': '' } })],
    ['non-string declaration', JSON.stringify({ dependencies: { 'provider-sdk': 2 } })],
  ])('reports an invalid nearest manifest for %s', async (_description, content) => {
    await expect(discover({ '/package.json': content })).resolves.toStrictEqual({
      kind: 'invalid',
      path: '/package.json',
    });
  });

  test('treats a non-regular nearest package manifest as invalid', async () => {
    await expect(discover({ '/src/package.json': { type: 'directory' } })).resolves.toStrictEqual({
      kind: 'invalid',
      path: '/src/package.json',
    });
  });

  test('reports absence when no package manifest exists', async () => {
    await expect(discover({})).resolves.toStrictEqual({ kind: 'absent' });
  });
});
