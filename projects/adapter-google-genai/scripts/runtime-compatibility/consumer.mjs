import assert from 'node:assert/strict';

import { googleGenAiAdapter } from '@moldea.ai/adapter-google-genai';
import { createCore } from '@moldea.ai/core';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

assert.deepStrictEqual(Object.keys(await import('@moldea.ai/adapter-google-genai')), [
  'googleGenAiAdapter',
]);
assert.equal(googleGenAiAdapter.id, 'google-genai');
assert.deepStrictEqual(googleGenAiAdapter.supportedRepositoryFormatVersions, [1]);
assert.equal(Object.isFrozen(googleGenAiAdapter), true);

const repository = createMemoryRepositoryReader([
  {
    content: [
      'version: 1',
      'agents:',
      '  support:',
      '    runtime:',
      '      id: google-genai',
      '    bindings:',
      '      runtimeAgent:',
      '        path: /src/agent.ts',
      '        symbol: supportAgent',
      '',
    ].join('\n'),
    path: '/moldea/moldea.yaml',
    type: 'file',
  },
  { content: '# Packed Google Gen AI adapter\n', path: '/moldea/project.md', type: 'file' },
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
    content: '{"dependencies":{"@google/genai":"^2.17.1"}}\n',
    path: '/package.json',
    type: 'file',
  },
  {
    content: [
      "import { GoogleGenAI } from '@google/genai';",
      'const client = new GoogleGenAI();',
      "export const supportAgent = () => client.models.generateContent({ contents: 'hello', model: 'gemini' });",
      '',
    ].join('\n'),
    path: '/src/agent.ts',
    type: 'file',
  },
]);
const result = await createCore({ adapters: [googleGenAiAdapter] }).inspectProject({ repository });

assert.equal(result.valid, true);
assert.deepStrictEqual(result.diagnostics, []);
assert.deepStrictEqual(
  result.evidence.map(({ kind }) => kind),
  ['language', 'runtime-package', 'runtime-pattern'],
);
