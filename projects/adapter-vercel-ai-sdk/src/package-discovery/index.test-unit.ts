// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

import { createPackageManifestCandidatePaths, discoverVercelAiSdkPackage } from './index.js';

describe('Vercel AI SDK package discovery', () => {
  test('orders nearest package candidates before repository root', () => {
    expect(
      createPackageManifestCandidatePaths(parseRepositoryPath('/apps/web/src/agent.ts')),
    ).toStrictEqual([
      '/apps/web/src/package.json',
      '/apps/web/package.json',
      '/apps/package.json',
      '/package.json',
    ]);
  });

  test.each([
    ['7.0.66', 'supported'],
    ['^7.0.66', 'supported'],
    ['7.0.65', 'unsupported'],
    ['8.0.0', 'unsupported'],
    ['>=7.0.0 <8.0.0', 'ambiguous'],
    ['latest', 'ambiguous'],
    ['workspace:^7.0.66', 'ambiguous'],
    ['7.0.66-beta.1', 'unsupported'],
  ] as const)('classifies ai@%s as %s', async (declaredRange, compatibility) => {
    const repository = createMemoryRepositoryReader([
      {
        content: JSON.stringify({ dependencies: { ai: declaredRange } }),
        path: '/package.json',
        type: 'file',
      },
      { content: '', path: '/src/agent.ts', type: 'file' },
    ]);

    await expect(
      discoverVercelAiSdkPackage(repository, parseRepositoryPath('/src/agent.ts')),
    ).resolves.toStrictEqual({
      kind: 'observed',
      observation: {
        compatibility,
        declarations: [{ declaredRange, dependencyKind: 'dependencies' }],
        path: '/package.json',
      },
    });
  });

  test.each([
    ['invalid JSON', '{'],
    ['non-object dependency field', JSON.stringify({ dependencies: [] })],
    ['empty declaration', JSON.stringify({ dependencies: { ai: '' } })],
    ['non-string declaration', JSON.stringify({ dependencies: { ai: 7 } })],
  ])('reports an invalid owning manifest for %s', async (_description, content) => {
    const repository = createMemoryRepositoryReader([
      { content, path: '/package.json', type: 'file' },
    ]);

    await expect(
      discoverVercelAiSdkPackage(repository, parseRepositoryPath('/src/agent.ts')),
    ).resolves.toStrictEqual({ kind: 'invalid', path: '/package.json' });
  });
});
