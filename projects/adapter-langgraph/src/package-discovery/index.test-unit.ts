// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

import { discoverLangGraphPackages } from './index.js';

const discover = (dependencies: Readonly<Record<string, string>>) =>
  discoverLangGraphPackages(
    createMemoryRepositoryReader([
      {
        content: JSON.stringify({ dependencies }),
        path: '/package.json',
        type: 'file',
      },
    ]),
    parseRepositoryPath('/src/agent.ts'),
  );

describe('discoverLangGraphPackages', () => {
  test.each([
    ['supported', '~1.4.12', '~1.2.9', 'supported'],
    ['incomplete', '~1.4.12', undefined, 'incomplete'],
    ['unsupported primary', '1.3.0', '~1.2.9', 'unsupported'],
    ['unsupported companion', '~1.4.12', '1.1.0', 'unsupported'],
    ['ambiguous primary', 'workspace:*', '~1.2.9', 'ambiguous'],
    ['ambiguous companion', '~1.4.12', 'workspace:*', 'ambiguous'],
    ['absent packages', undefined, undefined, 'absent'],
    ['absent primary', undefined, '~1.2.9', 'absent'],
    ['absent primary with ambiguous companion', undefined, 'workspace:*', 'absent'],
    ['absent primary with unsupported companion', undefined, '1.1.0', 'absent'],
  ] as const)(
    'classifies the %s package pair',
    async (_description, primary, companion, expectedClassification) => {
      const dependencies = {
        ...(companion === undefined ? {} : { '@langchain/core': companion }),
        ...(primary === undefined ? {} : { '@langchain/langgraph': primary }),
      };
      const result = await discover(dependencies);

      expect(result).toMatchObject({
        kind: 'observed',
        observation: { targetClassification: expectedClassification },
      });
    },
  );

  test('stops at an owning manifest that omits the primary package', async () => {
    const result = await discoverLangGraphPackages(
      createMemoryRepositoryReader([
        {
          content: JSON.stringify({
            dependencies: { '@langchain/langgraph': '~1.4.12' },
          }),
          path: '/package.json',
          type: 'file',
        },
        {
          content: JSON.stringify({ dependencies: { typescript: '6.0.3' } }),
          path: '/apps/api/package.json',
          type: 'file',
        },
      ]),
      parseRepositoryPath('/apps/api/src/agent.ts'),
    );

    expect(result).toMatchObject({
      kind: 'observed',
      observation: { path: '/apps/api/package.json', targetClassification: 'absent' },
    });
  });
});
