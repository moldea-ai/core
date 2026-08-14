// @vitest-environment node
import { expectToThrowCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { parseRepositoryPath } from '@moldea.ai/repository';

import { classifyFilesystemEntry } from './index.js';

const logicalPath = parseRepositoryPath('/entry');

const createStatistics = (
  entryType: 'directory' | 'file' | 'symlink' | 'unsupported',
): {
  isDirectory(): boolean;
  isFile(): boolean;
  isSymbolicLink(): boolean;
} => ({
  isDirectory: () => entryType === 'directory',
  isFile: () => entryType === 'file',
  isSymbolicLink: () => entryType === 'symlink',
});

describe('filesystem entry classification', () => {
  test.each([
    ['file', 'file'],
    ['directory', 'directory'],
    ['symlink', 'symlink'],
  ] as const)('classifyFilesystemEntry(%s) -> %s', (sourceType, expectedType) => {
    expect(classifyFilesystemEntry(createStatistics(sourceType), logicalPath)).toBe(expectedType);
  });

  test('rejects unsupported entry types through the common source contract', () => {
    expectToThrowCode(
      () => classifyFilesystemEntry(createStatistics('unsupported'), logicalPath),
      'INVALID_SOURCE_DATA',
      'The repository source returned invalid data.',
    );

    expect(() => classifyFilesystemEntry(createStatistics('unsupported'), logicalPath)).toThrow(
      expect.objectContaining({ path: logicalPath, retryable: false }),
    );
  });
});
