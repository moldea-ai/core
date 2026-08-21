// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { normalizeRuntimeCompatibilityMatrix } from './transformers.ts';
import type { IRuntimeCompatibilityMatrix } from './types.ts';

describe('runtime compatibility normalization', () => {
  test('normalizes every unordered collection without mutating input', () => {
    const matrix: IRuntimeCompatibilityMatrix = {
      adapters: {
        openai: {
          compatibleCoreRange: '^1.0.0',
          implementation: {
            distribution: 'public',
            kind: 'package',
            package: '@moldea.ai/adapter-openai',
            versionRange: '^1.0.0',
          },
          implementationStatus: 'available',
          lastVerifiedAt: '2026-08-12',
          runtimeGuidance: { expectation: 'optional' },
          supportedRepositoryFormatVersions: [2, 1],
          targets: [
            {
              evidenceKinds: ['runtime-pattern', 'language'],
              id: 'typescript',
              kind: 'package',
              knownLimitations: ['zeta', 'alpha'],
              language: 'typescript',
              lastVerifiedAt: '2026-08-12',
              packages: [
                {
                  ecosystem: 'npm',
                  name: 'z-companion',
                  role: 'companion',
                  versionRange: '^1.0.0',
                },
                {
                  ecosystem: 'npm',
                  name: 'a-companion',
                  role: 'companion',
                  versionRange: '^1.0.0',
                },
                {
                  ecosystem: 'npm',
                  name: 'openai',
                  role: 'primary',
                  versionRange: '^4.0.0',
                },
              ],
              patterns: [
                {
                  description: 'Runtime pattern.',
                  id: 'zeta',
                  kind: 'runtime',
                  support: 'partial',
                },
                {
                  description: 'Agent pattern.',
                  id: 'alpha',
                  kind: 'agent',
                  support: 'full',
                },
              ],
              providerLimits: [
                {
                  description: 'Allowed names.',
                  id: 'names',
                  kind: 'allowed-values',
                  subject: 'tool-name',
                  value: ['zeta', 'alpha'],
                },
              ],
              qualificationEvidence: {
                url: 'https://skill.moldea.ai/qualification/openai/typescript/',
              },
              supportLevel: 'supported',
            },
          ],
        },
      },
      version: 1,
    };

    const normalized = normalizeRuntimeCompatibilityMatrix(matrix);

    expect(normalized.adapters['openai']?.supportedRepositoryFormatVersions).toStrictEqual([1, 2]);
    expect(normalized.adapters['openai']?.targets?.[0]?.evidenceKinds).toStrictEqual([
      'language',
      'runtime-pattern',
    ]);
    expect(
      normalized.adapters['openai']?.targets?.[0]?.packages?.map(({ name }) => name),
    ).toStrictEqual(['a-companion', 'z-companion', 'openai']);
    expect(
      normalized.adapters['openai']?.targets?.[0]?.patterns?.map(({ id }) => id),
    ).toStrictEqual(['alpha', 'zeta']);
    expect(normalized.adapters['openai']?.targets?.[0]?.providerLimits?.[0]?.value).toStrictEqual([
      'alpha',
      'zeta',
    ]);
    expect(normalized.adapters['openai']?.targets?.[0]?.qualificationEvidence).toStrictEqual({
      url: 'https://skill.moldea.ai/qualification/openai/typescript/',
    });
    expect(normalized.adapters['openai']?.targets?.[0]?.qualificationEvidence).not.toBe(
      matrix.adapters['openai']?.targets?.[0]?.qualificationEvidence,
    );
    expect(matrix.adapters['openai']?.supportedRepositoryFormatVersions).toStrictEqual([2, 1]);
  });
});
