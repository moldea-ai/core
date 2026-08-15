// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

import { createPackageManifestCandidatePaths, discoverOpenAiPackage } from './index.js';

describe('createPackageManifestCandidatePaths', () => {
  test('creates nearest-first candidates without enumeration', () => {
    expect(
      createPackageManifestCandidatePaths(parseRepositoryPath('/apps/api/src/agent.ts')),
    ).toStrictEqual([
      '/apps/api/src/package.json',
      '/apps/api/package.json',
      '/apps/package.json',
      '/package.json',
    ]);
  });
});

describe('discoverOpenAiPackage', () => {
  test.each([
    ['^7.4.0', 'supported'],
    ['7.3.0', 'unsupported'],
    ['>=7.0.0 <8.0.0', 'ambiguous'],
    ['latest', 'ambiguous'],
    ['workspace:^7.4.0', 'ambiguous'],
    ['file:../openai', 'ambiguous'],
    ['git+https://example.com/openai.git', 'ambiguous'],
    ['7.4.0-beta.1', 'unsupported'],
  ] as const)('classifies openai@%s as %s', async (declaredRange, compatibility) => {
    const repository = createMemoryRepositoryReader([
      {
        content: JSON.stringify({ dependencies: { openai: declaredRange } }),
        path: '/package.json',
        type: 'file',
      },
    ]);

    await expect(
      discoverOpenAiPackage(repository, parseRepositoryPath('/src/agent.ts')),
    ).resolves.toStrictEqual({
      kind: 'observed',
      observation: {
        compatibility,
        declarations: [{ declaredRange, dependencyKind: 'dependencies' }],
        path: '/package.json',
      },
    });
  });

  test('classifies every declaration collectively while preserving field provenance', async () => {
    const supportedRepository = createMemoryRepositoryReader([
      {
        content: JSON.stringify({
          dependencies: { openai: '^7.4.0' },
          devDependencies: { openai: '7.4.0' },
          optionalDependencies: { openai: '~7.4.0' },
          peerDependencies: { openai: '>=7.4.0 <8.0.0' },
        }),
        path: '/package.json',
        type: 'file',
      },
    ]);
    const mixedRepository = createMemoryRepositoryReader([
      {
        content: JSON.stringify({
          dependencies: { openai: '7.3.0' },
          devDependencies: { openai: '7.4.0' },
        }),
        path: '/package.json',
        type: 'file',
      },
    ]);

    await expect(
      discoverOpenAiPackage(supportedRepository, parseRepositoryPath('/src/agent.ts')),
    ).resolves.toStrictEqual({
      kind: 'observed',
      observation: {
        compatibility: 'supported',
        declarations: [
          { declaredRange: '^7.4.0', dependencyKind: 'dependencies' },
          { declaredRange: '~7.4.0', dependencyKind: 'optionalDependencies' },
          { declaredRange: '>=7.4.0 <8.0.0', dependencyKind: 'peerDependencies' },
          { declaredRange: '7.4.0', dependencyKind: 'devDependencies' },
        ],
        path: '/package.json',
      },
    });
    await expect(
      discoverOpenAiPackage(mixedRepository, parseRepositoryPath('/src/agent.ts')),
    ).resolves.toMatchObject({
      kind: 'observed',
      observation: { compatibility: 'ambiguous' },
    });
  });

  test('stops at the nearest existing manifest even when it does not declare OpenAI', async () => {
    const repository = createMemoryRepositoryReader([
      {
        content: JSON.stringify({ dependencies: { openai: '^7.4.0' } }),
        path: '/package.json',
        type: 'file',
      },
      {
        content: JSON.stringify({ dependencies: { typescript: '6.0.3' } }),
        path: '/apps/api/package.json',
        type: 'file',
      },
    ]);

    await expect(
      discoverOpenAiPackage(repository, parseRepositoryPath('/apps/api/src/agent.ts')),
    ).resolves.toStrictEqual({ kind: 'absent' });
  });

  test.each([
    ['invalid JSON', '{'],
    ['non-object dependency field', JSON.stringify({ dependencies: [] })],
    ['empty declaration', JSON.stringify({ dependencies: { openai: '' } })],
    ['non-string declaration', JSON.stringify({ dependencies: { openai: 7 } })],
  ])('reports an invalid nearest manifest for %s', async (_description, content) => {
    const repository = createMemoryRepositoryReader([
      { content, path: '/package.json', type: 'file' },
    ]);

    await expect(
      discoverOpenAiPackage(repository, parseRepositoryPath('/src/agent.ts')),
    ).resolves.toStrictEqual({ kind: 'invalid', path: '/package.json' });
  });

  test('treats a non-regular nearest package manifest as invalid', async () => {
    const repository = createMemoryRepositoryReader([
      { path: '/src/package.json', type: 'directory' },
      {
        content: JSON.stringify({ dependencies: { openai: '^7.4.0' } }),
        path: '/package.json',
        type: 'file',
      },
    ]);

    await expect(
      discoverOpenAiPackage(repository, parseRepositoryPath('/src/agent.ts')),
    ).resolves.toStrictEqual({ kind: 'invalid', path: '/src/package.json' });
  });

  test('reports absence when no package manifest exists', async () => {
    await expect(
      discoverOpenAiPackage(createMemoryRepositoryReader([]), parseRepositoryPath('/src/agent.ts')),
    ).resolves.toStrictEqual({ kind: 'absent' });
  });
});
