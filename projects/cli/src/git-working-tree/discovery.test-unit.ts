// @vitest-environment node
import path from 'node:path';
import { describe, expect, test, vi } from 'vitest';

import type { IGitProcessExecutor, IGitProcessFailureReason } from '../git-process/index.js';
import type { IGitVersionPreflight } from '../git-version/index.js';

import { MAX_GIT_DISCOVERY_OUTPUT_BYTES } from './constants.js';
import { createGitWorkingTreeDiscovery } from './discovery.js';
import type { IGitStartingDirectoryInspector } from './types.js';

const ENCODER = new TextEncoder();
const STARTING_DIRECTORY = path.resolve('workspace', 'nested');
const REPOSITORY_ROOT = path.resolve('workspace');

/** Creates one immutable completed Git process result. */
const createCompletedResult = (stdout: string, stderr = '') =>
  Object.freeze({
    kind: 'completed' as const,
    stderr: ENCODER.encode(stderr),
    stdout: ENCODER.encode(stdout),
  });

/** Creates the default successful starting-directory inspector. */
const createStartingDirectoryInspector = (): ReturnType<
  typeof vi.fn<IGitStartingDirectoryInspector>
> =>
  vi
    .fn<IGitStartingDirectoryInspector>()
    .mockResolvedValueOnce(Object.freeze({ directory: STARTING_DIRECTORY, kind: 'found' }))
    .mockResolvedValueOnce(Object.freeze({ directory: REPOSITORY_ROOT, kind: 'found' }));

/** Creates the default supported Git version preflight. */
const createVersionPreflight = (): ReturnType<typeof vi.fn<IGitVersionPreflight>> =>
  vi.fn<IGitVersionPreflight>().mockResolvedValue(
    Object.freeze({
      kind: 'supported',
      version: Object.freeze({ major: 2, minor: 30, patch: 0 }),
    }),
  );

