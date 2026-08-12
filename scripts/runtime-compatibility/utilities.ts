import { REPOSITORY_FORMAT_LINE_BREAKS, REPOSITORY_FORMAT_WHITESPACE_RANGES } from './constants.ts';

const STABLE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const WINDOWS_RESERVED_ID_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u;

/** Compares strings by exact Unicode code-point order. */
export const compareExactStrings = (left: string, right: string): number => {
  const leftScalars = left[Symbol.iterator]();
  const rightScalars = right[Symbol.iterator]();

  while (true) {
    const leftScalar = leftScalars.next();
    const rightScalar = rightScalars.next();

    if (leftScalar.done === true) {
      return rightScalar.done === true ? 0 : -1;
    }

    if (rightScalar.done === true) {
      return 1;
    }

    const leftCodePoint = leftScalar.value.codePointAt(0) ?? 0;
    const rightCodePoint = rightScalar.value.codePointAt(0) ?? 0;

    if (leftCodePoint !== rightCodePoint) {
      return leftCodePoint < rightCodePoint ? -1 : 1;
    }
  }
};

/** Determines whether a code point belongs to Repository Format version 1 whitespace. */
export const isRepositoryFormatWhitespace = (codePoint: number): boolean => {
  return REPOSITORY_FORMAT_WHITESPACE_RANGES.some(
    ([rangeStart, rangeEnd]) => codePoint >= rangeStart && codePoint <= rangeEnd,
  );
};

/** Determines whether a JavaScript string contains only Unicode scalar values. */
export const isUnicodeScalarText = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);

      if (!(nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff)) {
        return false;
      }

      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }

  return true;
};

/** Determines whether text contains at least one non-whitespace scalar. */
export const hasNonWhitespace = (value: string): boolean => {
  for (const scalar of value) {
    if (!isRepositoryFormatWhitespace(scalar.codePointAt(0) ?? 0)) {
      return true;
    }
  }

  return false;
};

/** Determines whether text contains one of the exact version 1 line breaks. */
export const hasRepositoryFormatLineBreak = (value: string): boolean => {
  for (const scalar of value) {
    if (REPOSITORY_FORMAT_LINE_BREAKS.has(scalar.codePointAt(0) ?? 0)) {
      return true;
    }
  }

  return false;
};

/** Determines whether text begins or ends with version 1 whitespace. */
export const hasSurroundingWhitespace = (value: string): boolean => {
  const firstCodePoint = value.codePointAt(0);
  const scalars = [...value];
  const lastCodePoint = scalars.at(-1)?.codePointAt(0);

  return (
    (firstCodePoint !== undefined && isRepositoryFormatWhitespace(firstCodePoint)) ||
    (lastCodePoint !== undefined && isRepositoryFormatWhitespace(lastCodePoint))
  );
};

/** Determines whether text is non-empty, single-line, scalar-safe, and edge-trimmed. */
export const isStrictSingleLine = (value: string): boolean => {
  return (
    value.length > 0 &&
    hasNonWhitespace(value) &&
    !hasRepositoryFormatLineBreak(value) &&
    !hasSurroundingWhitespace(value) &&
    !value.includes('\0') &&
    isUnicodeScalarText(value)
  );
};

/** Determines whether text is non-empty under version 1 whitespace and excludes NUL. */
export const isStrictText = (value: string): boolean =>
  value.length > 0 &&
  hasNonWhitespace(value) &&
  !value.includes('\0') &&
  isUnicodeScalarText(value);

/** Determines whether text satisfies the stable-ID and reserved-name rules. */
export const isStableId = (value: string): boolean => {
  return (
    value.length >= 1 &&
    value.length <= 64 &&
    STABLE_ID_PATTERN.test(value) &&
    !WINDOWS_RESERVED_ID_PATTERN.test(value)
  );
};

/** Determines whether a value is a valid UTC Gregorian calendar date. */
export const isUtcCalendarDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

/** Determines whether a parsed value is a plain string-keyed record. */
export const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
};
