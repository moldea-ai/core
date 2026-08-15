import assert from 'node:assert/strict';

import { createCore } from '@moldea.ai/core';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';
import * as openAiAdapterPackage from '@moldea.ai/adapter-openai';

assert.deepStrictEqual(Object.keys(openAiAdapterPackage), ['openAiAdapter']);
assert.equal(openAiAdapterPackage.openAiAdapter.id, 'openai');
assert.deepStrictEqual(openAiAdapterPackage.openAiAdapter.supportedRepositoryFormatVersions, [1]);
assert.equal(Object.isFrozen(openAiAdapterPackage.openAiAdapter), true);

const repository = createMemoryRepositoryReader([
  {
    content: [
      'version: 1',
      'agents:',
      '  support:',
      '    runtime:',
      '      id: openai',
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
    content: '# Packed OpenAI adapter\n',
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
    content: '{"dependencies":{"openai":"^7.4.0"}}\n',
    path: '/package.json',
    type: 'file',
  },
  {
    content: [
      "import OpenAI from 'openai';",
      'const client = new OpenAI();',
      "export const supportAgent = () => client.responses.create({ input: 'hello' });",
      '',
    ].join('\n'),
    path: '/src/agent.ts',
    type: 'file',
  },
]);
const result = await createCore({
  adapters: [openAiAdapterPackage.openAiAdapter],
}).inspectProject({ repository });

assert.equal(result.valid, true);
assert.deepStrictEqual(result.diagnostics, []);
assert.deepStrictEqual(
  result.evidence.map(({ kind }) => kind),
  ['language', 'runtime-package', 'runtime-pattern'],
);
