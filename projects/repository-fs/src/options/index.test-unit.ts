// @vitest-environment node
import path from 'node:path';
import { expectToThrowCode } from 'web-utils-kit';
import { describe, expect, test } from 'vitest';

import { RepositorySourceException, parseRepositoryPath } from '@moldea.ai/repository';

import { DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS } from '../constants/index.js';

import { normalizeFilesystemRepositoryOptions } from './index.js';

const rootDirectory = path.resolve('repository-root');

const createDirectoryOptions = (): Record<string, unknown> => ({
  rootDirectory,
  selection: { kind: 'directory' },
});

const expectInvalidSourceData = (candidate: unknown): void => {
  expectToThrowCode(
    () => normalizeFilesystemRepositoryOptions(candidate),
    'INVALID_SOURCE_DATA',
    'The repository source returned invalid data.',
  );
};

describe('filesystem repository option normalization', () => {
  test('publishes the frozen version 1 default limits', () => {
    expect(DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS).toStrictEqual({
      maxCachedBytes: 134_217_728,
      maxEntries: 100_000,
      maxFileBytes: 8_388_608,
    });
    expect(Object.isFrozen(DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS)).toBe(true);
  });

  test('normalizes directory selection with independent default limits', () => {
    const options = createDirectoryOptions();
    const normalizedOptions = normalizeFilesystemRepositoryOptions(options);

    expect(normalizedOptions).toStrictEqual({
      limits: DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS,
      rootDirectory,
      selection: { kind: 'directory' },
      signal: undefined,
    });
    expect(Object.isFrozen(normalizedOptions)).toBe(true);
    expect(Object.isFrozen(normalizedOptions.selection)).toBe(true);
    expect(Object.isFrozen(options)).toBe(false);
    expect(Object.isFrozen(options['selection'])).toBe(false);
  });

  test('copies, sorts, and freezes exact paths without mutating caller input', () => {
    const selectedPaths = [parseRepositoryPath('/zeta.txt'), parseRepositoryPath('/alpha.txt')];
    const selection = { kind: 'paths', paths: selectedPaths };
    const options = { rootDirectory, selection };
    const normalizedOptions = normalizeFilesystemRepositoryOptions(options);

    selectedPaths.reverse();
    selectedPaths.push(parseRepositoryPath('/later.txt'));
    selection.kind = 'directory';

    expect(normalizedOptions.selection).toStrictEqual({
      kind: 'paths',
      paths: [parseRepositoryPath('/alpha.txt'), parseRepositoryPath('/zeta.txt')],
    });
    expect(Object.isFrozen(normalizedOptions.selection)).toBe(true);

    if (normalizedOptions.selection.kind === 'paths') {
      expect(Object.isFrozen(normalizedOptions.selection.paths)).toBe(true);
    }
  });

  test('fills omitted limits and detaches configured values', () => {
    const limits = { maxEntries: 4 };
    const options = { ...createDirectoryOptions(), limits };
    const normalizedOptions = normalizeFilesystemRepositoryOptions(options);

    limits.maxEntries = 8;

    expect(normalizedOptions.limits).toStrictEqual({
      maxCachedBytes: 134_217_728,
      maxEntries: 4,
      maxFileBytes: 8_388_608,
    });
    expect(Object.isFrozen(normalizedOptions.limits)).toBe(true);
    expect(Object.isFrozen(limits)).toBe(false);
  });

  test('retains the live AbortSignal while freezing the option snapshot', () => {
    const controller = new AbortController();
    const normalizedOptions = normalizeFilesystemRepositoryOptions({
      ...createDirectoryOptions(),
      signal: controller.signal,
    });

    controller.abort('cancelled');

    expect(normalizedOptions.signal).toBe(controller.signal);
    expect(normalizedOptions.signal?.aborted).toBe(true);
    expect(Object.isFrozen(controller.signal)).toBe(false);
  });

  test.each([
    null,
    [],
    {},
    { selection: { kind: 'directory' } },
    { rootDirectory },
    { ...createDirectoryOptions(), unknown: true },
    { ...createDirectoryOptions(), rootDirectory: '' },
    { ...createDirectoryOptions(), rootDirectory: 'relative/path' },
    { ...createDirectoryOptions(), rootDirectory: `${rootDirectory}\0suffix` },
    { ...createDirectoryOptions(), rootDirectory: `${rootDirectory}\ud800` },
  ])('rejects invalid top-level options %o', (candidate) => {
    expectInvalidSourceData(candidate);
  });

  test('rejects symbol and non-enumerable unknown properties', () => {
    const symbolOptions = createDirectoryOptions();
    const nonEnumerableOptions = createDirectoryOptions();

    Object.defineProperty(symbolOptions, Symbol('unknown'), { value: true });
    Object.defineProperty(nonEnumerableOptions, 'unknown', { value: true });

    expectInvalidSourceData(symbolOptions);
    expectInvalidSourceData(nonEnumerableOptions);
  });

  test('maps hostile option access to the invalid-source contract', () => {
    const optionsWithThrowingGetter = createDirectoryOptions();
    const optionsWithThrowingOwnKeys = new Proxy(createDirectoryOptions(), {
      ownKeys: () => {
        throw new Error('unsafe boundary failure');
      },
    });

    Object.defineProperty(optionsWithThrowingGetter, 'selection', {
      enumerable: true,
      get: () => {
        throw new Error('unsafe boundary failure');
      },
    });

    expectInvalidSourceData(optionsWithThrowingGetter);
    expectInvalidSourceData(optionsWithThrowingOwnKeys);
  });

  test('does not trust a repository exception thrown by caller-owned option access', () => {
    const options = createDirectoryOptions();

    Object.defineProperty(options, 'selection', {
      enumerable: true,
      get: () => {
        throw new RepositorySourceException({
          code: 'ABORTED',
          operation: 'create-reader',
          path: null,
          retryable: true,
        });
      },
    });

    expectInvalidSourceData(options);
  });

  test('ignores inherited optional properties instead of treating them as configuration', () => {
    const inheritedConfiguration = Object.create({
      limits: { maxEntries: 2 },
      signal: { aborted: false },
    }) as Record<string, unknown>;

    inheritedConfiguration['rootDirectory'] = rootDirectory;
    inheritedConfiguration['selection'] = { kind: 'directory' };

    const normalizedOptions = normalizeFilesystemRepositoryOptions(inheritedConfiguration);

    expect(normalizedOptions.limits).toBe(DEFAULT_FILESYSTEM_REPOSITORY_RESOURCE_LIMITS);
    expect(normalizedOptions.signal).toBeUndefined();
  });

  test.each([
    null,
    [],
    {},
    { kind: 'unsupported' },
    { kind: 'directory', paths: [] },
    { kind: 'paths' },
    { kind: 'paths', paths: 'not-an-array' },
    { kind: 'paths', paths: [], unknown: true },
  ])('rejects invalid selection %o', (selection) => {
    expectInvalidSourceData({ rootDirectory, selection });
  });

  test('preserves the RepositoryPathException contract for forged paths', () => {
    expectToThrowCode(
      () =>
        normalizeFilesystemRepositoryOptions({
          rootDirectory,
          selection: { kind: 'paths', paths: ['/invalid/../path'] },
        }),
      'INVALID_REPOSITORY_PATH',
      'The repository path is invalid.',
    );
    expectToThrowCode(
      () =>
        normalizeFilesystemRepositoryOptions({
          rootDirectory,
          selection: { kind: 'paths', paths: [42] },
        }),
      'INVALID_REPOSITORY_PATH',
      'The repository path is invalid.',
    );
  });

  test('validates selected paths without invoking caller-owned array methods', () => {
    const selectedPaths = ['/invalid/../path'];

    Object.defineProperty(selectedPaths, 'map', {
      value: () => [parseRepositoryPath('/unchecked.txt')],
    });

    expectToThrowCode(
      () =>
        normalizeFilesystemRepositoryOptions({
          rootDirectory,
          selection: { kind: 'paths', paths: selectedPaths },
        }),
      'INVALID_REPOSITORY_PATH',
      'The repository path is invalid.',
    );
  });

  test('rejects sparse selected-path arrays', () => {
    expectInvalidSourceData({
      rootDirectory,
      selection: { kind: 'paths', paths: new Array(1) },
    });
  });

  test('rejects the root path and exact duplicate selected paths', () => {
    expectInvalidSourceData({
      rootDirectory,
      selection: { kind: 'paths', paths: [parseRepositoryPath('/')] },
    });
    expectInvalidSourceData({
      rootDirectory,
      selection: {
        kind: 'paths',
        paths: [parseRepositoryPath('/same'), parseRepositoryPath('/same')],
      },
    });
  });

  test.each(['/.git', '/nested/.git/config'])(
    'rejects the reserved control path %s',
    (selectedPath) => {
      const repositoryPath = parseRepositoryPath(selectedPath);

      expectInvalidSourceData({
        rootDirectory,
        selection: { kind: 'paths', paths: [repositoryPath] },
      });

      expect(() =>
        normalizeFilesystemRepositoryOptions({
          rootDirectory,
          selection: { kind: 'paths', paths: [repositoryPath] },
        }),
      ).toThrow(expect.objectContaining({ path: repositoryPath, retryable: false }));
    },
  );

  test.each(['/.github', '/.gitignore', '/nested/.gitattributes'])(
    'allows a non-control path %s',
    (selectedPath) => {
      const repositoryPath = parseRepositoryPath(selectedPath);
      const normalizedOptions = normalizeFilesystemRepositoryOptions({
        rootDirectory,
        selection: { kind: 'paths', paths: [repositoryPath] },
      });

      expect(normalizedOptions.selection).toStrictEqual({
        kind: 'paths',
        paths: [repositoryPath],
      });
    },
  );

  test.each([0, -1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, null, '1'])(
    'rejects invalid configured limit %o',
    (configuredLimit) => {
      expectInvalidSourceData({
        ...createDirectoryOptions(),
        limits: { maxEntries: configuredLimit },
      });
    },
  );

  test.each([null, [], { unknown: 1 }])('rejects invalid limits object %o', (limits) => {
    expectInvalidSourceData({ ...createDirectoryOptions(), limits });
  });

  test('rejects a signal-shaped object that is not an AbortSignal', () => {
    expectInvalidSourceData({
      ...createDirectoryOptions(),
      signal: { aborted: false },
    });
  });
});
