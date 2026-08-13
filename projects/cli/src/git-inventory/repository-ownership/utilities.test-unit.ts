// @vitest-environment node
import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { areHostPathsEquivalent } from './utilities.js';

describe('areHostPathsEquivalent', () => {
  test('uses Windows case-insensitive path semantics without accepting a different path', () => {
    expect(
      areHostPathsEquivalent(
        String.raw`D:\a\packages\nested-repository`,
        'd:/A/packages/NESTED-REPOSITORY',
        path.win32,
      ),
    ).toBe(true);
    expect(
      areHostPathsEquivalent(
        String.raw`D:\a\packages\nested-repository`,
        String.raw`D:\a\packages\selected-repository`,
        path.win32,
      ),
    ).toBe(false);
  });

  test('preserves POSIX case-sensitive path semantics', () => {
    expect(
      areHostPathsEquivalent('/tmp/nested-repository', '/tmp/NESTED-REPOSITORY', path.posix),
    ).toBe(false);
  });
});
