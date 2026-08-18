// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { isDarkTheme, parseThemePreference } from './index.js';

describe('website theme utilities', () => {
  test.each([
    ['dark', 'dark'],
    ['light', 'light'],
    ['system', 'system'],
    ['unsupported', 'system'],
    [null, 'system'],
  ] as const)('parseThemePreference(%s) -> %s', (source, expectedPreference) => {
    expect(parseThemePreference(source)).toBe(expectedPreference);
  });

  test.each([
    ['dark', false, true],
    ['dark', true, true],
    ['light', false, false],
    ['light', true, false],
    ['system', false, false],
    ['system', true, true],
  ] as const)('isDarkTheme(%s, %s) -> %s', (preference, doesSystemPreferDark, expectedResult) => {
    expect(isDarkTheme(preference, doesSystemPreferDark)).toBe(expectedResult);
  });
});
