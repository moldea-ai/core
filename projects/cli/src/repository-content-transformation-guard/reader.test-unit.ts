// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import {
  REPOSITORY_ROOT,
  RepositorySourceException,
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryReader,
} from '@moldea.ai/repository';

import { GitContentTransformUnsupportedException } from './exception.js';
import { createGitContentTransformationGuardRepositoryReader } from './reader.js';

const DIRECTORY_PATH = parseRepositoryPath('/directory');
const GUARDED_PATH = parseRepositoryPath('/guarded.txt');
const MISSING_PATH = parseRepositoryPath('/missing.txt');
const ORDINARY_PATH = parseRepositoryPath('/ordinary.txt');
const SYMLINK_PATH = parseRepositoryPath('/link');

interface IReaderFixture {
  readonly getEntry: ReturnType<typeof vi.fn<IRepositoryReader['getEntry']>>;
  readonly listEntries: ReturnType<typeof vi.fn<IRepositoryReader['listEntries']>>;
  readonly readFile: ReturnType<typeof vi.fn<IRepositoryReader['readFile']>>;
  readonly reader: IRepositoryReader;
}

/** Creates one observable repository reader fixture. */
const createReaderFixture = (entries: readonly IRepositoryEntry[]): IReaderFixture => {
  const entriesByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const getEntry = vi.fn<IRepositoryReader['getEntry']>((path) =>
    Promise.resolve(entriesByPath.get(path) ?? null),
  );
  const readFile = vi.fn<IRepositoryReader['readFile']>((path) => {
    const entry = entriesByPath.get(path);

    if (entry === undefined) {
      return Promise.reject(
        new RepositorySourceException({
          code: 'ENTRY_NOT_FOUND',
          operation: 'read-file',
          path,
          retryable: false,
        }),
      );
    }

    if (entry.type !== 'file') {
      return Promise.reject(
        new RepositorySourceException({
          code: 'ENTRY_NOT_FILE',
          operation: 'read-file',
          path,
          retryable: false,
        }),
      );
    }

    return Promise.resolve(new Uint8Array([1, 2, 3]));
  });
  const listEntries = vi.fn<IRepositoryReader['listEntries']>((): AsyncIterable<IRepositoryEntry> =>
    (async function* (): AsyncIterable<IRepositoryEntry> {
      await Promise.resolve();

      for (const entry of entries) {
        yield entry;
      }
    })(),
  );

  return { getEntry, listEntries, readFile, reader: { getEntry, listEntries, readFile } };
};

