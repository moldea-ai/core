// @vitest-environment node
import { Exception } from 'error-message-utils';
import { describe, expect, test } from 'vitest';

import { CoreConfigurationException, CoreOperationException } from './index.js';

describe('Core exceptions', () => {
  test('constructs a configuration exception with safe documented fields', () => {
    const cause = new Error('private adapter state');
    const exception = new CoreConfigurationException({
      adapterId: 'eve',
      cause,
      code: 'INVALID_ADAPTER_DEFINITION',
      operation: 'create-core',
    });

    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toBeInstanceOf(Error);
    expect(exception).toMatchObject({
      adapterId: 'eve',
      cause,
      code: 'INVALID_ADAPTER_DEFINITION',
      message: 'A framework adapter definition is invalid.',
      name: 'CoreConfigurationException',
      operation: 'create-core',
    });
    expect(exception.message).not.toContain(cause.message);
    expect(Object.keys(exception)).not.toContain('cause');
  });

  test('constructs an operation exception with nullable metadata', () => {
    const exception = new CoreOperationException({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxFileBytes',
      operation: 'normalize-text',
      retryable: false,
    });

    expect(exception).toBeInstanceOf(Exception);
    expect(exception).toMatchObject({
      adapterId: null,
      agentId: null,
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxFileBytes',
      message: 'A Core resource limit was exceeded.',
      name: 'CoreOperationException',
      operation: 'normalize-text',
      retryable: false,
    });
  });
});
