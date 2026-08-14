// @vitest-environment node
import { Buffer } from 'node:buffer';
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';

import type { IGitStreamingProcessExecutor } from '../../git-process/index.js';

import { createGitInventoryBoundaryInspector } from './boundary-inspector.js';
import { planGitInventoryOwnershipPath } from './path-planner.js';
import type {
  IGitInventoryOwnershipLstat,
  IGitInventoryOwnershipPathPlan,
  IGitInventoryOwnershipReadDirectory,
  IGitInventoryOwnershipStatistics,
} from './types.js';

const ENCODER = new TextEncoder();
const REPOSITORY_ROOT = path.resolve('selected-repository');

type IFilesystemEntryType = 'directory' | 'file' | 'symlink';

/** Creates the no-follow statistics used by deterministic filesystem fixtures. */
const createStatistics = (
  entryType: IFilesystemEntryType,
  inode: bigint,
): IGitInventoryOwnershipStatistics => ({
  dev: 1n,
  ino: inode,
  isDirectory: () => entryType === 'directory',
  isFile: () => entryType === 'file',
  isSymbolicLink: () => entryType === 'symlink',
});

/** Creates injectable raw-directory and no-follow stat fixtures. */
const createFilesystem = (
  directories: Readonly<Record<string, readonly string[]>>,
  entries: Readonly<Record<string, IGitInventoryOwnershipStatistics>>,
): {
  readonly inspectHostPath: ReturnType<typeof vi.fn<IGitInventoryOwnershipLstat>>;
  readonly readDirectory: ReturnType<typeof vi.fn<IGitInventoryOwnershipReadDirectory>>;
} => {
  const inspectHostPath = vi.fn<IGitInventoryOwnershipLstat>((hostPath) => {
    const statistics = entries[hostPath];

    if (statistics === undefined) {
      return Promise.reject(Object.assign(new Error('missing fixture path'), { code: 'ENOENT' }));
    }

    return Promise.resolve(statistics);
  });
  const readDirectory = vi.fn<IGitInventoryOwnershipReadDirectory>((hostPath) => {
    const names = directories[hostPath];

    if (names === undefined) {
      return Promise.reject(
        Object.assign(new Error('missing fixture directory'), { code: 'ENOENT' }),
      );
    }

    return Promise.resolve(names.map((name) => Buffer.from(name, 'utf8')));
  });

  return { inspectHostPath, readDirectory };
};

/** Plans one untracked path and fails the test fixture if its path is invalid. */
const createUntrackedPlan = (candidatePath: string): IGitInventoryOwnershipPathPlan => {
  const result = planGitInventoryOwnershipPath({ kind: 'untracked', path: candidatePath });

  if (result.kind === 'failed') {
    throw new Error('The ownership path fixture is invalid.');
  }

  return result.plan;
};

/** Creates a bounded streamed Git fixture returning one repository root. */
const createRootProcessExecutor = (
  repositoryRoot: string,
): ReturnType<typeof vi.fn<IGitStreamingProcessExecutor>> =>
  vi.fn<IGitStreamingProcessExecutor>((options) => {
    const stdout = ENCODER.encode(`${repositoryRoot}\n`);

    if (stdout.byteLength > options.maxStdoutBytes) {
      return Promise.resolve(
        Object.freeze({ kind: 'failed' as const, reason: 'stdout-limit-exceeded' as const }),
      );
    }

    options.consumeStdout(stdout.subarray(0, 2));
    options.consumeStdout(stdout.subarray(2));

    return Promise.resolve(
      Object.freeze({
        kind: 'completed' as const,
        stderr: new Uint8Array(),
        stdoutBytes: stdout.byteLength,
      }),
    );
  });

