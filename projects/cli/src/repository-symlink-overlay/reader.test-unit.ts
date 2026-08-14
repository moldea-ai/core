// @vitest-environment node
import { describe, expect, test, vi } from 'vitest';

import {
  REPOSITORY_ROOT,
  parseRepositoryPath,
  type IRepositoryEntry,
  type IRepositoryPath,
  type IRepositoryReader,
} from '@moldea.ai/repository';

import { createGitSymlinkOverlayRepositoryReader } from './reader.js';

const LINK_PATH = parseRepositoryPath('/link');
const ORDINARY_PATH = parseRepositoryPath('/ordinary.txt');

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
  const readFile = vi.fn<IRepositoryReader['readFile']>(() =>
    Promise.resolve(new Uint8Array([1, 2, 3])),
  );
  const listEntries = vi.fn<IRepositoryReader['listEntries']>((): AsyncIterable<IRepositoryEntry> =>
    (async function* (): AsyncIterable<IRepositoryEntry> {
      await Promise.resolve();

      for (const entry of entries) {
        yield entry;
      }
    })(),
  );

  return {
    getEntry,
    listEntries,
    readFile,
    reader: { getEntry, listEntries, readFile },
  };
};

describe('createGitSymlinkOverlayRepositoryReader', () => {
  test('maps configured host files in exact lookup and recursive listing', async () => {
    const fixture = createReaderFixture([
      { path: LINK_PATH, type: 'file' },
      { path: ORDINARY_PATH, type: 'file' },
    ]);
    const symlinkPaths: IRepositoryPath[] = [LINK_PATH];
    const reader = createGitSymlinkOverlayRepositoryReader(fixture.reader, symlinkPaths);

    symlinkPaths.length = 0;

    await expect(reader.getEntry(LINK_PATH)).resolves.toStrictEqual({
      path: LINK_PATH,
      type: 'symlink',
    });
    await expect(reader.getEntry(ORDINARY_PATH)).resolves.toStrictEqual({
      path: ORDINARY_PATH,
      type: 'file',
    });

    const entries: IRepositoryEntry[] = [];

    for await (const entry of reader.listEntries()) {
      entries.push(entry);
    }

    expect(entries).toStrictEqual([
      { path: LINK_PATH, type: 'symlink' },
      { path: ORDINARY_PATH, type: 'file' },
    ]);
    expect(Object.isFrozen(reader)).toBe(true);
    expect(Object.isFrozen(entries[0])).toBe(true);
  });

  test('rejects overlaid reads without invoking the underlying file read', async () => {
    const fixture = createReaderFixture([{ path: LINK_PATH, type: 'file' }]);
    const reader = createGitSymlinkOverlayRepositoryReader(fixture.reader, [LINK_PATH]);

    await expect(reader.readFile(LINK_PATH)).rejects.toMatchObject({
      code: 'ENTRY_NOT_FILE',
      message: 'The requested repository entry is not a file.',
      operation: 'read-file',
      path: LINK_PATH,
      retryable: false,
    });
    expect(fixture.getEntry).toHaveBeenCalledWith(LINK_PATH, undefined);
    expect(fixture.readFile).not.toHaveBeenCalled();
  });

  test('preserves cancellation before an overlaid read or listing', async () => {
    const fixture = createReaderFixture([{ path: LINK_PATH, type: 'file' }]);
    const reader = createGitSymlinkOverlayRepositoryReader(fixture.reader, [LINK_PATH]);
    const controller = new AbortController();

    controller.abort(new Error('private cancellation reason'));

    await expect(reader.readFile(LINK_PATH, { signal: controller.signal })).rejects.toMatchObject({
      code: 'ABORTED',
      operation: 'read-file',
      path: LINK_PATH,
      retryable: false,
    });

    const iterator = reader.listEntries({ prefix: LINK_PATH, signal: controller.signal });

    await expect(iterator[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: 'ABORTED',
      operation: 'list-entries',
      path: LINK_PATH,
      retryable: false,
    });
    expect(fixture.getEntry).not.toHaveBeenCalled();
  });

  test('rejects listing an overlaid logical symlink as a directory', async () => {
    const fixture = createReaderFixture([{ path: LINK_PATH, type: 'file' }]);
    const reader = createGitSymlinkOverlayRepositoryReader(fixture.reader, [LINK_PATH]);
    const iterator = reader.listEntries({ prefix: LINK_PATH });

    await expect(iterator[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: 'ENTRY_NOT_DIRECTORY',
      message: 'The requested repository entry is not a directory.',
      operation: 'list-entries',
      path: LINK_PATH,
      retryable: false,
    });
    expect(fixture.getEntry).toHaveBeenCalledWith(LINK_PATH, undefined);
    expect(fixture.listEntries).not.toHaveBeenCalled();
  });

  test('rejects missing or contradictory overlay entries as invalid source data', async () => {
    const missingFixture = createReaderFixture([]);
    const missingReader = createGitSymlinkOverlayRepositoryReader(missingFixture.reader, [
      LINK_PATH,
    ]);

    await expect(missingReader.getEntry(LINK_PATH)).rejects.toMatchObject({
      code: 'INVALID_SOURCE_DATA',
      operation: 'get-entry',
      path: LINK_PATH,
      retryable: false,
    });
    await expect(missingReader.readFile(LINK_PATH)).rejects.toMatchObject({
      code: 'INVALID_SOURCE_DATA',
      message: 'The repository source returned invalid data.',
      operation: 'read-file',
      path: LINK_PATH,
      retryable: false,
    });

    const missingPrefixIterator = missingReader.listEntries({ prefix: LINK_PATH });

    await expect(missingPrefixIterator[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: 'INVALID_SOURCE_DATA',
      message: 'The repository source returned invalid data.',
      operation: 'list-entries',
      path: LINK_PATH,
      retryable: false,
    });

    const missingIterator = missingReader.listEntries();

    await expect(missingIterator[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: 'INVALID_SOURCE_DATA',
      operation: 'list-entries',
      path: LINK_PATH,
      retryable: false,
    });

    const contradictoryFixture = createReaderFixture([{ path: LINK_PATH, type: 'symlink' }]);
    const contradictoryReader = createGitSymlinkOverlayRepositoryReader(
      contradictoryFixture.reader,
      [LINK_PATH],
    );

    await expect(contradictoryReader.getEntry(LINK_PATH)).rejects.toMatchObject({
      code: 'INVALID_SOURCE_DATA',
      operation: 'get-entry',
      path: LINK_PATH,
      retryable: false,
    });
    await expect(contradictoryReader.readFile(LINK_PATH)).rejects.toMatchObject({
      code: 'INVALID_SOURCE_DATA',
      operation: 'read-file',
      path: LINK_PATH,
      retryable: false,
    });

    const contradictoryIterator = contradictoryReader.listEntries({ prefix: LINK_PATH });

    await expect(contradictoryIterator[Symbol.asyncIterator]().next()).rejects.toMatchObject({
      code: 'INVALID_SOURCE_DATA',
      operation: 'list-entries',
      path: LINK_PATH,
      retryable: false,
    });
  });

  test('rejects the repository root as an overlay path', () => {
    const fixture = createReaderFixture([]);

    expect(() =>
      createGitSymlinkOverlayRepositoryReader(fixture.reader, [REPOSITORY_ROOT]),
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
