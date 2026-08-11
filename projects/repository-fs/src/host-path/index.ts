import path from 'node:path';

/**
 * Determines whether text contains only Unicode scalar values.
 * @param text The host path text to inspect.
 * @returns Whether the text contains no unpaired UTF-16 surrogate.
 */
export const hasOnlyUnicodeScalarValues = (text: string): boolean => {
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= text.length) {
        return false;
      }

      const trailingCodeUnit = text.charCodeAt(index + 1);

      if (trailingCodeUnit < 0xdc00 || trailingCodeUnit > 0xdfff) {
        return false;
      }

      index += 1;
      continue;
    }

    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }

  return true;
};

/**
 * Determines whether a value is one valid absolute host root path for the active platform.
 * @param candidate The boundary value to inspect without coercion.
 * @returns Whether the value is non-empty scalar text, contains no NUL, and is absolute.
 */
export const isAbsoluteHostRootDirectory = (candidate: unknown): candidate is string => {
  return (
    typeof candidate === 'string' &&
    candidate.length > 0 &&
    !candidate.includes('\0') &&
    hasOnlyUnicodeScalarValues(candidate) &&
    path.isAbsolute(candidate)
  );
};
