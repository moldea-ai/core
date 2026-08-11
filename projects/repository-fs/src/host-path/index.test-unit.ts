// @vitest-environment node
import path from 'node:path';
import { describe, expect, test } from 'vitest';

import { hasOnlyUnicodeScalarValues, isAbsoluteHostRootDirectory } from './index.js';

describe('host root path validation', () => {
  test.each([
    ['', true],
    ['plain text', true],
    ['emoji 🚀', true],
    ['\ud800', false],
    ['\udc00', false],
    ['before\ud800after', false],
  ])('hasOnlyUnicodeScalarValues(%s) -> %s', (text, expectedResult) => {
    expect(hasOnlyUnicodeScalarValues(text)).toBe(expectedResult);
  });

  test('accepts one absolute scalar host path for the active platform', () => {
    expect(isAbsoluteHostRootDirectory(path.resolve('repository-root-🚀'))).toBe(true);
  });

  test.each([
    ['', false],
    ['relative/path', false],
    ['relative\0path', false],
    ['\ud800', false],
    [null, false],
    [[], false],
  ])('isAbsoluteHostRootDirectory(%o) -> %s', (candidate, expectedResult) => {
    expect(isAbsoluteHostRootDirectory(candidate)).toBe(expectedResult);
  });
});
