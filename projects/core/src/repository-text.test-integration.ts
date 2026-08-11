// @vitest-environment node
import { describe, expect, test } from 'vitest';

import {
  parseRepositoryPath,
  RepositorySourceException,
  type IRepositoryReader,
} from '@moldea.ai/repository';
import { createMemoryRepositoryReader } from '@moldea.ai/repository/memory';

import { DEFAULT_CORE_RESOURCE_LIMITS } from './constants.js';
import { readRepositoryTextAsset } from './repository-text.js';

const TEXT_PATH = parseRepositoryPath('/moldea/context/text.md');

describe('Core repository text reads through the memory repository reader', () => {
  test('reads once, normalizes exact bytes, digests content, and freezes the result', async () => {
    const repository = createMemoryRepositoryReader([
      {
        content: new TextEncoder().encode('\ufeffline one\r\nline two\r'),
        path: TEXT_PATH,
        type: 'file',
      },
    ]);
    let readCount = 0;
    const observedRepository: IRepositoryReader = {
      getEntry: (path, options) => repository.getEntry(path, options),
      listEntries: (options) => repository.listEntries(options),
      readFile: (path, options) => {
        readCount += 1;
        return repository.readFile(path, options);
      },
    };

    const result = await readRepositoryTextAsset(
      observedRepository,
      TEXT_PATH,
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(readCount).toBe(1);
    expect(result).toStrictEqual({
      asset: {
        content: 'line one\nline two\n',
        digest: 'sha256:e9024f1a07d29d52ad3aa5e1a18e94db1f3a9fd32b89e39d47c472cd99071e13',
        path: TEXT_PATH,
        scalarLength: 18,
        utf8ByteLength: 18,
      },
      diagnostics: [],
      valid: true,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.asset)).toBe(true);
  });

  test.each([
    [Uint8Array.from([0xff]), 'MOLDEA_TEXT_INVALID_UTF8'],
    [new TextEncoder().encode('before\0after'), 'MOLDEA_TEXT_NUL_FORBIDDEN'],
  ] as const)('returns structural text diagnostics for invalid bytes', async (content, code) => {
    const repository = createMemoryRepositoryReader([{ content, path: TEXT_PATH, type: 'file' }]);
    const result = await readRepositoryTextAsset(
      repository,
      TEXT_PATH,
      DEFAULT_CORE_RESOURCE_LIMITS,
    );

    expect(result).toMatchObject({
      asset: null,
      diagnostics: [{ code, path: TEXT_PATH }],
      valid: false,
    });
  });

  test('rejects reader values that violate the source-neutral byte contract', async () => {
    const repository: IRepositoryReader = {
      getEntry: () => Promise.resolve(null),
      listEntries: () => {
        throw new TypeError('The malformed reader fixture does not support listing.');
      },
      readFile: () => Promise.resolve('not bytes' as never),
    };

    await expect(
      readRepositoryTextAsset(repository, TEXT_PATH, DEFAULT_CORE_RESOURCE_LIMITS),
    ).rejects.toMatchObject({
      code: 'INVALID_SOURCE_DATA',
      operation: 'read-file',
      path: TEXT_PATH,
      retryable: false,
    });
  });

  test('forwards cancellation and preserves source failures', async () => {
    const repository = createMemoryRepositoryReader([
      { content: 'text', path: TEXT_PATH, type: 'file' },
    ]);
    const controller = new AbortController();
    controller.abort(new Error('test cancellation'));

    await expect(
      readRepositoryTextAsset(
        repository,
        TEXT_PATH,
        DEFAULT_CORE_RESOURCE_LIMITS,
        controller.signal,
      ),
    ).rejects.toMatchObject({ code: 'ABORTED', operation: 'read-file', path: TEXT_PATH });

    const sourceFailure = new RepositorySourceException({
      code: 'SOURCE_UNAVAILABLE',
      operation: 'read-file',
      path: TEXT_PATH,
      retryable: false,
    });
    const failingRepository: IRepositoryReader = {
      getEntry: (path, options) => repository.getEntry(path, options),
      listEntries: (options) => repository.listEntries(options),
      readFile: () => Promise.reject(sourceFailure),
    };

    await expect(
      readRepositoryTextAsset(failingRepository, TEXT_PATH, DEFAULT_CORE_RESOURCE_LIMITS),
    ).rejects.toBe(sourceFailure);
  });

  test('enforces the file-byte limit before copying reader bytes', async () => {
    const content = new Uint8Array(5);
    Object.defineProperty(content, 'slice', {
      value: () => {
        throw new TypeError('Reader bytes were copied before enforcing the file-byte limit.');
      },
    });
    const repository: IRepositoryReader = {
      getEntry: () => Promise.resolve(null),
      listEntries: () => {
        throw new TypeError('The resource-limit fixture does not support listing.');
      },
      readFile: () => Promise.resolve(content),
    };

    await expect(
      readRepositoryTextAsset(repository, TEXT_PATH, {
        ...DEFAULT_CORE_RESOURCE_LIMITS,
        maxFileBytes: 4,
      }),
    ).rejects.toMatchObject({
      code: 'RESOURCE_LIMIT_EXCEEDED',
      limit: 'maxFileBytes',
      operation: 'inspect-project',
      retryable: false,
    });
  });
});
