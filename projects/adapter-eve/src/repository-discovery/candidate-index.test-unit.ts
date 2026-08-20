// @vitest-environment node
import { describe, expect, test } from 'vitest';

import type { IRepositoryEntry } from '@moldea.ai/repository';

import { createEveAgentRootIndex } from './candidate-index.js';

const entry = (path: string, type: IRepositoryEntry['type'] = 'file'): IRepositoryEntry => ({
  path: path as never,
  type,
});

describe('createEveAgentRootIndex', () => {
  test('indexes recursive runtime names, collisions, skills, subagents, and extensions', () => {
    const index = createEveAgentRootIndex('/agent' as never, [
      entry('/agent/agent.ts'),
      entry('/agent/tools/orders/find.ts'),
      entry('/agent/tools/orders-find.ts'),
      entry('/agent/tools/legacy.js'),
      entry('/agent/skills/research.ts'),
      entry('/agent/skills/guide/SKILL.md'),
      entry('/agent/subagents/summary/agent.ts'),
      entry('/agent/extensions/acme.ts'),
      entry('/agent/tools/acme__search.ts'),
    ]);

    expect(index.isAgentSlotCollided).toBe(false);
    expect(index.toolCandidates.map(({ runtimeName }) => runtimeName)).toStrictEqual([
      'acme__search',
      'legacy',
      'orders-find',
      'orders-find',
    ]);
    expect(
      index.toolCandidates.filter(({ runtimeName }) => runtimeName === 'orders-find'),
    ).toHaveLength(2);
    expect(
      index.toolCandidates.find(({ runtimeName }) => runtimeName === 'acme__search'),
    ).toMatchObject({
      isExtensionReserved: true,
    });
    expect(index.skillCandidates).toHaveLength(2);
    expect(index.subagentCandidates).toStrictEqual([
      {
        agentPath: '/agent/subagents/summary/agent.ts',
        isDirectoryBacked: true,
        isExtensionReserved: false,
        runtimeName: 'summary',
      },
    ]);
  });
});
