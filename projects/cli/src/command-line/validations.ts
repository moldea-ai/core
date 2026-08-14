import type { IMoldeaCliResourceLimits } from './types.js';

const POSITIVE_INTEGER_PATTERN = /^\d+$/u;

/**
 * Determines whether text contains only Unicode scalar values.
 * @param text The text to validate.
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
 * Parses one strict base-10 positive safe integer option value.
 * @param input The untrusted command-line token.
 * @returns The parsed integer, or null when the token is invalid.
 */
export const parsePositiveSafeInteger = (input: string): number | null => {
  if (!POSITIVE_INTEGER_PATTERN.test(input)) {
    return null;
  }

  const parsedInteger = Number(input);

  return Number.isSafeInteger(parsedInteger) && parsedInteger > 0 ? parsedInteger : null;
};

/**
 * Validates the cross-limit ordering required by the CLI composition.
 * @param limits The effective resource limits.
 * @returns Whether manifest, file, and total byte limits are consistently ordered.
 */
export const areMoldeaCliResourceLimitsConsistent = (limits: IMoldeaCliResourceLimits): boolean => {
  return (
    limits.maxManifestBytes <= limits.maxFileBytes && limits.maxFileBytes <= limits.maxTotalBytes
  );
};

/**
 * Determines whether one repository option is safe scalar host-path text.
 * @param input The untrusted command-line token.
 * @returns Whether the token is non-empty scalar text without NUL.
 */
export const isRepositoryDirectoryInputValid = (input: string): boolean => {
  return input.length > 0 && !input.includes('\0') && hasOnlyUnicodeScalarValues(input);
};