describe('createGitInventoryBoundaryInspector', () => {
  test('classifies nested ownership once per exact cached directory prefix', async () => {
    const nestedDirectory = path.join(REPOSITORY_ROOT, 'nested');
    const ordinaryDirectory = path.join(REPOSITORY_ROOT, 'ordinary');
    const { inspectHostPath, readDirectory } = createFilesystem(
      {
        [REPOSITORY_ROOT]: ['nested', 'ordinary'],
        [nestedDirectory]: ['.git', 'first.txt', 'second.txt'],
        [ordinaryDirectory]: ['file.txt'],
      },
      {
        [nestedDirectory]: createStatistics('directory', 2n),
        [path.join(nestedDirectory, '.git')]: createStatistics('file', 3n),
        [ordinaryDirectory]: createStatistics('directory', 4n),
      },
    );
    const processExecutor = createRootProcessExecutor(nestedDirectory);
    const inspectBoundaries = createGitInventoryBoundaryInspector(
      processExecutor,
      inspectHostPath,
      readDirectory,
    );
    const result = await inspectBoundaries({
      maxMetadataBytes: 4096,
      plans: [
        createUntrackedPlan('nested/first.txt'),
        createUntrackedPlan('nested/second.txt'),
        createUntrackedPlan('ordinary/file.txt'),
      ],
      repositoryRoot: REPOSITORY_ROOT,
    });

    expect(result).toStrictEqual({
      gitMetadataBytes: ENCODER.encode(`${nestedDirectory}\n`).byteLength,
      kind: 'inspected',
      ownership: ['nested-repository', 'nested-repository', 'selected-repository'],
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(processExecutor).toHaveBeenCalledOnce();
    const processOptions = processExecutor.mock.calls[0]?.[0];

    expect(processOptions).toMatchObject({
      arguments: ['-C', nestedDirectory, 'rev-parse', '--show-toplevel'],
      maxStderrBytes: 4096,
      maxStdoutBytes: 4096,
    });
    expect(typeof processOptions?.consumeStdout).toBe('function');
    expect(readDirectory).toHaveBeenCalledTimes(3);
    expect(readDirectory).toHaveBeenCalledWith(REPOSITORY_ROOT);
    expect(readDirectory).toHaveBeenCalledWith(nestedDirectory);
    expect(readDirectory).toHaveBeenCalledWith(ordinaryDirectory);
    expect(inspectHostPath).not.toHaveBeenCalledWith(path.join(nestedDirectory, 'first.txt'));
  });

  test('classifies a nested root returned through a host path alias', async () => {
    const nestedDirectory = path.join(REPOSITORY_ROOT, 'nested');
    const nestedDirectoryAlias = path.resolve('host-alias', 'nested');
    const nestedStatistics = createStatistics('directory', 2n);
    const { inspectHostPath, readDirectory } = createFilesystem(
      {
        [REPOSITORY_ROOT]: ['nested'],
        [nestedDirectory]: ['.git', 'file.txt'],
      },
      {
        [nestedDirectory]: nestedStatistics,
        [nestedDirectoryAlias]: nestedStatistics,
        [path.join(nestedDirectory, '.git')]: createStatistics('directory', 3n),
      },
    );
    const inspectBoundaries = createGitInventoryBoundaryInspector(
      createRootProcessExecutor(nestedDirectoryAlias),
      inspectHostPath,
      readDirectory,
    );

    await expect(
      inspectBoundaries({
        maxMetadataBytes: 4096,
        plans: [createUntrackedPlan('nested/file.txt')],
        repositoryRoot: REPOSITORY_ROOT,
      }),
    ).resolves.toStrictEqual({
      gitMetadataBytes: ENCODER.encode(`${nestedDirectoryAlias}\n`).byteLength,
      kind: 'inspected',
      ownership: ['nested-repository'],
    });
    expect(inspectHostPath).toHaveBeenCalledWith(nestedDirectoryAlias);
  });

  test('requires a trailing-slash directory record to resolve to a nested boundary', async () => {
    const ordinaryDirectory = path.join(REPOSITORY_ROOT, 'ordinary');
    const { inspectHostPath, readDirectory } = createFilesystem(
      {
        [REPOSITORY_ROOT]: ['ordinary'],
        [ordinaryDirectory]: [],
      },
      {
        [ordinaryDirectory]: createStatistics('directory', 2n),
      },
    );
    const inspectBoundaries = createGitInventoryBoundaryInspector(
      vi.fn<IGitStreamingProcessExecutor>(),
      inspectHostPath,
      readDirectory,
    );

    await expect(
      inspectBoundaries({
        maxMetadataBytes: 4096,
        plans: [createUntrackedPlan('ordinary/')],
        repositoryRoot: REPOSITORY_ROOT,
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
  });

  test('never descends through a symlinked candidate ancestor', async () => {
    const linkPath = path.join(REPOSITORY_ROOT, 'link');
    const { inspectHostPath, readDirectory } = createFilesystem(
      { [REPOSITORY_ROOT]: ['link'] },
      { [linkPath]: createStatistics('symlink', 2n) },
    );
    const processExecutor = vi.fn<IGitStreamingProcessExecutor>();
    const inspectBoundaries = createGitInventoryBoundaryInspector(
      processExecutor,
      inspectHostPath,
      readDirectory,
    );

    await expect(
      inspectBoundaries({
        maxMetadataBytes: 4096,
        plans: [createUntrackedPlan('link/private.txt')],
        repositoryRoot: REPOSITORY_ROOT,
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
    expect(readDirectory).not.toHaveBeenCalledWith(linkPath);
    expect(processExecutor).not.toHaveBeenCalled();
  });

  test('rejects a host-resolved alias for a non-exact Git control marker', async () => {
    const nestedDirectory = path.join(REPOSITORY_ROOT, 'nested');
    const gitControlPath = path.join(nestedDirectory, '.git');
    const { inspectHostPath, readDirectory } = createFilesystem(
      {
        [REPOSITORY_ROOT]: ['nested'],
        [nestedDirectory]: ['.GIT', 'file.txt'],
      },
      {
        [nestedDirectory]: createStatistics('directory', 2n),
        [gitControlPath]: createStatistics('directory', 3n),
      },
    );
    const processExecutor = vi.fn<IGitStreamingProcessExecutor>();
    const inspectBoundaries = createGitInventoryBoundaryInspector(
      processExecutor,
      inspectHostPath,
      readDirectory,
    );

    await expect(
      inspectBoundaries({
        maxMetadataBytes: 4096,
        plans: [createUntrackedPlan('nested/file.txt')],
        repositoryRoot: REPOSITORY_ROOT,
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
    expect(processExecutor).not.toHaveBeenCalled();
  });

  test('rejects an exact Git control marker that is itself a symlink', async () => {
    const nestedDirectory = path.join(REPOSITORY_ROOT, 'nested');
    const { inspectHostPath, readDirectory } = createFilesystem(
      {
        [REPOSITORY_ROOT]: ['nested'],
        [nestedDirectory]: ['.git', 'file.txt'],
      },
      {
        [nestedDirectory]: createStatistics('directory', 2n),
        [path.join(nestedDirectory, '.git')]: createStatistics('symlink', 3n),
      },
    );
    const processExecutor = vi.fn<IGitStreamingProcessExecutor>();
    const inspectBoundaries = createGitInventoryBoundaryInspector(
      processExecutor,
      inspectHostPath,
      readDirectory,
    );

    await expect(
      inspectBoundaries({
        maxMetadataBytes: 4096,
        plans: [createUntrackedPlan('nested/file.txt')],
        repositoryRoot: REPOSITORY_ROOT,
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
    expect(processExecutor).not.toHaveBeenCalled();
  });

  test('rejects a directory identity change observed during traversal', async () => {
    const nestedDirectory = path.join(REPOSITORY_ROOT, 'nested');
    const inspectHostPath = vi
      .fn<IGitInventoryOwnershipLstat>()
      .mockResolvedValueOnce(createStatistics('directory', 2n))
      .mockResolvedValueOnce(createStatistics('directory', 3n));
    const readDirectory = vi.fn<IGitInventoryOwnershipReadDirectory>((hostPath) =>
      Promise.resolve(
        (hostPath === REPOSITORY_ROOT ? ['nested'] : ['file.txt']).map((name) =>
          Buffer.from(name, 'utf8'),
        ),
      ),
    );
    const processExecutor = vi.fn<IGitStreamingProcessExecutor>();
    const inspectBoundaries = createGitInventoryBoundaryInspector(
      processExecutor,
      inspectHostPath,
      readDirectory,
    );

    await expect(
      inspectBoundaries({
        maxMetadataBytes: 4096,
        plans: [createUntrackedPlan('nested/file.txt')],
        repositoryRoot: REPOSITORY_ROOT,
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
    expect(readDirectory).toHaveBeenCalledWith(nestedDirectory);
    expect(processExecutor).not.toHaveBeenCalled();
  });

  test('charges nested-root stdout to the remaining metadata budget', async () => {
    const nestedDirectory = path.join(REPOSITORY_ROOT, 'nested');
    const { inspectHostPath, readDirectory } = createFilesystem(
      {
        [REPOSITORY_ROOT]: ['nested'],
        [nestedDirectory]: ['.git', 'file.txt'],
      },
      {
        [nestedDirectory]: createStatistics('directory', 2n),
        [path.join(nestedDirectory, '.git')]: createStatistics('directory', 3n),
      },
    );
    const processExecutor = createRootProcessExecutor(nestedDirectory);
    const inspectBoundaries = createGitInventoryBoundaryInspector(
      processExecutor,
      inspectHostPath,
      readDirectory,
    );

    await expect(
      inspectBoundaries({
        maxMetadataBytes: 1,
        plans: [createUntrackedPlan('nested/file.txt')],
        repositoryRoot: REPOSITORY_ROOT,
      }),
    ).resolves.toStrictEqual({ errorCode: 'RESOURCE_LIMIT_EXCEEDED', kind: 'failed' });
    expect(processExecutor).toHaveBeenCalledWith(expect.objectContaining({ maxStdoutBytes: 1 }));
  });

  test('shares the remaining metadata budget across independent nested boundaries', async () => {
    const firstNestedDirectory = path.join(REPOSITORY_ROOT, 'first-nested');
    const secondNestedDirectory = path.join(REPOSITORY_ROOT, 'second-nested');
    const { inspectHostPath, readDirectory } = createFilesystem(
      {
        [REPOSITORY_ROOT]: ['first-nested', 'second-nested'],
        [firstNestedDirectory]: ['.git', 'file.txt'],
        [secondNestedDirectory]: ['.git', 'file.txt'],
      },
      {
        [firstNestedDirectory]: createStatistics('directory', 2n),
        [path.join(firstNestedDirectory, '.git')]: createStatistics('directory', 3n),
        [secondNestedDirectory]: createStatistics('directory', 4n),
        [path.join(secondNestedDirectory, '.git')]: createStatistics('directory', 5n),
      },
    );
    const firstOutput = ENCODER.encode(`${firstNestedDirectory}\n`);
    const secondOutput = ENCODER.encode(`${secondNestedDirectory}\n`);
    const maxMetadataBytes = firstOutput.byteLength + secondOutput.byteLength - 1;
    const processExecutor = vi.fn<IGitStreamingProcessExecutor>((options) => {
      const directory = options.arguments[1];
      const stdout = directory === firstNestedDirectory ? firstOutput : secondOutput;

      if (stdout.byteLength > options.maxStdoutBytes) {
        return Promise.resolve(
          Object.freeze({ kind: 'failed' as const, reason: 'stdout-limit-exceeded' as const }),
        );
      }

      options.consumeStdout(stdout);

      return Promise.resolve(
        Object.freeze({
          kind: 'completed' as const,
          stderr: new Uint8Array(),
          stdoutBytes: stdout.byteLength,
        }),
      );
    });
    const inspectBoundaries = createGitInventoryBoundaryInspector(
      processExecutor,
      inspectHostPath,
      readDirectory,
    );

    await expect(
      inspectBoundaries({
        maxMetadataBytes,
        plans: [
          createUntrackedPlan('first-nested/file.txt'),
          createUntrackedPlan('second-nested/file.txt'),
        ],
        repositoryRoot: REPOSITORY_ROOT,
      }),
    ).resolves.toStrictEqual({ errorCode: 'RESOURCE_LIMIT_EXCEEDED', kind: 'failed' });
    expect(processExecutor).toHaveBeenCalledTimes(2);
    expect(processExecutor.mock.calls[0]?.[0].maxStdoutBytes).toBe(maxMetadataBytes);
    expect(processExecutor.mock.calls[1]?.[0].maxStdoutBytes).toBe(secondOutput.byteLength - 1);
  });

  test.each([
    ['not-found', 'GIT_NOT_FOUND'],
    ['repository-not-found', 'GIT_OUTPUT_INVALID'],
    ['access-denied', 'GIT_ACCESS_DENIED'],
    ['stderr-limit-exceeded', 'GIT_OUTPUT_INVALID'],
    ['output-limit-exceeded', 'RESOURCE_LIMIT_EXCEEDED'],
    ['stdout-limit-exceeded', 'RESOURCE_LIMIT_EXCEEDED'],
    ['command-failed', 'GIT_COMMAND_FAILED'],
  ] as const)('maps nested-root Git failure %s', async (failureReason, errorCode) => {
    const nestedDirectory = path.join(REPOSITORY_ROOT, 'nested');
    const { inspectHostPath, readDirectory } = createFilesystem(
      {
        [REPOSITORY_ROOT]: ['nested'],
        [nestedDirectory]: ['.git', 'file.txt'],
      },
      {
        [nestedDirectory]: createStatistics('directory', 2n),
        [path.join(nestedDirectory, '.git')]: createStatistics('directory', 3n),
      },
    );
    const processExecutor = vi
      .fn<IGitStreamingProcessExecutor>()
      .mockResolvedValue(Object.freeze({ kind: 'failed', reason: failureReason }));
    const inspectBoundaries = createGitInventoryBoundaryInspector(
      processExecutor,
      inspectHostPath,
      readDirectory,
    );

    await expect(
      inspectBoundaries({
        maxMetadataBytes: 4096,
        plans: [createUntrackedPlan('nested/file.txt')],
        repositoryRoot: REPOSITORY_ROOT,
      }),
    ).resolves.toStrictEqual({ errorCode, kind: 'failed' });
  });

  test.each([
    ['EACCES', 'GIT_ACCESS_DENIED'],
    ['EPERM', 'GIT_ACCESS_DENIED'],
    ['ENOENT', 'GIT_OUTPUT_INVALID'],
    ['EIO', 'GIT_COMMAND_FAILED'],
  ] as const)('normalizes filesystem failure %s', async (code, errorCode) => {
    const inspectHostPath = vi.fn<IGitInventoryOwnershipLstat>();
    const readDirectory = vi
      .fn<IGitInventoryOwnershipReadDirectory>()
      .mockRejectedValue(Object.assign(new Error('private host diagnostic'), { code }));
    const inspectBoundaries = createGitInventoryBoundaryInspector(
      vi.fn<IGitStreamingProcessExecutor>(),
      inspectHostPath,
      readDirectory,
    );
    const result = await inspectBoundaries({
      maxMetadataBytes: 4096,
      plans: [createUntrackedPlan('nested/file.txt')],
      repositoryRoot: REPOSITORY_ROOT,
    });

    expect(result).toStrictEqual({ errorCode, kind: 'failed' });
    expect(JSON.stringify(result)).not.toContain('private');
  });

  test('rejects malformed, diagnostic, and contradictory nested-root output', async () => {
    const nestedDirectory = path.join(REPOSITORY_ROOT, 'nested');
    const { inspectHostPath, readDirectory } = createFilesystem(
      {
        [REPOSITORY_ROOT]: ['nested'],
        [nestedDirectory]: ['.git', 'file.txt'],
      },
      {
        [nestedDirectory]: createStatistics('directory', 2n),
        [path.join(nestedDirectory, '.git')]: createStatistics('directory', 3n),
      },
    );

    for (const fixture of [
      { stderr: new Uint8Array([1]), stdout: ENCODER.encode(`${nestedDirectory}\n`) },
      { stderr: new Uint8Array(), stdout: ENCODER.encode('relative\n') },
      { stderr: new Uint8Array(), stdout: ENCODER.encode(`${path.resolve('other')}\n`) },
    ]) {
      const processExecutor = vi.fn<IGitStreamingProcessExecutor>((options) => {
        options.consumeStdout(fixture.stdout);

        return Promise.resolve(
          Object.freeze({
            kind: 'completed' as const,
            stderr: fixture.stderr,
            stdoutBytes: fixture.stdout.byteLength,
          }),
        );
      });
      const inspectBoundaries = createGitInventoryBoundaryInspector(
        processExecutor,
        inspectHostPath,
        readDirectory,
      );

      await expect(
        inspectBoundaries({
          maxMetadataBytes: 4096,
          plans: [createUntrackedPlan('nested/file.txt')],
          repositoryRoot: REPOSITORY_ROOT,
        }),
      ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
    }
  });
});
