import { isRepositoryPath, parseRepositoryPath, type IRepositoryPath } from '@moldea.ai/repository';

import type { IRepositoryReference } from '../format/index.js';

const STABLE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const VARIABLE_ID_PATTERN = /^[A-Z][A-Z0-9_]*$/u;
const WINDOWS_RESERVED_ID_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/u;
const LINE_BREAK_CHARACTERS = ['\n', '\r', '\u0085', '\u2028', '\u2029'] as const;
const UNSUPPORTED_GLOB_PATTERN = /[!?[\]{}]/u;

const hasLineBreak = (value: string): boolean => {
  return LINE_BREAK_CHARACTERS.some((lineBreak) => value.includes(lineBreak));
};

/** Determines whether a code point belongs to the Repository Format version 1 whitespace set. */
export const isRepositoryFormatWhitespace = (codePoint: number): boolean => {
  return (
    (codePoint >= 0x0009 && codePoint <= 0x000d) ||
    codePoint === 0x0020 ||
    codePoint === 0x0085 ||
    codePoint === 0x00a0 ||
    codePoint === 0x1680 ||
    (codePoint >= 0x2000 && codePoint <= 0x200a) ||
    codePoint === 0x2028 ||
    codePoint === 0x2029 ||
    codePoint === 0x202f ||
    codePoint === 0x205f ||
    codePoint === 0x3000
  );
};

/** Compares strings by exact Unicode code-point order without locale behavior. */
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

/** Counts Unicode scalar values in valid JavaScript text. */
export const countUnicodeScalars = (value: string): number => {
  const scalars = value[Symbol.iterator]();
  let count = 0;

  while (scalars.next().done !== true) {
    count += 1;
  }

  return count;
};

