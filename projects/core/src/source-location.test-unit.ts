// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { createSourceLocator } from './source-location.js';

describe('Core source locations', () => {
  test('converts parser UTF-16 offsets into scalar-based positions', () => {
    const locator = createSourceLocator('a😀\nb');

    expect(locator.locateRange(1, 3)).toStrictEqual({
      end: { column: 3, line: 1, offset: 2 },
      start: { column: 2, line: 1, offset: 1 },
    });
    expect(locator.locateRange(4, 5)).toStrictEqual({
      end: { column: 2, line: 2, offset: 4 },
      start: { column: 1, line: 2, offset: 3 },
    });
  });

  test('clamps parser offsets to the normalized document boundaries', () => {
    const locator = createSourceLocator('value');

    expect(locator.locateRange(-1, 100)).toStrictEqual({
      end: { column: 6, line: 1, offset: 5 },
      start: { column: 1, line: 1, offset: 0 },
    });
  });
});
