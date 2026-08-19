// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

import { createPackageManifestCandidatePaths, discoverClaudeAgentSdkPackage } from './index.js';

describe('Claude Agent SDK package discovery', () => {
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

  test.each([
    ['0.3.234', 'supported'],
    ['^0.3.234', 'supported'],
    ['0.3.233', 'unsupported'],
    ['0.4.0', 'unsupported'],
    ['>=0.3.233 <0.4.0', 'ambiguous'],
    ['latest', 'ambiguous'],
    ['workspace:^0.3.234', 'ambiguous'],
    ['0.3.234-beta.1', 'unsupported'],
  ] as const)(
    'classifies @anthropic-ai/claude-agent-sdk@%s as %s',
    async (declaredRange, compatibility) => {
      const repository = createMemoryRepositoryReader([
        {
          content: JSON.stringify({
            dependencies: { '@anthropic-ai/claude-agent-sdk': declaredRange },
          }),
          path: '/package.json',
          type: 'file',
        },
      ]);

      await expect(
        discoverClaudeAgentSdkPackage(repository, parseRepositoryPath('/src/agent.ts')),
      ).resolves.toStrictEqual({
        kind: 'observed',
        observation: {
          compatibility,
          declarations: [{ declaredRange, dependencyKind: 'dependencies' }],
          path: '/package.json',
        },
      });
    },
  );

  test.each([
    ['invalid JSON', '{'],
    ['non-object dependency field', JSON.stringify({ dependencies: [] })],
    [
      'empty declaration',
      JSON.stringify({ dependencies: { '@anthropic-ai/claude-agent-sdk': '' } }),
    ],
    [
      'non-string declaration',
      JSON.stringify({ dependencies: { '@anthropic-ai/claude-agent-sdk': 2 } }),
    ],
  ])('reports an invalid owning manifest for %s', async (_description, content) => {
    const repository = createMemoryRepositoryReader([
      { content, path: '/package.json', type: 'file' },
    ]);

    await expect(
      discoverClaudeAgentSdkPackage(repository, parseRepositoryPath('/src/agent.ts')),
    ).resolves.toStrictEqual({ kind: 'invalid', path: '/package.json' });
  });
});
