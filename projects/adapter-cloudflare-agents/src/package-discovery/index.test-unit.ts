// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

import {
  createCloudflareAgentsPackageManifestCandidatePaths,
  discoverCloudflareAgentsPackage,
} from './index.js';

describe('Cloudflare Agents package discovery', () => {
  test('orders nearest package candidates before repository root', () => {
    expect(
      createCloudflareAgentsPackageManifestCandidatePaths(
        parseRepositoryPath('/apps/worker/src/agent.ts'),
      ),
    ).toStrictEqual([
      '/apps/worker/src/package.json',
      '/apps/worker/package.json',
      '/apps/package.json',
      '/package.json',
    ]);
  });

  test('collects all target declarations from the nearest owning manifest', async () => {
    const repository = createMemoryRepositoryReader([
      {
        content: JSON.stringify({
          dependencies: {
            '@cloudflare/think': '^0.16.0',
            agents: '^0.21.0',
            ai: '^7.0.0',
          },
        }),
        path: '/package.json',
        type: 'file',
      },
    ]);

    const result = await discoverCloudflareAgentsPackage(
      repository,
      parseRepositoryPath('/src/agent.ts'),
    );

    expect(result.kind).toBe('observed');

    if (result.kind === 'observed') {
      expect([...result.observation.declarations.keys()]).toStrictEqual([
        '@cloudflare/think',
        'agents',
        'ai',
      ]);
    }
  });

  test.each([
    ['invalid JSON', '{'],
    ['non-object dependency field', JSON.stringify({ dependencies: [] })],
    ['empty declaration', JSON.stringify({ dependencies: { agents: '' } })],
  ])('reports an invalid owning manifest for %s', async (_description, content) => {
    const repository = createMemoryRepositoryReader([
      { content, path: '/package.json', type: 'file' },
    ]);

    await expect(
      discoverCloudflareAgentsPackage(repository, parseRepositoryPath('/src/agent.ts')),
    ).resolves.toStrictEqual({ kind: 'invalid', path: '/package.json' });
  });
});
