import assert from 'node:assert/strict';

import { claudeAgentSdkAdapter } from '@moldea.ai/adapter-claude-agent-sdk';
import { createCore } from '@moldea.ai/core';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

assert.deepStrictEqual(Object.keys(await import('@moldea.ai/adapter-claude-agent-sdk')), [
  'claudeAgentSdkAdapter',
]);
assert.equal(claudeAgentSdkAdapter.id, 'claude-agent-sdk');
assert.deepStrictEqual(claudeAgentSdkAdapter.supportedRepositoryFormatVersions, [1]);
assert.equal(Object.isFrozen(claudeAgentSdkAdapter), true);

const repository = createMemoryRepositoryReader([
  {
    content: [
      'version: 1',
      'agents:',
      '  support:',
      '    runtime:',
      '      id: claude-agent-sdk',
      '    bindings:',
      '      runtimeAgent:',
      '        path: /src/agent.ts',
      '        symbol: supportAgent',
      '',
    ].join('\n'),
    path: '/moldea/moldea.yaml',
    type: 'file',
  },
  { content: '# Packed Claude Agent SDK adapter\n', path: '/moldea/project.md', type: 'file' },
  {
    content: 'Support agent.\n',
    path: '/moldea/agents/support/description.md',
    type: 'file',
  },
  {
    content: 'You are the `support` agent.\n',
    path: '/moldea/agents/support/instruction.md',
    type: 'file',
  },
  {
    content: '{"dependencies":{"@anthropic-ai/claude-agent-sdk":"^0.3.234"}}\n',
    path: '/package.json',
    type: 'file',
  },
  {
    content: [
      "import { query } from '@anthropic-ai/claude-agent-sdk';",
      'export const supportAgent = (prompt) => query({ prompt });',
      '',
    ].join('\n'),
    path: '/src/agent.ts',
    type: 'file',
  },
]);
const result = await createCore({ adapters: [claudeAgentSdkAdapter] }).inspectProject({
  repository,
});

assert.equal(result.valid, true);
assert.deepStrictEqual(result.diagnostics, []);
assert.deepStrictEqual(
  result.evidence.map(({ kind }) => kind),
  ['language', 'runtime-package', 'runtime-pattern'],
);
