// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

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

  test('parses exact manifest bytes supplied by the memory reader', async () => {
    const manifestPath = parseRepositoryPath('/moldea/moldea.yaml');
    const reader = createMemoryRepositoryReader([
      {
        content: new TextEncoder().encode('\ufeffversion: 1\r\n'),
        path: manifestPath,
        type: 'file',
      },
    ]);
    const bytes = await reader.readFile(manifestPath);
    const result = await createCore().parseManifest({ content: bytes, path: manifestPath });

    expect(result).toMatchObject({
      asset: {
        content: 'version: 1\n',
        digest: 'sha256:09bfcc6a14b83e2192b8673677725c84883ee9cd0c70e45c9ec09daa8f2b2847',
      },
      diagnostics: [],
      manifest: { version: 1 },
      valid: true,
    });
  });
});
