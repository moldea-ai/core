import { RepositoryPathException } from './exceptions.js';
import { hasOnlyUnicodeScalarValues } from './unicode.js';

declare const repositoryPathBrand: unique symbol;

export type IRepositoryPath = string & {
  readonly [repositoryPathBrand]: true;
};

const WINDOWS_DRIVE_PREFIX_PATTERN = /^\/[A-Za-z]:/u;

const hasASCIIControlCharacter = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);

    if (codeUnit <= 0x1f || codeUnit === 0x7f) {
      return true;
    }
  }

  return false;
};

/** Determines whether a value is a valid repository-root-absolute logical path. */
export const isRepositoryPath = (value: unknown): value is IRepositoryPath => {
  if (typeof value !== 'string' || !hasOnlyUnicodeScalarValues(value)) {
    return false;
  }

  if (value === '/') {
    return true;
  }

  if (
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.endsWith('/') ||
    value.includes('\\') ||
    hasASCIIControlCharacter(value) ||
    WINDOWS_DRIVE_PREFIX_PATTERN.test(value)
  ) {
    return false;
  }

  const segments = value.slice(1).split('/');

  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
};

/** Parses and brands one repository-root-absolute logical path. */
export const parseRepositoryPath = (value: string): IRepositoryPath => {
  if (!isRepositoryPath(value)) {
    throw new RepositoryPathException();
  }

  return value;
};

export const REPOSITORY_ROOT = parseRepositoryPath('/');
