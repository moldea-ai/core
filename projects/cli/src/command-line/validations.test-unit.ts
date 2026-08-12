// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  areMoldeaCliResourceLimitsConsistent,
  hasOnlyUnicodeScalarValues,
  isRepositoryDirectoryInputValid,
  parsePositiveSafeInteger,
} from './validations.js';

describe('command-line validations', () => {
  test.each([
    ['1', 1],
    ['0001', 1],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
    ['0', null],
    ['-1', null],
    ['+1', null],
    ['1.0', null],
    ['1e3', null],
    ['1_000', null],
    [' 1', null],
    ['9007199254740992', null],
    ['', null],
  ])('parsePositiveSafeInteger(%s) -> %s', (input, expectedResult) => {
    expect(parsePositiveSafeInteger(input)).toBe(expectedResult);
  });

  test.each([
    ['', true],
    ['plain text', true],
    ['emoji 🚀', true],
    ['\ud800', false],
    ['\udc00', false],
    ['before\ud800after', false],
  ])('hasOnlyUnicodeScalarValues(%s) -> %s', (input, expectedResult) => {
    expect(hasOnlyUnicodeScalarValues(input)).toBe(expectedResult);
  });

  test.each([
    ['.', true],
    ['relative/path', true],
    ['/absolute/path', true],
    ['', false],
    ['before\0after', false],
    ['\ud800', false],
  ])('isRepositoryDirectoryInputValid(%s) -> %s', (input, expectedResult) => {
    expect(isRepositoryDirectoryInputValid(input)).toBe(expectedResult);
  });

  test('accepts equal and increasing byte limits', () => {
    expect(
      areMoldeaCliResourceLimitsConsistent({
        maxDiagnostics: 1,
        maxEntries: 1,
        maxEvidence: 1,
        maxFileBytes: 8,
        maxManifestBytes: 4,
        maxTotalBytes: 16,
      }),
    ).toBe(true);
    expect(
      areMoldeaCliResourceLimitsConsistent({
        maxDiagnostics: 1,
        maxEntries: 1,
        maxEvidence: 1,
        maxFileBytes: 8,
        maxManifestBytes: 8,
        maxTotalBytes: 8,
      }),
    ).toBe(true);
  });

  test('rejects either inconsistent byte-limit relationship', () => {
    expect(
      areMoldeaCliResourceLimitsConsistent({
        maxDiagnostics: 1,
        maxEntries: 1,
        maxEvidence: 1,
        maxFileBytes: 8,
        maxManifestBytes: 9,
        maxTotalBytes: 16,
      }),
    ).toBe(false);
    expect(
      areMoldeaCliResourceLimitsConsistent({
        maxDiagnostics: 1,
        maxEntries: 1,
        maxEvidence: 1,
        maxFileBytes: 17,
        maxManifestBytes: 8,
        maxTotalBytes: 16,
      }),
    ).toBe(false);
  });
});
