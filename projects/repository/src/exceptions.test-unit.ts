// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { Exception } from 'error-message-utils';

import { RepositoryPathException, RepositorySourceException } from './exceptions.js';
import { parseRepositoryPath } from './repository-path.js';

describe('repository exceptions', () => {
  test('constructs a path exception through its documented options', () => {
    const cause = new Error('internal cause');
    const exception = new RepositoryPathException({ cause });

    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception).toMatchObject({
      cause,
      code: 'INVALID_REPOSITORY_PATH',
      message: 'The repository path is invalid.',
      name: 'RepositoryPathException',
    });
    expect(Object.keys(exception)).not.toContain('cause');
  });

  test('constructs a source exception with accurate safe public fields', () => {
    const cause = new Error('provider internals');
    const path = parseRepositoryPath('/safe/path.txt');
    const exception = new RepositorySourceException({
      cause,
      code: 'SOURCE_UNAVAILABLE',
      operation: 'read-file',
      path,
      retryable: true,
    });

    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception).toMatchObject({
      cause,
      code: 'SOURCE_UNAVAILABLE',
      message: 'The repository source is unavailable.',
      name: 'RepositorySourceException',
      operation: 'read-file',
      path,
      retryable: true,
    });
    expect(exception.message).not.toContain(path);
    expect(exception.message).not.toContain(cause.message);
    expect(Object.keys(exception)).not.toContain('cause');
  });

  test('supports source-wide reader-creation failures with a null path', () => {
    const exception = new RepositorySourceException({
      code: 'INVALID_SOURCE_DATA',
      operation: 'create-reader',
      path: null,
      retryable: false,
    });

    expect(exception).toMatchObject({
      code: 'INVALID_SOURCE_DATA',
      operation: 'create-reader',
      path: null,
      retryable: false,
    });
  });
});
