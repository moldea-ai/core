// @vitest-environment node
import { describe, expect, test } from 'vitest';

import type { IEvePackageObservation } from '../contracts/index.js';
import { resolveEveAgentRoot } from './agent-roots.js';

const observation: IEvePackageObservation = {
  compatibility: 'supported',
  declarations: [],
  manifestPackageName: '@acme/support-app',
  path: '/package.json' as never,
};

describe('resolveEveAgentRoot', () => {
  test.each([
    ['/agent.ts', '/', 'flat', 'root', null, 'support-app'],
    ['/agent/agent.ts', '/agent', 'nested', 'root', null, 'support-app'],
    [
      '/agent/subagents/research/agent.ts',
      '/agent/subagents/research',
      'nested',
      'local-subagent',
      '/agent',
      'research',
    ],
    [
      '/agent/subagents/research/subagents/deep/agent.ts',
      '/agent/subagents/research/subagents/deep',
      'nested',
      'local-subagent',
      '/agent/subagents/research',
      'deep',
    ],
  ] as const)('resolves %s', (path, agentRoot, layout, agentKind, parentRoot, runtimeName) => {
    expect(resolveEveAgentRoot(path as never, observation)).toMatchObject({
      agentKind,
      agentRoot,
      layout,
      parentRoot,
      runtimeName,
    });
  });

  test('rejects an unrelated agent.ts path', () => {
    expect(resolveEveAgentRoot('/src/agent.ts' as never, observation)).toBeNull();
  });
});
