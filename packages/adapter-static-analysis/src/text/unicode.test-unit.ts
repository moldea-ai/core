// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { getUnicodeScalarLength } from './unicode.js';

describe('getUnicodeScalarLength', () => {
  test.each([
    ['', 0],
    ['weather', 7],
    ['🌤️', 2],
    [String.fromCharCode(0xd800), null],
    [String.fromCharCode(0xdc00), null],
    [`a${String.fromCharCode(0xd800)}b`, null],
  ])('getUnicodeScalarLength(%o) -> %s', (text, expectedLength) => {
    expect(getUnicodeScalarLength(text)).toBe(expectedLength);
  });
});
