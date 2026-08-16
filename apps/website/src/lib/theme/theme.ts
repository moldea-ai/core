// persisted theme values accepted by the website
export type IThemePreference = 'dark' | 'light' | 'system';

/** Parses unknown persisted storage into the stable theme preference contract. */
export const parseThemePreference = (value: unknown): IThemePreference => {
  return value === 'dark' || value === 'light' || value === 'system' ? value : 'system';
};

/** Resolves a persisted preference against the current operating-system preference. */
export const isDarkTheme = (preference: IThemePreference, doesSystemPreferDark: boolean): boolean =>
  preference === 'dark' || (preference === 'system' && doesSystemPreferDark);