/** Determines whether a JavaScript string contains only Unicode scalar values. */
export const isUnicodeScalarText = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) {
        return false;
      }

      const nextCodeUnit = value.charCodeAt(index + 1);

      if (nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff) {
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

/** Determines whether a value contains at least one non-whitespace scalar. */
export const hasNonWhitespace = (value: string): boolean => {
  for (const scalar of value) {
    if (!isRepositoryFormatWhitespace(scalar.codePointAt(0) ?? 0)) {
      return true;
    }
  }

  return false;
};

/** Determines whether a value begins or ends with version 1 whitespace. */
export const hasSurroundingWhitespace = (value: string): boolean => {
  const firstCodePoint = value.codePointAt(0);
  const lastCodePoint = value.codePointAt(value.length - 1);

  return (
    (firstCodePoint !== undefined && isRepositoryFormatWhitespace(firstCodePoint)) ||
    (lastCodePoint !== undefined && isRepositoryFormatWhitespace(lastCodePoint))
  );
};

/** Removes only Repository Format version 1 whitespace from both edges. */
export const trimRepositoryFormatWhitespace = (value: string): string => {
  let start = 0;
  let end = value.length;

  while (start < end) {
    const codePoint = value.codePointAt(start);

    if (codePoint === undefined || !isRepositoryFormatWhitespace(codePoint)) {
      break;
    }

    start += codePoint > 0xffff ? 2 : 1;
  }

  while (end > start) {
    const codePoint = value.codePointAt(end - 1);

    if (codePoint === undefined || !isRepositoryFormatWhitespace(codePoint)) {
      break;
    }

    end -= 1;
  }

  return value.slice(start, end);
};

/** Determines whether a string is non-empty and contains no line break. */
export const isNonEmptySingleLine = (value: string): boolean => {
  return value.length > 0 && !hasLineBreak(value);
};

/** Determines whether a value satisfies stable moldea ID syntax. */
export const isStableId = (value: string): boolean => {
  return value.length <= 64 && STABLE_ID_PATTERN.test(value);
};

/** Determines whether an otherwise valid stable ID is filesystem-reserved. */
export const isReservedId = (value: string): boolean => WINDOWS_RESERVED_ID_PATTERN.test(value);

/** Determines whether a value satisfies runtime-variable ID syntax. */
export const isVariableId = (value: string): boolean => {
  return value.length <= 64 && VARIABLE_ID_PATTERN.test(value);
};

/** Determines whether a parsed capability description satisfies version 1 limits. */
export const isCapabilityDescription = (value: string): boolean => {
  const scalarLength = countUnicodeScalars(value);

  return (
    scalarLength >= 1 &&
    scalarLength <= 1_000 &&
    !hasSurroundingWhitespace(value) &&
    !hasLineBreak(value) &&
    !value.includes('\0') &&
    !value.includes('{{') &&
    !value.includes('}}')
  );
};

/** Parses a non-root repository-format logical path without throwing. */
export const parseManifestPath = (value: string): IRepositoryPath | null => {
  return value !== '/' && isRepositoryPath(value) ? parseRepositoryPath(value) : null;
};

/** Determines whether a path is the canonical manifest path. */
export const isCanonicalManifestPath = (path: IRepositoryPath): boolean => {
  return path === '/moldea/moldea.yaml';
};

/** Extracts the stable millisecond ID from one canonical immediate decision path. */
export const parseDecisionIdFromPath = (path: IRepositoryPath): string | null => {
  const match = /^\/moldea\/decisions\/(\d{13})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/u.exec(path);
  const id = match?.[1];
  const slug = match?.[2];

  return id !== undefined && slug !== undefined && isStableId(slug) ? id : null;
};

/** Determines whether a path is an allowed focused-context relationship key. */
export const isContextPath = (path: IRepositoryPath, allowProject: boolean): boolean => {
  if (allowProject && path === '/moldea/project.md') {
    return true;
  }

  return path.startsWith('/moldea/context/') && path.endsWith('.md');
};

/** Determines whether a path has the canonical immediate decision filename shape. */
export const isDecisionPath = (path: IRepositoryPath): boolean => {
  return parseDecisionIdFromPath(path) !== null;
};

/** Determines whether a path is canonical runtime guidance. */
export const isRuntimeGuidancePath = (path: IRepositoryPath): boolean => {
  return path.startsWith('/moldea/runtimes/') && path.endsWith('.md');
};

/** Determines whether a mirror path is outside canonical moldea content. */
export const isMirrorPath = (path: IRepositoryPath): boolean => {
  return path !== '/moldea' && !path.startsWith('/moldea/');
};

/** Determines whether an impact path contains prohibited glob metacharacters. */
export const hasUnsupportedGlobMetacharacter = (value: string): boolean => {
  return UNSUPPORTED_GLOB_PATTERN.test(value);
};

/** Determines whether a string satisfies the version 1 simple-glob grammar. */
export const isSimpleGlob = (value: string): boolean => {
  if (hasUnsupportedGlobMetacharacter(value) || value.includes('***')) {
    return false;
  }

  const segments = value.slice(1).split('/');

  if (segments.some((segment) => segment.includes('**') && segment !== '**')) {
    return false;
  }

  return value.includes('*') && isRepositoryPath(value.replaceAll('*', 'x'));
};

/** Determines whether a repository-reference symbol has the common safe shape. */
export const isRepositorySymbol = (value: string): boolean => {
  return isNonEmptySingleLine(value) && !value.includes('\0');
};

/** Determines whether a canonical moldea reference incorrectly carries a symbol. */
export const isCanonicalMoldeaPath = (path: IRepositoryPath): boolean => {
  return path === '/moldea' || path.startsWith('/moldea/');
};

/** Sorts repository references by path and then optional symbol. */
export const sortRepositoryReferences = (
  references: readonly IRepositoryReference[],
): IRepositoryReference[] => {
  return [...references].sort((left, right) => {
    return (
      compareExactStrings(left.path, right.path) ||
      compareExactStrings(left.symbol ?? '', right.symbol ?? '')
    );
  });
};
