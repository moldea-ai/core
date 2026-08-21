import assert from 'node:assert/strict';

import { langGraphAdapter } from '@moldea.ai/adapter-langgraph';
import { createCore } from '@moldea.ai/core';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

assert.deepStrictEqual(Object.keys(await import('@moldea.ai/adapter-langgraph')), [
  'langGraphAdapter',
]);
assert.equal(langGraphAdapter.id, 'langgraph');
assert.deepStrictEqual(langGraphAdapter.supportedRepositoryFormatVersions, [1]);
assert.equal(Object.isFrozen(langGraphAdapter), true);

const repository = createMemoryRepositoryReader([
  {
    content: [
      'version: 1',
      'agents:',
      '  support:',
      '    runtime:',
      '      id: langgraph',
      '    bindings:',
      '      runtimeAgent:',
      '        path: /agent/graph.ts',
      '        symbol: supportGraph',
      '',
    ].join('\n'),
    path: '/moldea/moldea.yaml',
    type: 'file',
  },
  { content: '# Packed LangGraph adapter\n', path: '/moldea/project.md', type: 'file' },
  { content: 'Supports customers.\n', path: '/moldea/agents/support/description.md', type: 'file' },
  {
    content: 'You are the `support` agent.\n',
    path: '/moldea/agents/support/instruction.md',
    type: 'file',
  },
  {
    content:
      '{"name":"support-app","dependencies":{"@langchain/core":"~1.2.9","@langchain/langgraph":"~1.4.12"}}\n',
    path: '/package.json',
    type: 'file',
  },
  {
    content: [
      "import { StateGraph } from '@langchain/langgraph';",
      "export const supportGraph = new StateGraph(getSchema()).compile({ name: 'support_graph' });",
      '',
    ].join('\n'),
    path: '/agent/graph.ts',
    type: 'file',
  },
]);
const result = await createCore({ adapters: [langGraphAdapter] }).inspectProject({ repository });

assert.equal(result.valid, true);
assert.deepStrictEqual(result.diagnostics, []);
assert.equal(
  result.evidence.some(({ kind }) => kind === 'agent-definition'),
  true,
);
assert.equal(result.evidence.filter(({ kind }) => kind === 'runtime-package').length, 2);
