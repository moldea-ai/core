import assert from 'node:assert/strict';

import { createCore } from '@moldea.ai/core';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';
import * as anthropicAdapterPackage from '@moldea.ai/adapter-anthropic';

assert.deepStrictEqual(Object.keys(anthropicAdapterPackage), ['anthropicAdapter']);
assert.equal(anthropicAdapterPackage.anthropicAdapter.id, 'anthropic');
assert.deepStrictEqual(
  anthropicAdapterPackage.anthropicAdapter.supportedRepositoryFormatVersions,
  [1],
);
assert.equal(Object.isFrozen(anthropicAdapterPackage.anthropicAdapter), true);

const repository = createMemoryRepositoryReader([
  {
    content: [
      'version: 1',
      'agents:',
      '  support:',
      '    runtime:',
      '      id: anthropic',
      '    bindings:',
      '      runtimeAgent:',
      '        path: /src/agent.ts',
      '        symbol: supportAgent',
      '',
    ].join('\n'),
    path: '/moldea/moldea.yaml',
    type: 'file',
  },
  {
    content: '# Packed Anthropic adapter\n',
    path: '/moldea/project.md',
    type: 'file',
  },
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
    content: '{"dependencies":{"@anthropic-ai/sdk":"^0.117.1"}}\n',
    path: '/package.json',
    type: 'file',
  },
  {
    content: [
      "import Anthropic from '@anthropic-ai/sdk';",
      'const client = new Anthropic();',
      "export const supportAgent = () => client.messages.create({ max_tokens: 16, messages: [], model: 'claude-test' });",
      '',
    ].join('\n'),
    path: '/src/agent.ts',
    type: 'file',
  },
]);
const result = await createCore({
  adapters: [anthropicAdapterPackage.anthropicAdapter],
}).inspectProject({ repository });

assert.equal(result.valid, true);
assert.deepStrictEqual(result.diagnostics, []);
assert.deepStrictEqual(
  result.evidence.map(({ kind }) => kind),
  ['language', 'runtime-package', 'runtime-pattern'],
);
