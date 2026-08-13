// @vitest-environment node
import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { areHostPathsEquivalent, haveSameHostPathIdentity } from './utilities.js';

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

describe('haveSameHostPathIdentity', () => {
  test('accepts an alias with the same filesystem identity', () => {
    expect(haveSameHostPathIdentity({ dev: 1n, ino: 2n }, { dev: 1n, ino: 2n })).toBe(true);
  });

  test.each([
    [
      { dev: 1n, ino: 2n },
      { dev: 2n, ino: 2n },
    ],
    [
      { dev: 1n, ino: 2n },
      { dev: 1n, ino: 3n },
    ],
    [
      { dev: 0n, ino: 0n },
      { dev: 0n, ino: 0n },
    ],
  ] as const)('rejects a different or unavailable filesystem identity', (left, right) => {
    expect(haveSameHostPathIdentity(left, right)).toBe(false);
  });
});
