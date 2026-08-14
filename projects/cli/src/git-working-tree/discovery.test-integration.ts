// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';
import { afterEach, describe, expect, test } from 'vitest';

import {
  createGitProcessEnvironment,
  executeGitProcess,
  type IGitProcessEnvironment,
  type IGitProcessExecutor,
} from '../git-process/index.js';

import { createGitWorkingTreeDiscovery } from './discovery.js';
import type { IGitWorkingTreeDiscovery, IGitWorkingTreeDiscoveryInput } from './types.js';

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

// isolated paths and environment shared by one real-Git fixture
interface IGitFixture {
  readonly directory: string;
  readonly environment: IGitProcessEnvironment;
  readonly hooksDirectory: string;
}

/** Creates one isolated temporary directory tracked for teardown. */
const createTemporaryDirectory = async (): Promise<string> => {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'moldea-cli-git-'));
  const directory = await realpath(temporaryDirectory);

  temporaryDirectories.push(directory);
  return directory;
};

/** Creates one temporary Git fixture isolated from user configuration and hooks. */
const createGitFixture = async (): Promise<IGitFixture> => {
  const directory = await createTemporaryDirectory();
  const homeDirectory = path.join(directory, 'home');
  const configDirectory = path.join(directory, 'config');
  const hooksDirectory = path.join(directory, 'hooks');

  await Promise.all(
    [homeDirectory, configDirectory, hooksDirectory].map((fixturePath) =>
      mkdir(fixturePath, { recursive: true }),
    ),
  );

  return Object.freeze({
    directory,
    environment: createGitProcessEnvironment({
      ...process.env,
      HOME: homeDirectory,
      XDG_CONFIG_HOME: configDirectory,
    }),
    hooksDirectory,
  });
};

/** Executes Git for fixture construction with deterministic test identity. */
const executeFixtureGit = async (
  fixture: IGitFixture,
  directory: string,
  arguments_: readonly string[],
): Promise<string> => {
  const { stdout } = await execFileAsync(
    'git',
    [
      '-c',
      'user.name=Moldea Test',
      '-c',
      'user.email=moldea@example.invalid',
      '-c',
      'commit.gpgSign=false',
      '-c',
      `core.hooksPath=${fixture.hooksDirectory}`,
      '-c',
      'init.defaultBranch=main',
      ...arguments_,
    ],
    { cwd: directory, encoding: 'utf8', env: fixture.environment },
  );

  return stdout;
};

/** Creates a discovery operation with isolated user-level Git configuration. */
const createIsolatedDiscovery = (fixture: IGitFixture): IGitWorkingTreeDiscovery => {
  const processExecutor: IGitProcessExecutor = (options) =>
    executeGitProcess({ ...options, environment: fixture.environment });

  return createGitWorkingTreeDiscovery(processExecutor);
};

/**
 * Asserts a discovered root using the host platform's normalized path representation.
 * @param discoverWorkingTree The discovery operation to exercise.
 * @param input The discovery input.
 * @param expectedRepositoryRoot The expected repository root.
 * @returns A promise that resolves after the discovered root is verified.
 */
