import assert from 'node:assert/strict';

import { langChainAdapter } from '@moldea.ai/adapter-langchain';
import { createCore } from '@moldea.ai/core';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

assert.deepStrictEqual(Object.keys(await import('@moldea.ai/adapter-langchain')), [
  'langChainAdapter',
]);
assert.equal(langChainAdapter.id, 'langchain');
assert.deepStrictEqual(langChainAdapter.supportedRepositoryFormatVersions, [1]);
assert.equal(Object.isFrozen(langChainAdapter), true);

const repository = createMemoryRepositoryReader([
  {
    content: [
      'version: 1',
      'agents:',
      '  support:',
      '    runtime:',
      '      id: langchain',
      '    bindings:',
      '      runtimeAgent:',
      '        path: /agent/agent.ts',
      '        symbol: supportAgent',
      '',
    ].join('\n'),
    path: '/moldea/moldea.yaml',
    type: 'file',
  },
  { content: '# Packed LangChain adapter\n', path: '/moldea/project.md', type: 'file' },
  { content: 'Supports customers.\n', path: '/moldea/agents/support/description.md', type: 'file' },
  {
    content: 'You are the `support` agent.\n',
    path: '/moldea/agents/support/instruction.md',
    type: 'file',
  },
  {
    content:
      '{"name":"support-app","dependencies":{"@langchain/core":"~1.2.8","langchain":"~1.5.9"}}\n',
    path: '/package.json',
    type: 'file',
  },
  {
    content: [
      "import { createAgent } from 'langchain';",
      "export const supportAgent = createAgent({ model: 'provider:model', systemPrompt: 'Support customers.' });",
      '',
    ].join('\n'),
    path: '/agent/agent.ts',
    type: 'file',
  },
]);
const result = await createCore({ adapters: [langChainAdapter] }).inspectProject({ repository });

assert.equal(result.valid, true);
assert.deepStrictEqual(result.diagnostics, []);
assert.equal(
  result.evidence.some(({ kind }) => kind === 'agent-definition'),
  true,
);
assert.equal(result.evidence.filter(({ kind }) => kind === 'runtime-package').length, 2);
