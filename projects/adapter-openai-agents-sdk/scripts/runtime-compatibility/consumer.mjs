import assert from 'node:assert/strict';

import { openAiAgentsSdkAdapter } from '@moldea.ai/adapter-openai-agents-sdk';
import { createCore } from '@moldea.ai/core';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

assert.deepStrictEqual(Object.keys(await import('@moldea.ai/adapter-openai-agents-sdk')), [
  'openAiAgentsSdkAdapter',
]);
assert.equal(openAiAgentsSdkAdapter.id, 'openai-agents-sdk');
assert.deepStrictEqual(openAiAgentsSdkAdapter.supportedRepositoryFormatVersions, [1]);
assert.equal(Object.isFrozen(openAiAgentsSdkAdapter), true);

const repository = createMemoryRepositoryReader([
  {
    content: [
      'version: 1',
      'agents:',
      '  support:',
      '    runtime:',
      '      id: openai-agents-sdk',
      '    bindings:',
      '      runtimeAgent:',
      '        path: /src/agent.ts',
      '        symbol: supportAgent',
      '',
    ].join('\n'),
    path: '/moldea/moldea.yaml',
    type: 'file',
  },
  { content: '# Packed OpenAI Agents SDK adapter\n', path: '/moldea/project.md', type: 'file' },
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
    content: '{"dependencies":{"@openai/agents":"^0.16.1"}}\n',
    path: '/package.json',
    type: 'file',
  },
  {
    content: [
      "import { Agent } from '@openai/agents';",
      "export const supportAgent = new Agent({ name: 'support', instructions: 'Help users.' });",
      '',
    ].join('\n'),
    path: '/src/agent.ts',
    type: 'file',
  },
]);
const result = await createCore({ adapters: [openAiAgentsSdkAdapter] }).inspectProject({
  repository,
});

assert.equal(result.valid, true);
assert.deepStrictEqual(result.diagnostics, []);
assert.deepStrictEqual(
  result.evidence.map(({ kind }) => kind),
  ['agent-definition', 'language', 'runtime-package'],
);