const expectDiscoveredRepositoryRoot = async (
  discoverWorkingTree: IGitWorkingTreeDiscovery,
  input: IGitWorkingTreeDiscoveryInput,
  expectedRepositoryRoot: string,
): Promise<void> => {
  const result = await discoverWorkingTree(input);

  expect(result.kind).toBe('discovered');

  if (result.kind !== 'discovered') {
    throw new Error('Git working-tree discovery did not succeed.');
  }

  expect(path.normalize(result.repositoryRoot)).toBe(path.normalize(expectedRepositoryRoot));
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe('Git working-tree discovery integration', () => {
  test('discovers an unborn repository from root, nested, relative, and absolute paths', async () => {
    const fixture = await createGitFixture();
    const repositoryRoot = path.join(fixture.directory, 'répository\ufeff root');
    const nestedDirectory = path.join(repositoryRoot, 'nested', 'directory');

    await mkdir(repositoryRoot);
    await executeFixtureGit(fixture, repositoryRoot, ['init']);
    await mkdir(nestedDirectory, { recursive: true });

    const discoverWorkingTree = createIsolatedDiscovery(fixture);

    await expectDiscoveredRepositoryRoot(
      discoverWorkingTree,
      { invocationDirectory: repositoryRoot, repositoryDirectory: null },
      repositoryRoot,
    );
    await expectDiscoveredRepositoryRoot(
      discoverWorkingTree,
      { invocationDirectory: nestedDirectory, repositoryDirectory: null },
      repositoryRoot,
    );
    await expectDiscoveredRepositoryRoot(
      discoverWorkingTree,
      {
        invocationDirectory: fixture.directory,
        repositoryDirectory: path.relative(fixture.directory, nestedDirectory),
      },
      repositoryRoot,
    );
    await expectDiscoveredRepositoryRoot(
      discoverWorkingTree,
      {
        invocationDirectory: fixture.directory,
        repositoryDirectory: nestedDirectory,
      },
      repositoryRoot,
    );
  });

  test.runIf(process.platform !== 'win32')(
    'discovers a repository whose root ends in a carriage return',
    async () => {
      const fixture = await createGitFixture();
      const repositoryRoot = path.join(fixture.directory, 'repository\r');

      await mkdir(repositoryRoot);
      await executeFixtureGit(fixture, repositoryRoot, ['init']);

      await expectDiscoveredRepositoryRoot(
        createIsolatedDiscovery(fixture),
        { invocationDirectory: repositoryRoot, repositoryDirectory: null },
        repositoryRoot,
      );
    },
  );

  test('discovers a linked Git worktree without changing its repository state', async () => {
    const fixture = await createGitFixture();
    const repositoryRoot = path.join(fixture.directory, 'main');
    const linkedWorktree = path.join(fixture.directory, 'linked worktree');

    await mkdir(repositoryRoot);
    await executeFixtureGit(fixture, repositoryRoot, ['init']);
    await executeFixtureGit(fixture, repositoryRoot, ['commit', '--allow-empty', '-m', 'initial']);
    await executeFixtureGit(fixture, repositoryRoot, [
      'worktree',
      'add',
      '-b',
      'linked-test',
      linkedWorktree,
    ]);

    const statusBefore = await executeFixtureGit(fixture, linkedWorktree, [
      'status',
      '--porcelain=v2',
      '--untracked-files=all',
    ]);
    const headBefore = await executeFixtureGit(fixture, linkedWorktree, ['rev-parse', 'HEAD']);
    const discoverWorkingTree = createIsolatedDiscovery(fixture);

    await expectDiscoveredRepositoryRoot(
      discoverWorkingTree,
      { invocationDirectory: linkedWorktree, repositoryDirectory: null },
      linkedWorktree,
    );
    await expect(
      executeFixtureGit(fixture, linkedWorktree, [
        'status',
        '--porcelain=v2',
        '--untracked-files=all',
      ]),
    ).resolves.toBe(statusBefore);
    await expect(executeFixtureGit(fixture, linkedWorktree, ['rev-parse', 'HEAD'])).resolves.toBe(
      headBefore,
    );
  });

  test('ignores ambient repository and command-scoped Git redirection', async () => {
    const fixture = await createGitFixture();
    const repositoryRoot = path.join(fixture.directory, 'selected');
    const redirectedRoot = path.join(fixture.directory, 'redirected');

    await mkdir(repositoryRoot);
    await mkdir(redirectedRoot);
    await executeFixtureGit(fixture, repositoryRoot, ['init']);
    await executeFixtureGit(fixture, redirectedRoot, ['init']);

    const processExecutor: IGitProcessExecutor = (options) =>
      executeGitProcess({
        ...options,
        environment: {
          ...fixture.environment,
          GIT_CONFIG_COUNT: '1',
          GIT_CONFIG_KEY_0: 'core.bare',
          GIT_CONFIG_VALUE_0: 'true',
          GIT_DIR: path.join(redirectedRoot, '.git'),
          GIT_WORK_TREE: redirectedRoot,
        },
      });
    const discoverWorkingTree = createGitWorkingTreeDiscovery(processExecutor);

    await expectDiscoveredRepositoryRoot(
      discoverWorkingTree,
      { invocationDirectory: repositoryRoot, repositoryDirectory: null },
      repositoryRoot,
    );
  });

  test('rejects bare repositories and paths inside a Git directory as unusable work trees', async () => {
    const fixture = await createGitFixture();
    const bareRepository = path.join(fixture.directory, 'bare.git');
    const normalRepository = path.join(fixture.directory, 'normal');

    await executeFixtureGit(fixture, fixture.directory, ['init', '--bare', bareRepository]);
    await mkdir(normalRepository);
    await executeFixtureGit(fixture, normalRepository, ['init']);

    const discoverWorkingTree = createIsolatedDiscovery(fixture);

    await expect(
      discoverWorkingTree({ invocationDirectory: bareRepository, repositoryDirectory: null }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_WORK_TREE_REQUIRED', kind: 'failed' });
    await expect(
      discoverWorkingTree({
        invocationDirectory: path.join(normalRepository, '.git'),
        repositoryDirectory: null,
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_WORK_TREE_REQUIRED', kind: 'failed' });
  });

  test('rejects nonrepositories, missing paths, and regular files safely', async () => {
    const fixture = await createGitFixture();
    const regularFile = path.join(fixture.directory, 'regular-file.txt');
    const missingDirectory = path.join(fixture.directory, 'missing');

    await writeFile(regularFile, 'fixture', 'utf8');

    const discoverWorkingTree = createIsolatedDiscovery(fixture);

    await expect(
      discoverWorkingTree({ invocationDirectory: fixture.directory, repositoryDirectory: null }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_REPOSITORY_NOT_FOUND', kind: 'failed' });
    await expect(
      discoverWorkingTree({
        invocationDirectory: fixture.directory,
        repositoryDirectory: missingDirectory,
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_REPOSITORY_NOT_FOUND', kind: 'failed' });
    await expect(
      discoverWorkingTree({
        invocationDirectory: fixture.directory,
        repositoryDirectory: regularFile,
      }),
    ).resolves.toStrictEqual({ errorCode: 'GIT_REPOSITORY_NOT_FOUND', kind: 'failed' });
  });

  test('rejects a real sparse checkout without changing repository state', async () => {
    const fixture = await createGitFixture();
    const repositoryRoot = path.join(fixture.directory, 'sparse');

    await mkdir(repositoryRoot);
    await executeFixtureGit(fixture, repositoryRoot, ['init']);
    await executeFixtureGit(fixture, repositoryRoot, ['commit', '--allow-empty', '-m', 'initial']);
    await executeFixtureGit(fixture, repositoryRoot, ['sparse-checkout', 'init', '--cone']);

    const statusBefore = await executeFixtureGit(fixture, repositoryRoot, [
      'status',
      '--porcelain=v2',
      '--untracked-files=all',
    ]);
    const discoverWorkingTree = createIsolatedDiscovery(fixture);

    await expect(
      discoverWorkingTree({ invocationDirectory: repositoryRoot, repositoryDirectory: null }),
    ).resolves.toStrictEqual({
      errorCode: 'GIT_SPARSE_CHECKOUT_UNSUPPORTED',
      kind: 'failed',
    });
    await expect(
      executeFixtureGit(fixture, repositoryRoot, [
        'status',
        '--porcelain=v2',
        '--untracked-files=all',
      ]),
    ).resolves.toBe(statusBefore);
  });
});
