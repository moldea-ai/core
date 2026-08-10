// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { expectToThrowCode } from 'web-utils-kit';

import { RepositoryPathException } from './exceptions.js';
import {
  REPOSITORY_ROOT,
  isRepositoryPath,
  parseRepositoryPath,
  type IRepositoryPath,
} from './repository-path.js';

describe('repository logical paths', () => {
  test.each([
    '/',
    '/moldea/moldea.yaml',
    '/packages/contracts/src/customer-support.ts',
    '/Case-Sensitive/File.txt',
    '/café/😀.txt',
    '/café/decomposed.txt',
    '/literal-%2e%2e/value?#.txt',
    '/space allowed/file name.txt',
    '/.txt',
  ])('isRepositoryPath(%s) -> true and preserves the input', (value) => {
    expect(isRepositoryPath(value)).toBe(true);
    expect(parseRepositoryPath(value)).toBe(value);
  });

  test.each([
    null,
    undefined,
    1,
    {},
    '',
    'relative/path',
    '//server/share',
    '///multiple',
    '/trailing/',
    '/empty//segment',
    '/.',
    '/..',
    '/a/./b',
    '/a/../b',
    '/back\\slash',
    'C:/Windows/System32',
    '/C:',
    '/C:relative',
    '/C:/Windows/System32',
    'https://example.com/repository',
    'file:///etc/passwd',
    '/nul\u0000character',
    '/control\u001fcharacter',
    '/delete\u007fcharacter',
    '/high-surrogate-\ud800',
    '/low-surrogate-\udc00',
    '/reversed-\udc00\ud800',
  ])('isRepositoryPath(%o) -> false without throwing', (value) => {
    expect(isRepositoryPath(value)).toBe(false);
    expectToThrowCode(
      () => parseRepositoryPath(value as string),
      'INVALID_REPOSITORY_PATH',
      'repository path is invalid',
    );
  });

  test('exports one branded root constant', () => {
    const root: IRepositoryPath = REPOSITORY_ROOT;

    expect(root).toBe('/');
    expect(isRepositoryPath(root)).toBe(true);
  });

  test('does not normalize canonically equivalent Unicode paths', () => {
    const composed = parseRepositoryPath('/café.txt');
    const decomposed = parseRepositoryPath('/café.txt');

    expect(composed).not.toBe(decomposed);
    expect(composed.normalize('NFD')).toBe(decomposed);
  });

  test('uses a safe generic exception that does not expose rejected input', () => {
    const rejectedValue = '/credential-token-SECRET/../file';

    expectToThrowCode(() => parseRepositoryPath(rejectedValue), 'INVALID_REPOSITORY_PATH');

    try {
      parseRepositoryPath(rejectedValue);
    } catch (error) {
      expect(error).toBeInstanceOf(RepositoryPathException);
      expect(error).toMatchObject({
        message: 'The repository path is invalid.',
        name: 'RepositoryPathException',
      });
      expect(String(error)).not.toContain(rejectedValue);
      expect(JSON.stringify(error)).not.toContain(rejectedValue);
      return;
    }

    throw new Error('Expected path parsing to fail.');
  });
});
