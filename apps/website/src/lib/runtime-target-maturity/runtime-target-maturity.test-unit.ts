// @vitest-environment node
import { describe, expect, test } from 'vitest';

import type { IRuntimeCompatibilityMatrix } from '../../../../../scripts/runtime-compatibility/types.ts';

import { parseRuntimeTargetMaturity } from './runtime-target-maturity.ts';

const MATRIX: IRuntimeCompatibilityMatrix = {
  adapters: {
    openai: {
      implementation: {
        distribution: 'public',
        kind: 'package',
        package: '@moldea.ai/adapter-openai',
      },
      implementationStatus: 'available',
      targets: [
        {
          evidenceKinds: ['runtime-package'],
          id: 'typescript-responses-api-7',
          kind: 'package',
          language: 'typescript',
          lastVerifiedAt: '2026-08-21',
        },
      ],
    },
  },
  version: 2,
};

describe('parseRuntimeTargetMaturity', () => {
  test('accepts one website maturity for every technical matrix target', () => {
    expect(
      parseRuntimeTargetMaturity(
        'version: 1\ntargets:\n  openai:\n    typescript-responses-api-7: experimental\n',
        MATRIX,
      ),
    ).toStrictEqual({
      openai: { 'typescript-responses-api-7': 'experimental' },
    });
  });

  test('rejects missing matrix targets', () => {
    expect(() => parseRuntimeTargetMaturity('version: 1\ntargets: {}\n', MATRIX)).toThrow(
      'missing matrix targets: openai/typescript-responses-api-7',
    );
  });

  test('rejects stale maturity targets', () => {
    expect(() =>
      parseRuntimeTargetMaturity(
        'version: 1\ntargets:\n  openai:\n    stale-target: supported\n    typescript-responses-api-7: experimental\n',
        MATRIX,
      ),
    ).toThrow('unknown or stale targets: openai/stale-target');
  });
});
