// @vitest-environment node
import type { IRepositoryEntry } from './contracts.js';
import { describeRepositoryReaderConformance } from './conformance/reader-conformance.test-utilities.js';
import { RepositoryPathException, RepositorySourceException } from './exceptions.js';
import { createMemoryRepositoryReader, type IMemoryRepositoryEntry } from './memory.js';
import { createValidMemoryEntries } from './memory.test-fixtures.js';
import { REPOSITORY_ROOT, parseRepositoryPath } from './repository-path.js';

const expectedEntries: readonly IRepositoryEntry[] = [
  { path: parseRepositoryPath('/Case.txt'), type: 'file' },
  { path: parseRepositoryPath('/README.md'), type: 'file' },
  { path: parseRepositoryPath('/case.txt'), type: 'file' },
  { path: parseRepositoryPath('/empty.bin'), type: 'file' },
  { path: parseRepositoryPath('/link'), type: 'symlink' },
  { path: parseRepositoryPath('/nested'), type: 'directory' },
  { path: parseRepositoryPath('/nested/deep'), type: 'directory' },
  { path: parseRepositoryPath('/nested/deep/data.bin'), type: 'file' },
  { path: parseRepositoryPath('/nested/empty'), type: 'directory' },
  { path: parseRepositoryPath('/unicode'), type: 'directory' },
  { path: parseRepositoryPath('/unicode/café-😀.txt'), type: 'file' },
];

describeRepositoryReaderConformance('in-memory', {
  casePaths: { kind: 'distinct', paths: ['/Case.txt', '/case.txt'] },
  createReader: () => createMemoryRepositoryReader(createValidMemoryEntries()),
  createSnapshotMutationFixture: () => {
    const entries = [...createValidMemoryEntries()];
    const fileEntry = entries.find(
      (entry): entry is Extract<IMemoryRepositoryEntry, { readonly type: 'file' }> =>
        entry.path === '/nested/deep/data.bin' && entry.type === 'file',
    );
    const content = fileEntry?.content;

    if (fileEntry === undefined || content === undefined || typeof content === 'string') {
      throw new Error('The snapshot-mutation fixture file is missing exact byte content.');
    }

    const reader = createMemoryRepositoryReader(entries);

    return {
      behavior: 'preserve-snapshot',
      mutateSource: () => {
        content.fill(99);
        entries.length = 0;
      },
      reader,
    };
  },
  emptyFilePath: '/empty.bin',
  expectedEntries,
  fileBytes: new Uint8Array([0, 1, 13, 10, 128, 255]),
  filePath: '/nested/deep/data.bin',
  isRepositoryPathException: (cause) => cause instanceof RepositoryPathException,
  isRepositorySourceException: (cause) => cause instanceof RepositorySourceException,
  missingPath: '/missing.txt',
  nestedDirectoryPath: '/nested',
  nestedExpectedPaths: ['/nested/deep', '/nested/deep/data.bin', '/nested/empty'],
  parsePath: parseRepositoryPath,
  rootPath: REPOSITORY_ROOT,
  symlinkPath: '/link',
  unicodePath: '/unicode/café-😀.txt',
});
