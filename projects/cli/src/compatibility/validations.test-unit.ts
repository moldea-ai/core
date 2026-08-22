// @vitest-environment node
import { describe, expect, test } from 'vitest';

import type { IMoldeaCliCompatibilityStateInput } from './types.js';
import { isMoldeaCliCompatibilityStateValid } from './validations.js';
import {
  createTestCompatibilityState,
  createTestRuntimeAdapter,
} from './compatibility.test-fixtures.js';

describe('isMoldeaCliCompatibilityStateValid', () => {
  test('accepts the exact installed and executable composition', () => {
    expect(isMoldeaCliCompatibilityStateValid(createTestCompatibilityState())).toBe(true);
  });

  test.each([
    [
      'missing dependency metadata',
      (state: IMoldeaCliCompatibilityStateInput): IMoldeaCliCompatibilityStateInput => ({
        ...state,
        packageMetadata: { ...state.packageMetadata, dependencies: null },
      }),
    ],
    [
      'an invalid Node.js range',
      (state: IMoldeaCliCompatibilityStateInput): IMoldeaCliCompatibilityStateInput => ({
        ...state,
        packageMetadata: { ...state.packageMetadata, supportedNodeRange: 'invalid' },
      }),
    ],
    [
      'an invalid Git version',
      (state: IMoldeaCliCompatibilityStateInput): IMoldeaCliCompatibilityStateInput => ({
        ...state,
        minimumGitVersion: 'invalid',
      }),
    ],
    [
      'an invalid JSON schema version',
      (state: IMoldeaCliCompatibilityStateInput): IMoldeaCliCompatibilityStateInput => ({
        ...state,
        outputSchemaVersion: 1 as 2,
      }),
    ],
  ])('rejects %s', (_description, mutate) => {
    expect(isMoldeaCliCompatibilityStateValid(mutate(createTestCompatibilityState()))).toBe(false);
  });

  test('requires the exact foundational and active-adapter dependency set', () => {
    const state = createTestCompatibilityState();
    const dependencies = { ...(state.packageMetadata.dependencies ?? {}) };
    delete dependencies['@moldea.ai/adapter-openai'];

    expect(
      isMoldeaCliCompatibilityStateValid({
        ...state,
        packageMetadata: { ...state.packageMetadata, dependencies },
      }),
    ).toBe(false);
  });

  test('requires declared and resolved package versions to match exactly', () => {
    const state = createTestCompatibilityState();

    expect(
      isMoldeaCliCompatibilityStateValid({
        ...state,
        packageMetadata: {
          ...state.packageMetadata,
          installedPackageVersions: {
            ...(state.packageMetadata.installedPackageVersions ?? {}),
            '@moldea.ai/core': '9.0.0',
          },
        },
      }),
    ).toBe(false);
  });

  test.each([
    ['duplicate IDs', [createTestRuntimeAdapter('openai'), createTestRuntimeAdapter('openai')]],
    ['the built-in custom ID', [createTestRuntimeAdapter('custom')]],
    ['an invalid ID', [createTestRuntimeAdapter('OpenAI')]],
    ['an unsupported format', [createTestRuntimeAdapter('openai', [2 as 1])]],
  ])('rejects active adapters with %s', (_description, activeAdapters) => {
    const state = createTestCompatibilityState();

    expect(isMoldeaCliCompatibilityStateValid({ ...state, activeAdapters })).toBe(false);
  });

  test('treats active adapter order as semantically irrelevant', () => {
    const state = createTestCompatibilityState();

    expect(
      isMoldeaCliCompatibilityStateValid({
        ...state,
        activeAdapters: [...state.activeAdapters].reverse(),
      }),
    ).toBe(true);
  });
});
