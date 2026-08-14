// @vitest-environment node
import { describe, expect, test } from 'vitest';

import type { IProjectInspectionResult } from '@moldea.ai/core';
import { parseRepositoryPath } from '@moldea.ai/repository';

import { MOLDEA_CLI_GIT_WORKING_TREE_SOURCE } from './constants.js';
import { createMoldeaCliInspectResult, createMoldeaCliValidateResult } from './transformers.js';

describe('createMoldeaCliValidateResult', () => {
  test('retains only source, format version, and diagnostics', () => {
    const diagnostics = Object.freeze([
      Object.freeze({
        code: 'MOLDEA_MANIFEST_MISSING' as const,
        details: Object.freeze({}),
        entity: null,
        message: 'The project manifest is missing.',
        path: parseRepositoryPath('/moldea/moldea.yaml'),
        pointer: null,
        range: null,
        source: 'core' as const,
      }),
    ]);
    const inspection = Object.freeze({
      diagnostics,
      evidence: Object.freeze([
        Object.freeze({
          agentId: null,
          capabilityId: null,
          capabilityKind: null,
          details: Object.freeze({ package: '@example/runtime' }),
          kind: 'runtime-package' as const,
          references: Object.freeze([]),
          runtimeName: 'example-runtime',
          source: 'example',
        }),
      ]),
      formatVersion: 1 as const,
      project: null,
      valid: false,
    }) satisfies IProjectInspectionResult;

    const result = createMoldeaCliValidateResult(inspection);

    expect(result).toStrictEqual({
      diagnostics,
      formatVersion: 1,
      source: MOLDEA_CLI_GIT_WORKING_TREE_SOURCE,
    });
    expect(Object.keys(result)).toStrictEqual(['diagnostics', 'formatVersion', 'source']);
    expect(result.diagnostics).toBe(diagnostics);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.source)).toBe(true);
  });
});

describe('createMoldeaCliInspectResult', () => {
  test('retains the exact complete inspection and freezes its source wrapper', () => {
    const inspection = Object.freeze({
      diagnostics: Object.freeze([
        Object.freeze({
          code: 'MOLDEA_MANIFEST_MISSING' as const,
          details: Object.freeze({}),
          entity: null,
          message: 'The project manifest is missing.',
          path: parseRepositoryPath('/moldea/moldea.yaml'),
          pointer: null,
          range: null,
          source: 'core' as const,
        }),
      ]),
      evidence: Object.freeze([]),
      formatVersion: null,
      project: null,
      valid: false,
    }) satisfies IProjectInspectionResult;

    const result = createMoldeaCliInspectResult(inspection);

    expect(result).toStrictEqual({
      inspection,
      source: MOLDEA_CLI_GIT_WORKING_TREE_SOURCE,
    });
    expect(Object.keys(result)).toStrictEqual(['inspection', 'source']);
    expect(result.inspection).toBe(inspection);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.source)).toBe(true);
  });

  test.each([
    [
      'a valid result without a project',
      Object.freeze({
        diagnostics: Object.freeze([]),
        evidence: Object.freeze([]),
        formatVersion: 1 as const,
        project: null,
        valid: true,
      }),
    ],
    [
      'an invalid result without diagnostics',
      Object.freeze({
        diagnostics: Object.freeze([]),
        evidence: Object.freeze([]),
        formatVersion: null,
        project: null,
        valid: false,
      }),
    ],
  ] satisfies readonly (readonly [string, IProjectInspectionResult])[])(
    'rejects %s',
    (_description, inspection) => {
      expect(() => createMoldeaCliInspectResult(inspection)).toThrow(
        'The Core inspection result is internally inconsistent.',
      );
    },
  );
});
