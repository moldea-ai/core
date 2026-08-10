// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { expectToThrowCode } from 'web-utils-kit';

import { RepositoryPathException, RepositorySourceException } from './exceptions.js';
import { createMemoryRepositoryReader, type IMemoryRepositoryEntry } from './memory.js';
import { invalidMemoryDefinitionCases, invalidPathMemoryEntries } from './memory.test-fixtures.js';
import { parseRepositoryPath } from './repository-path.js';

const encoder = new TextEncoder();

describe('createMemoryRepositoryReader', () => {
  test.each(
    invalidMemoryDefinitionCases.map(
      ({ entries, expectedPath, name }) => [name, entries, expectedPath] as const,
    ),
  )(
    'createMemoryRepositoryReader(%s) -> INVALID_SOURCE_DATA with create-reader metadata',
    (_name, entries, expectedPath) => {
      expectToThrowCode(() => createMemoryRepositoryReader(entries), 'INVALID_SOURCE_DATA');

      try {
        createMemoryRepositoryReader(entries);
      } catch (error) {
        expect(error).toBeInstanceOf(RepositorySourceException);
        expect(error).toMatchObject({
          operation: 'create-reader',
          path: parseRepositoryPath(expectedPath),
          retryable: false,
        });
        return;
      }

      throw new Error('Expected memory reader creation to fail.');
    },
  );

  test('rejects malformed entry paths through the public path exception', () => {
    expectToThrowCode(
      () => createMemoryRepositoryReader(invalidPathMemoryEntries),
      'INVALID_REPOSITORY_PATH',
    );

    try {
      createMemoryRepositoryReader(invalidPathMemoryEntries);
    } catch (error) {
      expect(error).toBeInstanceOf(RepositoryPathException);
      return;
    }

    throw new Error('Expected memory reader creation to fail.');
  });

  test('copies caller-owned byte arrays and entry definitions during construction', async () => {
    const content = new Uint8Array([1, 2, 3]);
    const entry: { content: Uint8Array; path: string; type: 'file' | 'symlink' } = {
      content,
      path: '/bytes.bin',
      type: 'file',
    };
    const entries: readonly IMemoryRepositoryEntry[] = [entry];
    const reader = createMemoryRepositoryReader(entries);

    content[0] = 99;
    entry.path = '/changed.bin';
    entry.type = 'symlink';

    await expect(reader.readFile(parseRepositoryPath('/bytes.bin'))).resolves.toStrictEqual(
      new Uint8Array([1, 2, 3]),
    );
    await expect(reader.getEntry(parseRepositoryPath('/changed.bin'))).resolves.toBeNull();
  });

  test('encodes valid scalar strings as exact UTF-8 bytes', async () => {
    const content = 'café 😀\n';
    const reader = createMemoryRepositoryReader([{ content, path: '/unicode.txt', type: 'file' }]);

    await expect(reader.readFile(parseRepositoryPath('/unicode.txt'))).resolves.toStrictEqual(
      encoder.encode(content),
    );
  });

  test('accepts explicit empty directories while synthesizing missing parents', async () => {
    const reader = createMemoryRepositoryReader([
      { path: '/empty', type: 'directory' },
      { content: 'deep', path: '/a/b/c.txt', type: 'file' },
    ]);

    await expect(reader.getEntry(parseRepositoryPath('/empty'))).resolves.toMatchObject({
      type: 'directory',
    });
    await expect(reader.getEntry(parseRepositoryPath('/a'))).resolves.toMatchObject({
      type: 'directory',
    });
    await expect(reader.getEntry(parseRepositoryPath('/a/b'))).resolves.toMatchObject({
      type: 'directory',
    });
  });

  test('rejects malformed runtime definitions without returning a partial reader', () => {
    expectToThrowCode(() => createMemoryRepositoryReader(null as never), 'INVALID_SOURCE_DATA');
    expectToThrowCode(() => createMemoryRepositoryReader([null] as never), 'INVALID_SOURCE_DATA');
    expectToThrowCode(
      () =>
        createMemoryRepositoryReader([
          { content: 42, path: '/invalid.bin', type: 'file' } as never,
        ]),
      'INVALID_SOURCE_DATA',
    );
  });
});
