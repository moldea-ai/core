import assert from 'node:assert/strict';

import { vercelAiSdkAdapter } from '@moldea.ai/adapter-vercel-ai-sdk';
import { createCore } from '@moldea.ai/core';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

assert.deepStrictEqual(Object.keys(await import('@moldea.ai/adapter-vercel-ai-sdk')), [
  'vercelAiSdkAdapter',
]);
assert.equal(vercelAiSdkAdapter.id, 'vercel-ai-sdk');
assert.deepStrictEqual(vercelAiSdkAdapter.supportedRepositoryFormatVersions, [1]);
assert.equal(Object.isFrozen(vercelAiSdkAdapter), true);

const repository = createMemoryRepositoryReader([
  {
    content: [
      'version: 1',
      'agents:',
      '  support:',
      '    runtime:',
      '      id: vercel-ai-sdk',
      '    bindings:',
      '      runtimeAgent:',
      '        path: /src/agent.ts',
      '        symbol: supportAgent',
      '',
    ].join('\n'),
    path: '/moldea/moldea.yaml',
    type: 'file',
  },
  { content: '# Packed Vercel AI SDK adapter\n', path: '/moldea/project.md', type: 'file' },
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
    content: '{"dependencies":{"ai":"^7.0.66"}}\n',
    path: '/package.json',
    type: 'file',
  },
  {
    content: [
      "import { ToolLoopAgent } from 'ai';",
      "export const supportAgent = new ToolLoopAgent({ id: 'support-runtime' });",
      '',
    ].join('\n'),
    path: '/src/agent.ts',
    type: 'file',
  },
]);
const result = await createCore({ adapters: [vercelAiSdkAdapter] }).inspectProject({
  repository,
});

assert.equal(result.valid, true);
assert.deepStrictEqual(result.diagnostics, []);
assert.deepStrictEqual(
  result.evidence.map(({ kind }) => kind),
  ['agent-definition', 'language', 'runtime-package'],
);