describe('createGitContentTransformationGuardRepositoryReader', () => {
  test('blocks guarded logical files before reading bytes and copies configured paths', async () => {
    const fixture = createReaderFixture([
      { path: GUARDED_PATH, type: 'file' },
      { path: ORDINARY_PATH, type: 'file' },
    ]);
    const guardedPaths = [GUARDED_PATH];
    const reader = createGitContentTransformationGuardRepositoryReader(
      fixture.reader,
      guardedPaths,
    );

    guardedPaths.length = 0;

    await expect(reader.readFile(GUARDED_PATH)).rejects.toBeInstanceOf(
      GitContentTransformUnsupportedException,
    );
    await expect(reader.readFile(GUARDED_PATH)).rejects.toMatchObject({
      code: 'SOURCE_UNAVAILABLE',
      message: 'The repository source is unavailable.',
      operation: 'read-file',
      path: GUARDED_PATH,
      retryable: false,
    });
    expect(fixture.getEntry).toHaveBeenCalledWith(GUARDED_PATH, undefined);
    expect(fixture.readFile).not.toHaveBeenCalledWith(GUARDED_PATH, undefined);
    await expect(reader.readFile(ORDINARY_PATH)).resolves.toStrictEqual(new Uint8Array([1, 2, 3]));
    expect(Object.isFrozen(reader)).toBe(true);
  });

  test('leaves lookup and listing unchanged without eagerly failing guarded paths', async () => {
    const entries: IRepositoryEntry[] = [
      { path: GUARDED_PATH, type: 'file' },
      { path: ORDINARY_PATH, type: 'file' },
    ];
    const fixture = createReaderFixture(entries);
    const reader = createGitContentTransformationGuardRepositoryReader(fixture.reader, [
      GUARDED_PATH,
    ]);

    await expect(reader.getEntry(GUARDED_PATH)).resolves.toStrictEqual(entries[0]);

    const listedEntries: IRepositoryEntry[] = [];

    for await (const entry of reader.listEntries()) {
      listedEntries.push(entry);
    }

    expect(listedEntries).toStrictEqual(entries);
    expect(fixture.readFile).not.toHaveBeenCalled();
  });

  test.each([
    [MISSING_PATH, null, 'ENTRY_NOT_FOUND'],
    [DIRECTORY_PATH, { path: DIRECTORY_PATH, type: 'directory' as const }, 'ENTRY_NOT_FILE'],
    [SYMLINK_PATH, { path: SYMLINK_PATH, type: 'symlink' as const }, 'ENTRY_NOT_FILE'],
  ] as const)(
    'preserves underlying read semantics for guarded nonfiles at %s',
    async (guardedPath, entry, errorCode) => {
      const fixture = createReaderFixture(entry === null ? [] : [entry]);
      const reader = createGitContentTransformationGuardRepositoryReader(fixture.reader, [
        guardedPath,
      ]);

      await expect(reader.readFile(guardedPath)).rejects.toMatchObject({ code: errorCode });
      expect(fixture.readFile).toHaveBeenCalledWith(guardedPath, undefined);
    },
  );

  test('preserves cancellation before and after guarded entry lookup', async () => {
    const fixture = createReaderFixture([{ path: GUARDED_PATH, type: 'file' }]);
    const reader = createGitContentTransformationGuardRepositoryReader(fixture.reader, [
      GUARDED_PATH,
    ]);
    const initialController = new AbortController();

    initialController.abort(new Error('private initial cancellation'));
    await expect(
      reader.readFile(GUARDED_PATH, { signal: initialController.signal }),
    ).rejects.toMatchObject({ code: 'ABORTED', path: GUARDED_PATH });
    expect(fixture.getEntry).not.toHaveBeenCalled();

    const laterController = new AbortController();

    fixture.getEntry.mockImplementationOnce((path) => {
      laterController.abort(new Error('private later cancellation'));
      return Promise.resolve({ path, type: 'file' });
    });
    await expect(
      reader.readFile(GUARDED_PATH, { signal: laterController.signal }),
    ).rejects.toMatchObject({ code: 'ABORTED', path: GUARDED_PATH });
    expect(fixture.readFile).not.toHaveBeenCalled();
  });

  test('rejects contradictory lookup paths and the repository root guard', async () => {
    const fixture = createReaderFixture([{ path: GUARDED_PATH, type: 'file' }]);

    fixture.getEntry.mockResolvedValueOnce({ path: ORDINARY_PATH, type: 'file' });
    const reader = createGitContentTransformationGuardRepositoryReader(fixture.reader, [
      GUARDED_PATH,
    ]);

    await expect(reader.readFile(GUARDED_PATH)).rejects.toMatchObject({
      code: 'INVALID_SOURCE_DATA',
      operation: 'read-file',
      path: GUARDED_PATH,
      retryable: false,
    });

    fixture.getEntry.mockResolvedValueOnce({
      path: GUARDED_PATH,
      type: 'unsupported',
    } as unknown as IRepositoryEntry);
    await expect(reader.readFile(GUARDED_PATH)).rejects.toMatchObject({
      code: 'INVALID_SOURCE_DATA',
      path: GUARDED_PATH,
    });
    expect(() =>
      createGitContentTransformationGuardRepositoryReader(fixture.reader, [REPOSITORY_ROOT]),
    ).toThrow(
      expect.objectContaining({
        code: 'INVALID_SOURCE_DATA',
        operation: 'create-reader',
        path: REPOSITORY_ROOT,
        retryable: false,
      }),
    );
  });
});
