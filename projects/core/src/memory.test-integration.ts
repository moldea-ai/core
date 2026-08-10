// @vitest-environment node
import { readFileSync } from 'node:fs';

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

  test('parses exact decision fixture bytes supplied by the memory reader', async () => {
    const decisionPath = parseRepositoryPath('/moldea/decisions/1786131723456-use-postgresql.md');
    const fixtureBytes = readFileSync(
      new URL('../../../fixtures/core/decision/1786131723456-use-postgresql.md', import.meta.url),
    );
    const reader = createMemoryRepositoryReader([
      {
        content: fixtureBytes,
        path: decisionPath,
        type: 'file',
      },
    ]);
    const bytes = await reader.readFile(decisionPath);
    const result = await createCore().parseDecision({ content: bytes, path: decisionPath });

    expect(result).toMatchObject({
      decision: {
        asset: {
          content: new TextDecoder().decode(fixtureBytes),
          digest: 'sha256:cd0a78b8f51833e8004b6b9ab5a257c5019ad32ce8568a85d8bf00f0496312a8',
        },
        body: '\n# Use PostgreSQL\n\nUse PostgreSQL for durable project state.\n',
        createdAt: '2026-08-07T19:42:03.456Z',
        id: '1786131723456',
        supersedes: ['1784000000000', '1785000000000'],
      },
      diagnostics: [],
      valid: true,
    });
  });
});