describe('createGitWorkingTreeDiscovery', () => {
  test('discovers one accessible nonsparse working tree in the required order', async () => {
    const processExecutor = vi
      .fn<IGitProcessExecutor>()
      .mockResolvedValueOnce(createCompletedResult('true\n'))
      .mockResolvedValueOnce(createCompletedResult(`${REPOSITORY_ROOT}\n`))
      .mockResolvedValueOnce(createCompletedResult('false\n'));
    const startingDirectoryInspector = createStartingDirectoryInspector();
    const gitVersionPreflight = createVersionPreflight();
    const discoverWorkingTree = createGitWorkingTreeDiscovery(
      processExecutor,
      startingDirectoryInspector,
      gitVersionPreflight,
    );

    const result = await discoverWorkingTree({
      invocationDirectory: STARTING_DIRECTORY,
      repositoryDirectory: null,
    });

    expect(result).toStrictEqual({ kind: 'discovered', repositoryRoot: REPOSITORY_ROOT });
    expect(Object.isFrozen(result)).toBe(true);
    expect(startingDirectoryInspector).toHaveBeenNthCalledWith(1, {
      invocationDirectory: STARTING_DIRECTORY,
      repositoryDirectory: null,
    });
    expect(startingDirectoryInspector).toHaveBeenNthCalledWith(2, {
      invocationDirectory: STARTING_DIRECTORY,
      repositoryDirectory: REPOSITORY_ROOT,
    });
    expect(processExecutor.mock.calls).toStrictEqual([
      [
        {
          arguments: ['-C', STARTING_DIRECTORY, 'rev-parse', '--is-inside-work-tree'],
          maxBufferBytes: MAX_GIT_DISCOVERY_OUTPUT_BYTES,
        },
      ],
      [
        {
          arguments: ['-C', STARTING_DIRECTORY, 'rev-parse', '--show-toplevel'],
          maxBufferBytes: MAX_GIT_DISCOVERY_OUTPUT_BYTES,
        },
      ],
      [
        {
          arguments: [
            '-C',
            REPOSITORY_ROOT,
            'config',
            '--type=bool',
            '--default=false',
            '--get',
            'core.sparseCheckout',
          ],
          maxBufferBytes: MAX_GIT_DISCOVERY_OUTPUT_BYTES,
        },
      ],
    ]);
    expect(gitVersionPreflight).toHaveBeenCalledOnce();
  });

  test.each([
    ['not-found', 'GIT_NOT_FOUND'],
    ['repository-not-found', 'GIT_REPOSITORY_NOT_FOUND'],
    ['access-denied', 'GIT_ACCESS_DENIED'],
    ['output-limit-exceeded', 'GIT_OUTPUT_INVALID'],
    ['command-failed', 'GIT_COMMAND_FAILED'],
  ] as const)(
    'maps initial Git failure %s without leaking diagnostics',
    async (reason, errorCode) => {
      const processExecutor = vi
        .fn<IGitProcessExecutor>()
        .mockResolvedValue(
          Object.freeze({ kind: 'failed', reason: reason satisfies IGitProcessFailureReason }),
        );
      const startingDirectoryInspector = createStartingDirectoryInspector();
      const result = await createGitWorkingTreeDiscovery(
        processExecutor,
        startingDirectoryInspector,
        createVersionPreflight(),
      )({ invocationDirectory: STARTING_DIRECTORY, repositoryDirectory: null });

      expect(result).toStrictEqual({ errorCode, kind: 'failed' });
      expect(Object.isFrozen(result)).toBe(true);
      expect(JSON.stringify(result)).not.toContain(STARTING_DIRECTORY);
    },
  );

  test('rejects a non-working-tree repository before root resolution', async () => {
    const processExecutor = vi
      .fn<IGitProcessExecutor>()
      .mockResolvedValue(createCompletedResult('false\n'));
    const gitVersionPreflight = createVersionPreflight();

    await expect(
      createGitWorkingTreeDiscovery(
        processExecutor,
        createStartingDirectoryInspector(),
        gitVersionPreflight,
      )({ invocationDirectory: STARTING_DIRECTORY, repositoryDirectory: null }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_WORK_TREE_REQUIRED', kind: 'failed' });
    expect(processExecutor).toHaveBeenCalledOnce();
    expect(gitVersionPreflight).not.toHaveBeenCalled();
  });

  test.each([
    [createCompletedResult('maybe\n'), 'GIT_OUTPUT_INVALID'],
    [createCompletedResult('true\n', 'private diagnostic'), 'GIT_OUTPUT_INVALID'],
  ] as const)('rejects invalid initial Git output', async (processResult, errorCode) => {
    const processExecutor = vi.fn<IGitProcessExecutor>().mockResolvedValue(processResult);

    await expect(
      createGitWorkingTreeDiscovery(
        processExecutor,
        createStartingDirectoryInspector(),
        createVersionPreflight(),
      )({ invocationDirectory: STARTING_DIRECTORY, repositoryDirectory: null }),
    ).resolves.toStrictEqual({ errorCode, kind: 'failed' });
  });

  test('rejects an invalid repository root before revalidation or version preflight', async () => {
    const processExecutor = vi
      .fn<IGitProcessExecutor>()
      .mockResolvedValueOnce(createCompletedResult('true\n'))
      .mockResolvedValueOnce(createCompletedResult('relative-root\n'));
    const startingDirectoryInspector = createStartingDirectoryInspector();
    const gitVersionPreflight = createVersionPreflight();

    await expect(
      createGitWorkingTreeDiscovery(
        processExecutor,
        startingDirectoryInspector,
        gitVersionPreflight,
      )({ invocationDirectory: STARTING_DIRECTORY, repositoryDirectory: null }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
    expect(startingDirectoryInspector).toHaveBeenCalledOnce();
    expect(gitVersionPreflight).not.toHaveBeenCalled();
  });

  test('returns a safe failure when the discovered root is no longer accessible', async () => {
    const processExecutor = vi
      .fn<IGitProcessExecutor>()
      .mockResolvedValueOnce(createCompletedResult('true\n'))
      .mockResolvedValueOnce(createCompletedResult(`${REPOSITORY_ROOT}\n`));
    const startingDirectoryInspector = vi
      .fn<IGitStartingDirectoryInspector>()
      .mockResolvedValueOnce(Object.freeze({ directory: STARTING_DIRECTORY, kind: 'found' }))
      .mockResolvedValueOnce({ errorCode: 'GIT_REPOSITORY_NOT_FOUND', kind: 'failed' });
    const gitVersionPreflight = createVersionPreflight();

    const result = await createGitWorkingTreeDiscovery(
      processExecutor,
      startingDirectoryInspector,
      gitVersionPreflight,
    )({ invocationDirectory: STARTING_DIRECTORY, repositoryDirectory: null });

    expect(result).toStrictEqual({ errorCode: 'GIT_REPOSITORY_NOT_FOUND', kind: 'failed' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(gitVersionPreflight).not.toHaveBeenCalled();
  });

  test('stops before sparse-checkout inspection when version preflight fails', async () => {
    const processExecutor = vi
      .fn<IGitProcessExecutor>()
      .mockResolvedValueOnce(createCompletedResult('true\n'))
      .mockResolvedValueOnce(createCompletedResult(`${REPOSITORY_ROOT}\n`));
    const gitVersionPreflight = vi
      .fn<IGitVersionPreflight>()
      .mockResolvedValue(Object.freeze({ errorCode: 'GIT_VERSION_UNSUPPORTED', kind: 'failed' }));

    await expect(
      createGitWorkingTreeDiscovery(
        processExecutor,
        createStartingDirectoryInspector(),
        gitVersionPreflight,
      )({ invocationDirectory: STARTING_DIRECTORY, repositoryDirectory: null }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_VERSION_UNSUPPORTED', kind: 'failed' });
    expect(processExecutor).toHaveBeenCalledTimes(2);
  });

  test('rejects sparse checkout after successful version preflight', async () => {
    const processExecutor = vi
      .fn<IGitProcessExecutor>()
      .mockResolvedValueOnce(createCompletedResult('true\n'))
      .mockResolvedValueOnce(createCompletedResult(`${REPOSITORY_ROOT}\n`))
      .mockResolvedValueOnce(createCompletedResult('true\n'));

    await expect(
      createGitWorkingTreeDiscovery(
        processExecutor,
        createStartingDirectoryInspector(),
        createVersionPreflight(),
      )({ invocationDirectory: STARTING_DIRECTORY, repositoryDirectory: null }),
    ).resolves.toStrictEqual({
      errorCode: 'GIT_SPARSE_CHECKOUT_UNSUPPORTED',
      kind: 'failed',
    });
  });

  test('rejects malformed sparse-checkout configuration output', async () => {
    const processExecutor = vi
      .fn<IGitProcessExecutor>()
      .mockResolvedValueOnce(createCompletedResult('true\n'))
      .mockResolvedValueOnce(createCompletedResult(`${REPOSITORY_ROOT}\n`))
      .mockResolvedValueOnce(createCompletedResult('invalid\n'));

    await expect(
      createGitWorkingTreeDiscovery(
        processExecutor,
        createStartingDirectoryInspector(),
        createVersionPreflight(),
      )({ invocationDirectory: STARTING_DIRECTORY, repositoryDirectory: null }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_OUTPUT_INVALID', kind: 'failed' });
  });

  test('returns a starting-directory failure without invoking Git', async () => {
    const processExecutor = vi.fn<IGitProcessExecutor>();
    const startingDirectoryInspector = vi
      .fn<IGitStartingDirectoryInspector>()
      .mockResolvedValue({ errorCode: 'GIT_REPOSITORY_NOT_FOUND', kind: 'failed' });

    const result = await createGitWorkingTreeDiscovery(
      processExecutor,
      startingDirectoryInspector,
      createVersionPreflight(),
    )({ invocationDirectory: STARTING_DIRECTORY, repositoryDirectory: null });

    expect(result).toStrictEqual({ errorCode: 'GIT_REPOSITORY_NOT_FOUND', kind: 'failed' });
    expect(Object.isFrozen(result)).toBe(true);
    expect(processExecutor).not.toHaveBeenCalled();
  });
});
