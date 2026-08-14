// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { afterEach, describe, expect, test } from 'vitest';

import {
  createGitProcessEnvironment,
  executeGitProcess,
  type IGitProcessExecutor,
} from '../../git-process/index.js';
import { haveSameHostPathIdentity } from '../../host-path-identity/index.js';

import { areGitWorkingTreeIdentitiesEqual } from './comparator.js';
import { createGitWorkingTreeIdentityInspector } from './inspector.js';
import type { IGitWorkingTreeIdentity } from './types.js';

const temporaryDirectories: string[] = [];

// isolated real-Git fixture for identity tests
interface IIdentityGitFixture {
  readonly directory: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly hooksDirectory: string;
}

/** Creates one isolated temporary Git fixture. */
const createGitFixture = (): IIdentityGitFixture => {
  const temporaryDirectory = realpathSync(
    mkdtempSync(path.join(tmpdir(), 'moldea-cli-git-identity-')),
  );
  const homeDirectory = path.join(temporaryDirectory, 'home');
  const configDirectory = path.join(temporaryDirectory, 'config');
  const hooksDirectory = path.join(temporaryDirectory, 'hooks');

  for (const directory of [homeDirectory, configDirectory, hooksDirectory]) {
    mkdirSync(directory, { recursive: true });
  }

  temporaryDirectories.push(temporaryDirectory);

  return {
    directory: temporaryDirectory,
    environment: createGitProcessEnvironment({
      ...process.env,
      HOME: homeDirectory,
      XDG_CONFIG_HOME: configDirectory,
    }),
    hooksDirectory,
  };
};

/** Executes one fixture-owned Git operation without a platform shell. */
const executeFixtureGit = (
  fixture: IIdentityGitFixture,
  directory: string,
  arguments_: readonly string[],
): void => {
  execFileSync(
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
    { cwd: directory, env: fixture.environment, stdio: 'ignore' },
  );
};

/** Creates a real identity inspector with the fixture's isolated Git environment. */
const createIdentityInspector = (fixture: IIdentityGitFixture) => {
  const processExecutor: IGitProcessExecutor = (options) =>
    executeGitProcess({ ...options, environment: fixture.environment });

  return createGitWorkingTreeIdentityInspector(processExecutor);
};

/** Requires and returns one successful identity result. */
const requireIdentity = async (
  inspectIdentity: ReturnType<typeof createIdentityInspector>,
  repositoryRoot: string,
): Promise<IGitWorkingTreeIdentity> => {
  const result = await inspectIdentity({ repositoryRoot });

  expect(result.kind).toBe('inspected');

  if (result.kind !== 'inspected') {
    throw new Error('The real Git identity fixture was not inspected.');
  }

  return result.identity;
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe('Git working-tree identity integration', () => {
  test('distinguishes linked worktrees while retaining their shared common directory', async () => {
    const fixture = createGitFixture();
    const repositoryRoot = path.join(fixture.directory, 'main');
    const linkedWorktree = path.join(fixture.directory, 'linked-worktree');

    mkdirSync(repositoryRoot);
    executeFixtureGit(fixture, repositoryRoot, ['init']);
    executeFixtureGit(fixture, repositoryRoot, ['commit', '--allow-empty', '-m', 'initial']);
    executeFixtureGit(fixture, repositoryRoot, [
      'worktree',
      'add',
      '-b',
      'linked-test',
      linkedWorktree,
    ]);

    const inspectIdentity = createIdentityInspector(fixture);
    const mainIdentity = await requireIdentity(inspectIdentity, repositoryRoot);
    const linkedIdentity = await requireIdentity(inspectIdentity, linkedWorktree);

    expect(
      haveSameHostPathIdentity(mainIdentity.commonDirectory, linkedIdentity.commonDirectory),
    ).toBe(true);
    expect(mainIdentity.gitDirectory).not.toStrictEqual(linkedIdentity.gitDirectory);
    expect(mainIdentity.repositoryRoot).not.toStrictEqual(linkedIdentity.repositoryRoot);
    expect(areGitWorkingTreeIdentitiesEqual(mainIdentity, linkedIdentity)).toBe(false);
  });

  test('detects replacement at the same working-tree and Git-directory paths', async () => {
    const fixture = createGitFixture();
    const repositoryRoot = path.join(fixture.directory, 'repository');
    const replacedRepository = path.join(fixture.directory, 'replaced-repository');

    mkdirSync(repositoryRoot);
    executeFixtureGit(fixture, repositoryRoot, ['init']);

    const inspectIdentity = createIdentityInspector(fixture);
    const pinnedIdentity = await requireIdentity(inspectIdentity, repositoryRoot);

    renameSync(repositoryRoot, replacedRepository);
    mkdirSync(repositoryRoot);
    executeFixtureGit(fixture, repositoryRoot, ['init']);

    const replacementIdentity = await requireIdentity(inspectIdentity, repositoryRoot);

    expect(replacementIdentity.repositoryRoot.path).toBe(pinnedIdentity.repositoryRoot.path);
    expect(replacementIdentity.gitDirectory.path).toBe(pinnedIdentity.gitDirectory.path);
    expect(areGitWorkingTreeIdentitiesEqual(pinnedIdentity, replacementIdentity)).toBe(false);
  });
});
