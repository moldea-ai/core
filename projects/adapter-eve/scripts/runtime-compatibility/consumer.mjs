import assert from 'node:assert/strict';

import { eveAdapter } from '@moldea.ai/adapter-eve';
import { createCore } from '@moldea.ai/core';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

assert.deepStrictEqual(Object.keys(await import('@moldea.ai/adapter-eve')), ['eveAdapter']);
assert.equal(eveAdapter.id, 'eve');
assert.deepStrictEqual(eveAdapter.supportedRepositoryFormatVersions, [1]);
assert.equal(Object.isFrozen(eveAdapter), true);

const repository = createMemoryRepositoryReader([
  {
    content: [
      'version: 1',
      'agents:',
      '  support:',
      '    runtime:',
      '      id: eve',
      '    bindings:',
      '      runtimeAgent:',
      '        path: /agent/agent.ts',
      '        symbol: default',
      '',
    ].join('\n'),
    path: '/moldea/moldea.yaml',
    type: 'file',
  },
  { content: '# Packed Eve adapter\n', path: '/moldea/project.md', type: 'file' },
  { content: 'Supports customers.\n', path: '/moldea/agents/support/description.md', type: 'file' },
  {
    content: 'You are the `support` agent.\n',
    path: '/moldea/agents/support/instruction.md',
    type: 'file',
  },
  {
    content: '{"name":"support-app","dependencies":{"eve":"^0.39.1"}}\n',
    path: '/package.json',
    type: 'file',
  },
  {
    content: [
      "import { defineAgent } from 'eve';",
      "export default defineAgent({ model: 'provider/model' });",
      '',
    ].join('\n'),
    path: '/agent/agent.ts',
    type: 'file',
  },
]);
const result = await createCore({ adapters: [eveAdapter] }).inspectProject({ repository });

assert.equal(result.valid, true);
assert.deepStrictEqual(result.diagnostics, []);
assert.equal(
  result.evidence.some(({ kind }) => kind === 'agent-definition'),
  true,
);
assert.equal(result.evidence.filter(({ kind }) => kind === 'runtime-package').length, 1);
