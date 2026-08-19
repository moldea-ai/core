import assert from 'node:assert/strict';

import { cloudflareAgentsAdapter } from '@moldea.ai/adapter-cloudflare-agents';
import { createCore } from '@moldea.ai/core';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

assert.deepStrictEqual(Object.keys(await import('@moldea.ai/adapter-cloudflare-agents')), [
  'cloudflareAgentsAdapter',
]);
assert.equal(cloudflareAgentsAdapter.id, 'cloudflare-agents');
assert.deepStrictEqual(cloudflareAgentsAdapter.supportedRepositoryFormatVersions, [1]);
assert.equal(Object.isFrozen(cloudflareAgentsAdapter), true);

const repository = createMemoryRepositoryReader([
  {
    content: [
      'version: 1',
      'agents:',
      '  support:',
      '    runtime:',
      '      id: cloudflare-agents',
      '    bindings:',
      '      runtimeAgent:',
      '        path: /src/agent.ts',
      '        symbol: SupportAgent',
      '',
    ].join('\n'),
    path: '/moldea/moldea.yaml',
    type: 'file',
  },
  { content: '# Packed Cloudflare Agents adapter\n', path: '/moldea/project.md', type: 'file' },
  { content: 'Supports customers.\n', path: '/moldea/agents/support/description.md', type: 'file' },
  {
    content: 'You are the `support` agent.\n',
    path: '/moldea/agents/support/instruction.md',
    type: 'file',
  },
  {
    content: '{"dependencies":{"@cloudflare/think":"^0.16.0","agents":"^0.21.0","ai":"^7.0.0"}}\n',
    path: '/package.json',
    type: 'file',
  },
  {
    content: [
      "import { Think } from '@cloudflare/think';",
      'export class SupportAgent extends Think {}',
      '',
    ].join('\n'),
    path: '/src/agent.ts',
    type: 'file',
  },
]);
const result = await createCore({ adapters: [cloudflareAgentsAdapter] }).inspectProject({
  repository,
});

assert.equal(result.valid, true);
assert.deepStrictEqual(result.diagnostics, []);
assert.equal(
  result.evidence.some(({ kind }) => kind === 'agent-definition'),
  true,
);
assert.equal(result.evidence.filter(({ kind }) => kind === 'runtime-package').length, 3);
