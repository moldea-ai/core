// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

import { executeMoldeaCliCoreInspection } from './executor.js';

describe('CLI Core composition with the memory repository reader', () => {
  test('inspects a valid custom-agent project without a package-backed adapter', async () => {
    const reader = createMemoryRepositoryReader([
      {
        content: 'version: 1\nagents:\n  alpha:\n    runtime:\n      id: custom\n',
        path: '/moldea/moldea.yaml',
        type: 'file',
      },
      { content: '# Project\n', path: '/moldea/project.md', type: 'file' },
      {
        content: 'Alpha agent.\n',
        path: '/moldea/agents/alpha/description.md',
        type: 'file',
      },
      {
        content: 'You are the `alpha` agent.\n',
        path: '/moldea/agents/alpha/instruction.md',
        type: 'file',
      },
    ]);

    const result = await executeMoldeaCliCoreInspection({
      repository: reader,
      resourceLimits: {
        maxDiagnostics: 32,
        maxEntries: 128,
        maxEvidence: 16,
        maxFileBytes: 4096,
        maxManifestBytes: 2048,
        maxTotalBytes: 8192,
      },
    });

    expect(result).toMatchObject({
      diagnostics: [],
      evidence: [],
      formatVersion: 1,
      project: {
        agents: [{ id: 'alpha' }],
      },
      valid: true,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });
});
