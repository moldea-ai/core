// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { normalizeOpenAiText } from './index.js';

describe('normalizeOpenAiText', () => {
  test('normalizes a leading BOM and platform line endings', () => {
    const result = normalizeOpenAiText(new TextEncoder().encode('\ufefffirst\r\nsecond\rthird\n'));

    expect(result).toMatchObject({ valid: true, value: 'first\nsecond\nthird\n' });
  });

  test('rejects invalid UTF-8 and NUL', () => {
    expect(normalizeOpenAiText(Uint8Array.from([0xff]))).toStrictEqual({ valid: false });
    expect(normalizeOpenAiText(new TextEncoder().encode('invalid\0text'))).toStrictEqual({
      valid: false,
    });
  });

  test('locates normalized positions with Unicode-scalar offsets', () => {
    const result = normalizeOpenAiText(new TextEncoder().encode('a😀\r\nβ'));

    if (!result.valid) {
      throw new TypeError('The source fixture must be valid.');
    }

    expect(result.locator.locateRange(1, 3)).toStrictEqual({
      end: { column: 3, line: 1, offset: 2 },
      start: { column: 2, line: 1, offset: 1 },
    });
    expect(result.locator.locateRange(4, 5)).toStrictEqual({
      end: { column: 2, line: 2, offset: 4 },
      start: { column: 1, line: 2, offset: 3 },
    });
  });
});
