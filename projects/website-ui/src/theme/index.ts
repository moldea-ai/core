// persisted website theme choices
export type IThemePreference = 'dark' | 'light' | 'system';

/**
 * Normalizes an unknown persisted preference to a supported theme choice.
 * @param value Persisted storage value.
 * @returns A supported explicit or system preference.
 */
export const parseThemePreference = (value: unknown): IThemePreference =>
  value === 'dark' || value === 'light' || value === 'system' ? value : 'system';

/**
 * Resolves whether the effective theme should be dark.
 * @param preference Explicit or system theme preference.
 * @param doesSystemPreferDark Current operating-system preference.
 * @returns Whether the effective website theme is dark.
 */
export const isDarkTheme = (preference: IThemePreference, doesSystemPreferDark: boolean): boolean =>
  preference === 'dark' || (preference === 'system' && doesSystemPreferDark);
