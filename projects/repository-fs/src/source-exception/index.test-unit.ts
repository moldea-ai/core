// @vitest-environment node
import { expectToThrowCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { RepositorySourceException, parseRepositoryPath } from '@moldea.ai/repository';

import {
  getNodeErrorCode,
  throwFilesystemRepositoryCreationException,
  throwIfFilesystemRepositoryCreationAborted,
  throwObservedFilesystemRepositoryCreationError,
} from './index.js';

describe('filesystem repository creation exceptions', () => {
  test('throws the common source contract with safe metadata', () => {
    const logicalPath = parseRepositoryPath('/safe.txt');
    const cause = new Error('/private/host/root/safe.txt');

    expectToThrowCode(
      () => throwFilesystemRepositoryCreationException('ENTRY_NOT_FOUND', true, logicalPath, cause),
      'ENTRY_NOT_FOUND',
      'The requested repository entry was not found.',
    );

    let rejection: unknown;

    try {
      throwFilesystemRepositoryCreationException('ENTRY_NOT_FOUND', true, logicalPath, cause);
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toBeInstanceOf(RepositorySourceException);
    expect(rejection).toMatchObject({
      operation: 'create-reader',
      path: logicalPath,
      retryable: true,
    });
    expect(JSON.stringify(rejection)).not.toContain('/private/host/root');
    expect(Object.keys(rejection as RepositorySourceException)).not.toContain('cause');
  });

  test('throws cancellation only for an aborted signal', () => {
    const activeController = new AbortController();
    const abortedController = new AbortController();

    abortedController.abort('cancel-reader-creation');

    expect(() => throwIfFilesystemRepositoryCreationAborted(activeController.signal)).not.toThrow();
    expectToThrowCode(
      () => throwIfFilesystemRepositoryCreationAborted(abortedController.signal),
      'ABORTED',
      'The repository operation was aborted.',
    );
  });

  test.each([
    [{ code: 'ENOENT' }, 'ENOENT'],
    [{ code: 1 }, undefined],
    [{}, undefined],
    [null, undefined],
  ])('getNodeErrorCode(%o) -> %s', (cause, expectedCode) => {
    expect(getNodeErrorCode(cause)).toBe(expectedCode);
  });

  test('does not trust hostile error-code access', () => {
    const cause = new Proxy(
      {},
      {
        has: () => {
          throw new Error('unsafe error-code access');
        },
      },
    );

    expect(getNodeErrorCode(cause)).toBeUndefined();
  });

  test.each([
    ['ENOENT', 'SNAPSHOT_CHANGED', 'The repository snapshot changed during the operation.'],
    ['ENOTDIR', 'SNAPSHOT_CHANGED', 'The repository snapshot changed during the operation.'],
    ['EACCES', 'ACCESS_DENIED', 'Access to the repository source was denied.'],
    ['EPERM', 'ACCESS_DENIED', 'Access to the repository source was denied.'],
    ['EIO', 'SOURCE_UNAVAILABLE', 'The repository source is unavailable.'],
  ])('maps observed Node.js error %s to %s', (nodeErrorCode, expectedCode, expectedMessage) => {
    const logicalPath = parseRepositoryPath('/observed.txt');
    const cause = Object.assign(new Error('/private/host/root/observed.txt'), {
      code: nodeErrorCode,
    });

    expectToThrowCode(
      () => throwObservedFilesystemRepositoryCreationError(cause, logicalPath),
      expectedCode,
      expectedMessage,
    );

    let rejection: unknown;

    try {
      throwObservedFilesystemRepositoryCreationError(cause, logicalPath);
    } catch (error) {
      rejection = error;
    }

    expect(rejection).toMatchObject({
      operation: 'create-reader',
      path: logicalPath,
      retryable: true,
    });
    expect(JSON.stringify(rejection)).not.toContain('/private/host/root');
  });
});
