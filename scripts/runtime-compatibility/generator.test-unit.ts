// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'vitest';

import {
  RUNTIME_COMPATIBILITY_DOCUMENT_PATH,
  RUNTIME_COMPATIBILITY_SOURCE_PATH,
} from './constants.ts';
import { generateRuntimeCompatibilityMarkdown } from './generator.ts';
import type { IRuntimeCompatibilityMatrix } from './types.ts';
import { parseRuntimeCompatibilityMatrix } from './validations.ts';

const repositoryRoot = new URL('../../', import.meta.url);

describe('runtime compatibility Markdown generation', () => {
  test('matches the committed golden presentation exactly', async () => {
    const [source, committedDocument] = await Promise.all([
      readFile(new URL(RUNTIME_COMPATIBILITY_SOURCE_PATH, repositoryRoot), 'utf8'),
      readFile(new URL(RUNTIME_COMPATIBILITY_DOCUMENT_PATH, repositoryRoot), 'utf8'),
    ]);
    const result = parseRuntimeCompatibilityMatrix(source);

    expect(result.valid).toBe(true);
    if (result.valid) {
      await expect(generateRuntimeCompatibilityMarkdown(result.matrix)).resolves.toBe(
        committedDocument,
      );
    }
  });

  test('renders every technical target support section without inference', async () => {
    const matrix: IRuntimeCompatibilityMatrix = {
      adapters: {
        openai: {
          compatibleCoreRange: '^1.0.0',
          implementation: {
            distribution: 'public',
            kind: 'package',
            package: '@moldea.ai/adapter-openai',
            versionRange: '>=1.0.0 <2.0.0 || >=3.0.0 <4.0.0',
          },
          implementationStatus: 'available',
          lastVerifiedAt: '2026-08-12',
          notes: 'The adapter-wide compatibility note.',
          runtimeGuidance: {
            expectation: 'recommended',
            notes: 'Project-local guidance improves customized runtime interpretation.',
          },
          supportedRepositoryFormatVersions: [1],
          targets: [
            {
              bindingSupport: {
                'runtime-agent': { relationship: 'full', symbol: 'partial' },
              },
              evidenceKinds: ['runtime-package'],
              id: 'typescript',
              kind: 'package',
              knownLimitations: ['Generated registrations are not resolved.'],
              language: 'typescript',
              lastVerifiedAt: '2026-08-12',
              packages: [
                {
                  ecosystem: 'npm',
                  name: 'openai',
                  role: 'primary',
                  versionRange: '>=4.0.0 <5.0.0 || >=6.0.0 <7.0.0',
                },
              ],
              patterns: [
                {
                  description: 'Direct client construction.',
                  id: 'direct-client',
                  kind: 'runtime',
                  support: 'partial',
                },
              ],
              providerLimits: [
                {
                  description: 'Allowed tool-name pattern.',
                  id: 'tool-name-pattern',
                  kind: 'pattern',
                  subject: 'tool-name',
                  value: '^(safe|stable)$',
                },
              ],
              qualificationEvidence: {
                url: 'https://skill.moldea.ai/qualification/openai/typescript/',
              },
            },
          ],
        },
      },
      version: 2,
    };
    const markdown = await generateRuntimeCompatibilityMarkdown(matrix);

    expect(markdown).toContain('#### Binding support');
    expect(markdown).toContain('#### Patterns');
    expect(markdown).toContain('#### Provider limits');
    expect(markdown).toContain('#### Known limitations');
    expect(markdown).toContain(
      '[View profile and results](https://skill.moldea.ai/qualification/openai/typescript/)',
    );
    expect(markdown).toContain('`>=1.0.0 <2.0.0 \\|\\| >=3.0.0 <4.0.0`');
    expect(markdown).toContain('`>=4.0.0 <5.0.0 \\|\\| >=6.0.0 <7.0.0`');
    expect(markdown).toContain('`^(safe\\|stable)$`');
    expect(markdown).not.toContain('Support level:');
  });
});
