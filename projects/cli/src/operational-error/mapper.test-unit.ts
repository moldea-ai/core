// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { CoreConfigurationException, CoreOperationException } from '@moldea.ai/core';
import {
  parseRepositoryPath,
  RepositoryPathException,
  RepositorySourceException,
} from '@moldea.ai/repository';

import { GitContentTransformUnsupportedException } from '../repository-content-transformation-guard/index.js';

import { mapMoldeaCliOperationalError } from './mapper.js';

describe('mapMoldeaCliOperationalError', () => {
  test('maps the CLI-owned guarded-read marker to its Git error and logical path', () => {
    const path = parseRepositoryPath('/assets/model.bin');
    const mapped = mapMoldeaCliOperationalError(new GitContentTransformUnsupportedException(path));

    expect(mapped).toStrictEqual({
      code: 'GIT_CONTENT_TRANSFORM_UNSUPPORTED',
      details: {},
      message: 'The requested file uses an unsupported Git content transformation.',
      path,
      retryable: false,
      source: 'git',
    });
    expect(Object.isFrozen(mapped)).toBe(true);
  });

  test('preserves the safe common repository-source contract', () => {
    const path = parseRepositoryPath('/moldea/project.md');
    const sourceError = new RepositorySourceException({
      cause: new Error('private provider detail'),
      code: 'ACCESS_DENIED',
      operation: 'read-file',
      path,
      retryable: true,
    });

    sourceError.message = 'Private provider path: /tmp/private';
    const mapped = mapMoldeaCliOperationalError(sourceError);

    expect(mapped).toStrictEqual({
      code: 'ACCESS_DENIED',
      details: {},
      message: 'Access to the repository source was denied.',
      path,
      retryable: true,
      source: 'repository',
    });
    expect(JSON.stringify(mapped)).not.toContain('private provider detail');
  });

  test('maps Core configuration failures with safe non-null metadata', () => {
    const mapped = mapMoldeaCliOperationalError(
      new CoreConfigurationException({
        adapterId: 'openai',
        code: 'INVALID_ADAPTER_DEFINITION',
        operation: 'create-core',
      }),
    );

    expect(mapped).toStrictEqual({
      code: 'INVALID_ADAPTER_DEFINITION',
      details: { adapterId: 'openai', operation: 'create-core' },
      message: 'A runtime adapter definition is invalid.',
      path: null,
      retryable: false,
      source: 'core',
    });
    expect(Object.isFrozen(mapped.details)).toBe(true);
  });

  test('maps Core operation failures with documented retryability and safe metadata', () => {
    const operationError = new CoreOperationException({
      adapterId: 'openai',
      agentId: 'reviewer',
      code: 'ABORTED',
      limit: 'maxEvidence',
      operation: 'validate-adapter',
    });

    operationError.message = 'Private adapter path: /tmp/private';
    const mapped = mapMoldeaCliOperationalError(operationError);

    expect(mapped).toStrictEqual({
      code: 'ABORTED',
      details: {
        adapterId: 'openai',
        agentId: 'reviewer',
        limit: 'maxEvidence',
        operation: 'validate-adapter',
      },
      message: 'The Core operation was aborted.',
      path: null,
      retryable: true,
      source: 'core',
    });
  });

  test('omits a repository exception path that does not satisfy the logical-path contract', () => {
    const sourceError = new RepositorySourceException({
      code: 'SOURCE_UNAVAILABLE',
      operation: 'read-file',
      path: null,
      retryable: false,
    });

    Object.defineProperty(sourceError, 'path', { value: 'C:\\private' });

    expect(mapMoldeaCliOperationalError(sourceError).path).toBeNull();
  });

  test.each([
    new RepositoryPathException({ cause: new Error('rejected path') }),
    new Error('private host path: /tmp/private'),
    Object.freeze({ message: 'private object failure' }),
  ])('maps an unexpected internal failure to the generic CLI contract', (error) => {
    expect(mapMoldeaCliOperationalError(error)).toStrictEqual({
      code: 'INTERNAL_ERROR',
      details: {},
      message: 'The command could not be completed.',
      path: null,
      retryable: false,
      source: 'cli',
    });
  });
});
