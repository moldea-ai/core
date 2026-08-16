// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { isDarkTheme, parseThemePreference } from './theme.ts';

describe('theme preference', () => {
  test.each([
    ['light', 'light'],
    ['dark', 'dark'],
    ['system', 'system'],
    [null, 'system'],
    ['unexpected', 'system'],
  ] as const)('parseThemePreference(%s) -> %s', (value, expected) => {
    expect(parseThemePreference(value)).toBe(expected);
  });

  test.each([
    ['light', true, false],
    ['dark', false, true],
    ['system', false, false],
    ['system', true, true],
  ] as const)('isDarkTheme(%s, %s) -> %s', (preference, systemDark, expected) => {
    expect(isDarkTheme(preference, systemDark)).toBe(expected);
  });
});
