// @vitest-environment node
import { parseRepositoryPath } from '@moldea.ai/repository';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';
import { describe, expect, test } from 'vitest';

import { createCore } from './index.js';

describe('Core with the immutable memory repository reader', () => {
  test('normalizes and digests exact bytes read from a repository-level fixture', async () => {
    const projectPath = parseRepositoryPath('/moldea/project.md');
    const reader = createMemoryRepositoryReader([
      {
        content: new TextEncoder().encode('\ufeffProject context\r\n'),
        path: projectPath,
        type: 'file',
      },
    ]);
    const bytes = await reader.readFile(projectPath);
    const core = createCore();

    expect(core.normalizeText({ content: bytes, path: projectPath })).toMatchObject({
      diagnostics: [],
      text: { value: 'Project context\n' },
      valid: true,
    });
    const digested = await core.calculateContentDigest({ content: bytes, path: projectPath });

    expect(digested).toMatchObject({
      text: { value: 'Project context\n' },
      valid: true,
    });
    expect(digested.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });
});
