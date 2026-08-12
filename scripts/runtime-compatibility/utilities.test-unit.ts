// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  compareExactStrings,
  hasRepositoryFormatLineBreak,
  isRepositoryFormatWhitespace,
  isStrictSingleLine,
} from './utilities.ts';

describe('runtime compatibility utilities', () => {
  test.each([
    [0x0009, true],
    [0x000b, true],
    [0x000c, true],
    [0x0085, true],
    [0x2007, true],
    [0x2028, true],
    [0x3000, true],
    [0x180e, false],
    [0xfeff, false],
  ])('isRepositoryFormatWhitespace(%d) -> %s', (codePoint, expected) => {
    expect(isRepositoryFormatWhitespace(codePoint)).toBe(expected);
  });

  test.each([
    ['line\nfeed', true],
    ['carriage\rreturn', true],
    ['next\u0085line', true],
    ['line\u2028separator', true],
    ['paragraph\u2029separator', true],
    ['vertical\u000btab', false],
    ['form\u000cfeed', false],
  ])('hasRepositoryFormatLineBreak(%s) -> %s', (value, expected) => {
    expect(hasRepositoryFormatLineBreak(value)).toBe(expected);
  });

  test('validates edges with the exact whitespace set', () => {
    expect(isStrictSingleLine('\ufeffvalue\ufeff')).toBe(true);
    expect(isStrictSingleLine('\u2000value')).toBe(false);
    expect(isStrictSingleLine('value\u3000')).toBe(false);
    expect(isStrictSingleLine('value\u000bvalue')).toBe(true);
  });

  test('compares integer-like and astral strings by exact code point', () => {
    expect(['10', '2', '😀', 'a'].sort(compareExactStrings)).toStrictEqual(['10', '2', 'a', '😀']);
  });
});
